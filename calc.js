// ───────────────────────────────────────────────────────────────────────────
// CÁLCULO / MODELO
//
// Transforma la matriz "Evolución_Mensual" (ya calculada por el Sheet) en un
// modelo cómodo: un objeto por mes con KPIs, desglose por canal y por categoría,
// y la línea ADPD. También resuelve el "mes activo" desde Parámetros.
//
// Reglas de negocio (las hace el propio Sheet, las respetamos tal cual):
//  - El Resultado Operativo puede ser negativo → se muestra con su signo.
//  - ADPD es la línea de negocio LN-02 (atribución proporcional ya aplicada).
// ───────────────────────────────────────────────────────────────────────────

const Calc = (() => {
  // "  - Hotmart" → "- Hotmart"; colapsa espacios internos.
  function norm(label) {
    return String(label == null ? "" : label).replace(/\s+/g, " ").trim();
  }

  function num(v) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  // Serial de Excel (epoch 1899-12-30) → { anio, mes } (mes 1-12).
  function excelSerialToYM(serial) {
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const d = new Date(ms);
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  }

  function mesKey(anio, mes) {
    return `${anio}-${String(mes).padStart(2, "0")}`;
  }

  // Lee Parámetros → { mesActivo: 'YYYY-MM', anioFiscal }.
  function leerParametros(parametros) {
    const P = CONFIG.PARAMETROS;
    let anioFiscal = new Date().getFullYear();
    let mesActivo = null;

    for (const row of parametros.rows) {
      const etiqueta = norm(row[P.COL_ETIQUETA]);
      const valor = row[P.COL_VALOR];
      if (etiqueta === P.FILA_ANIO_FISCAL) anioFiscal = num(valor) || anioFiscal;
      if (etiqueta === P.FILA_MES_ACTIVO && valor != null && valor !== "") {
        if (typeof valor === "number") {
          const { anio, mes } = excelSerialToYM(valor);
          mesActivo = mesKey(anio, mes);
        } else {
          // Texto tipo "2026-06" o "2026-06-01"
          const m = String(valor).match(/(\d{4})-(\d{2})/);
          if (m) mesActivo = `${m[1]}-${m[2]}`;
        }
      }
    }
    return { mesActivo, anioFiscal };
  }

  // gviz devuelve fechas como el string "Date(2026,1,3)" (mes 0-based).
  // → { anio, mes (1-12), dia } o null si no matchea.
  function parseGvizDate(v) {
    if (typeof v !== "string") return null;
    const m = v.match(/Date\((\d+),(\d+),(\d+)/);
    if (!m) return null;
    return { anio: +m[1], mes: +m[2] + 1, dia: +m[3] };
  }

  // ── Ingresos acumulados día a día dentro de un mes ─────────────────────────
  // Suma el Neto (caja) de la pestaña Ingresos del mes `monthKey`, agrupado por
  // día, y lo devuelve acumulado: sirve para ver "cómo venimos en el mes".
  //   acumulado[i] = total de caja hasta el día (i+1) inclusive.
  // Si monthKey es null (vista YTD) o no hay datos, devuelve series vacías.
  function computeIngresosDiarios(ingresos, monthKey) {
    const I = CONFIG.POSICION.INGRESOS;
    const esMes = typeof monthKey === "string" && /^\d{4}-\d{2}$/.test(monthKey);
    const porDia = {}; // dia → monto del día
    if (ingresos && esMes) {
      for (const r of ingresos.rows) {
        if (r[I.COL_MES] !== monthKey) continue;
        const f = parseGvizDate(r[I.COL_FECHA]);
        if (!f || !f.dia) continue;
        porDia[f.dia] = (porDia[f.dia] || 0) + num(r[I.COL_NETO]);
      }
    }
    const dias = Object.keys(porDia).map(Number);
    const ultimoDia = dias.length ? Math.max(...dias) : 0;
    const acumulado = [];
    const montoDia = [];
    let acc = 0;
    for (let d = 1; d <= ultimoDia; d++) {
      acc += porDia[d] || 0;
      montoDia.push(porDia[d] || 0);
      acumulado.push(acc);
    }
    return { ultimoDia, montoDia, acumulado, total: acc };
  }

  // ── Evolución del detalle de egresos (por concepto, mes a mes) ─────────────
  // Agrupa la pestaña Egresos_Detalle por PROVEEDOR (p. ej. "Facebook Ads",
  // "Google Ads", "Claude") y arma, para cada concepto, su gasto por mes. Sirve
  // para comparar de un mes a otro si se gastó de más en un egreso puntual.
  // Devuelve { meses:['YYYY-MM'…], conceptos:[{label,total,porMes:{mes:monto}}] }
  // con los conceptos ordenados de mayor a menor gasto acumulado.
  function computeEgresosDetalleEvol(egresosDetalle) {
    const ED = CONFIG.POSICION.EGRESOS_DETALLE;
    const isMonth = (v) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
    const conceptos = {}; // label → { label, total, porMes }
    const mesesSet = new Set();

    if (egresosDetalle) {
      for (const r of egresosDetalle.rows) {
        const mes = r[ED.COL_MES];
        if (!isMonth(mes)) continue;
        const monto = num(r[ED.COL_MONTO]);
        if (!monto) continue;
        const label = norm(r[ED.COL_PROVEEDOR]) || norm(r[ED.COL_DESCRIPCION]) || "Sin detalle";
        mesesSet.add(mes);
        const c = conceptos[label] || (conceptos[label] = { label, total: 0, porMes: {} });
        c.total += monto;
        c.porMes[mes] = (c.porMes[mes] || 0) + monto;
      }
    }

    return {
      meses: [...mesesSet].sort(),
      conceptos: Object.values(conceptos).sort((a, b) => b.total - a.total),
    };
  }

  // ── Posición del mes ("¿Cuánto dinero tenemos?") ───────────────────────────
  // Reconstruye, desde las pestañas de detalle filtrando por la columna Mes,
  // los componentes que Jesús revisa semanalmente. `monthKey` = 'YYYY-MM' para
  // un mes; null = acumulado del año (suma todos los meses válidos).
  function computePosicion(tabs, monthKey) {
    const P = CONFIG.POSICION;
    const isMonth = (v) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
    // null → todos los meses válidos (ignora filas de totales como "TOTAL ADPD").
    const match = (v) => (monthKey ? v === monthKey : isMonth(v));

    let plataformas = 0, otros = 0, otrasPlataformas = 0, porCobrar = 0, egDetalle = 0, egExternos = 0;

    const I = P.INGRESOS;
    if (tabs.ingresos) {
      for (const r of tabs.ingresos.rows) {
        if (!match(r[I.COL_MES])) continue;
        const canal = norm(r[I.COL_CANAL]);
        const neto = num(r[I.COL_NETO]);
        if (I.CANALES_PLATAFORMA.includes(canal)) plataformas += neto;
        else if (canal === I.CANAL_OTROS) otros += neto;
      }
    }

    const C = P.CUENTAS;
    if (tabs.cuentas) {
      for (const r of tabs.cuentas.rows) {
        if (!match(r[C.COL_MES_ORIGEN])) continue;
        const estado = norm(r[C.COL_ESTADO]).toLowerCase();
        if (estado.startsWith("pendiente") && estado !== "pendiente-detalle") {
          porCobrar += num(r[C.COL_MONTO]);
        }
      }
    }

    // Otras plataformas: cuentas de Jesús, solo "Confirmado-Con movimiento".
    const CV = P.CUENTAS_VERIFICAR;
    if (tabs.cuentasVerificar) {
      for (const r of tabs.cuentasVerificar.rows) {
        if (!match(r[CV.COL_MES])) continue;
        if (norm(r[CV.COL_ESTADO]).toLowerCase().startsWith("confirmado-con")) {
          otrasPlataformas += num(r[CV.COL_MONTO]);
        }
      }
    }

    const ED = P.EGRESOS_DETALLE;
    if (tabs.egresosDetalle) {
      for (const r of tabs.egresosDetalle.rows) {
        if (!match(r[ED.COL_MES])) continue;
        egDetalle += num(r[ED.COL_MONTO]);
      }
    }

    const EX = P.EGRESOS_EXTERNOS;
    if (tabs.egresosExternos) {
      for (const r of tabs.egresosExternos.rows) {
        if (!match(r[EX.COL_MES])) continue;
        egExternos += num(r[EX.COL_MONTO]);
      }
    }

    const egresos = egDetalle + egExternos;
    const totalIngresos = plataformas + otros + otrasPlataformas + porCobrar;
    return {
      plataformas, otros, otrasPlataformas, porCobrar, egDetalle, egExternos, egresos,
      totalIngresos,
      neto: totalIngresos - egresos,
    };
  }

  // Construye el modelo completo a partir de las pestañas leídas.
  function buildModel({ evolucion, parametros, ingresos, cuentas, egresosDetalle, egresosExternos, cuentasVerificar }) {
    const E = CONFIG.EVOLUCION;
    const { mesActivo, anioFiscal } = leerParametros(parametros);

    // fila lógica → array de 12 valores mensuales; ytdRaw → acumulado del año
    const serie = {};
    const ytdRaw = {};
    for (const row of evolucion.rows) {
      const key = E.FILAS[norm(row[0])];
      if (!key) continue;
      serie[key] = E.MES_COLS.map((ci) => num(row[ci]));
      ytdRaw[key] = num(row[E.YTD_COL]);
    }

    const get = (key, i) => (serie[key] ? serie[key][i] : 0);
    const getYtd = (key) => (key in ytdRaw ? ytdRaw[key] : 0);

    // Un objeto por mes (Ene..Dic)
    const meses = E.MES_COLS.map((_, i) => {
      const mesNum = i + 1;
      return {
        key: mesKey(anioFiscal, mesNum),
        mesNum,
        nombre: CONFIG.MESES_ES[i],
        ingresosTotal: get("ingresosTotal", i),
        egresosTotal: get("egresosTotal", i),
        resultadoOperativo: get("resultadoOperativo", i),
        margen: get("margen", i),
        canales: E.CANALES.map((c) => ({ label: c.label, value: get(c.key, i) })),
        categorias: E.CATEGORIAS_EGRESO.map((c) => ({ label: c.label, value: get(c.key, i) })),
        adpd: {
          ingresos: get("adpdIngresos", i),
          egresos: get("adpdEgresos", i),
          resultado: get("adpdResultado", i),
          margen: get("adpdMargen", i),
        },
      };
    });

    // Acumulado del año (YTD): mismo "shape" que un objeto-mes, para que las
    // funciones de render lo consuman sin cambios.
    const ytd = {
      key: "YTD",
      mesNum: null,
      nombre: `Acumulado ${anioFiscal}`,
      ingresosTotal: getYtd("ingresosTotal"),
      egresosTotal: getYtd("egresosTotal"),
      resultadoOperativo: getYtd("resultadoOperativo"),
      margen: getYtd("margen"),
      canales: E.CANALES.map((c) => ({ label: c.label, value: getYtd(c.key) })),
      categorias: E.CATEGORIAS_EGRESO.map((c) => ({ label: c.label, value: getYtd(c.key) })),
      adpd: {
        ingresos: getYtd("adpdIngresos"),
        egresos: getYtd("adpdEgresos"),
        resultado: getYtd("adpdResultado"),
        margen: getYtd("adpdMargen"),
      },
    };

    // Meses con actividad (algún ingreso o egreso distinto de 0)
    const conDatos = meses.filter((m) => m.ingresosTotal !== 0 || m.egresosTotal !== 0);

    // Mes a seleccionar por defecto: el activo si tiene datos; si no, el último con datos.
    let defaultKey = mesActivo;
    const activoTieneDatos = conDatos.some((m) => m.key === mesActivo);
    if (!activoTieneDatos && conDatos.length) {
      defaultKey = conDatos[conDatos.length - 1].key;
    }

    return {
      anioFiscal,
      mesActivo,
      defaultKey,
      meses,                 // los 12
      mesesConDatos: conDatos,
      ytd,                   // acumulado del año (mismo shape que un mes)
      // Posición de caja del mes (o YTD si key=null). Se computa on-demand para
      // que recalcule al cambiar el mes sin re-leer el Sheet.
      getPosicion: (key) =>
        computePosicion({ ingresos, cuentas, egresosDetalle, egresosExternos, cuentasVerificar }, key),
      // Acumulado de caja día a día dentro del mes `key` (para "cómo venimos").
      getIngresosDiarios: (key) => computeIngresosDiarios(ingresos, key),
      // Detalle de egresos por concepto y mes (no depende del mes seleccionado:
      // siempre muestra todos los meses para comparar la evolución de cada gasto).
      getEgresosDetalleEvol: () => computeEgresosDetalleEvol(egresosDetalle),
      getMes: (key) => meses.find((m) => m.key === key) || null,
      // Mes anterior CON DATOS respecto de `key` (o null si es el primero).
      getPrevMes: (key) => {
        const pos = conDatos.findIndex((m) => m.key === key);
        return pos > 0 ? conDatos[pos - 1] : null;
      },
    };
  }

  // ── Alianza Rieznik (P&L 50/50 Jesús / Martín, por mes) ────────────────────
  // Rediseño jun-2026: la Alianza vive en 4 pestañas propias del Sheet. Acá se
  // lee la matriz Evolución_Alianza igual que Evolución_Mensual (los números
  // del P&L salen 1:1 del Sheet, sin re-calcular atribución) y, desde
  // Alianza_Detalle, se arma POR CADA MES la liquidación entre socios — la
  // pestaña Liquidación_Alianza del Sheet está fija al mes activo de
  // Parámetros, así que de ella solo se lee el Aporte de capital (constante).

  // Celda "mes" en cualquier formato que devuelva gviz ("Date(2026,5,1)",
  // serial de Excel o texto "YYYY-MM") → 'YYYY-MM', o null si no es un mes.
  function cellMesKey(v) {
    if (typeof v === "number") {
      const { anio, mes } = excelSerialToYM(v);
      return mesKey(anio, mes);
    }
    const g = parseGvizDate(v);
    if (g) return mesKey(g.anio, g.mes);
    const m = /^(\d{4})-(\d{2})/.exec(typeof v === "string" ? v.trim() : "");
    return m ? `${m[1]}-${m[2]}` : null;
  }

  function buildAlianza({ evolucion, detalle, liquidacion }, mesActivo) {
    const EA = CONFIG.EVOLUCION_ALIANZA;
    const D = CONFIG.ALIANZA_DETALLE;

    // 1) Matriz Evolución_Alianza → serie de 12 valores por clave lógica + YTD.
    const serie = {};
    const ytdRaw = {};
    let anio = null;
    for (const row of ((evolucion && evolucion.rows) || [])) {
      const key = EA.FILAS[norm(row[0])];
      if (key) {
        serie[key] = EA.MES_COLS.map((ci) => num(row[ci]));
        ytdRaw[key] = num(row[EA.YTD_COL]);
        continue;
      }
      // Fila de encabezado (col A vacía, meses como fecha): da el año fiscal.
      if (anio == null && norm(row[0]) === "") {
        const k = cellMesKey(row[EA.MES_COLS[0]]);
        if (k) anio = parseInt(k.slice(0, 4), 10);
      }
    }
    if (anio == null) anio = new Date().getFullYear();

    const get = (key, i) => (serie[key] ? serie[key][i] : 0);

    // 2) Alianza_Detalle → flujos por socio y lista de egresos, por mes.
    const flujos = {};     // 'YYYY-MM' → { jesus:{cobro,pago}, martin:{cobro,pago} }
    const egresosMes = {}; // 'YYYY-MM' → [{descripcion, origen, monto}]
    for (const r of ((detalle && detalle.rows) || [])) {
      const k = cellMesKey(r[D.COL.MES]) || cellMesKey(r[D.COL.FECHA]);
      const monto = num(r[D.COL.MONTO]);
      if (!k || !monto) continue; // filas vacías o pre-formateadas sin monto
      const esIngreso = norm(r[D.COL.TIPO]) === D.TIPO_INGRESO;
      const socio = D.ORIGEN_SOCIO[norm(r[D.COL.ORIGEN])];
      if (socio) {
        const f = flujos[k] || (flujos[k] = { jesus: { cobro: 0, pago: 0 }, martin: { cobro: 0, pago: 0 } });
        f[socio][esIngreso ? "cobro" : "pago"] += monto;
      }
      if (!esIngreso) {
        (egresosMes[k] = egresosMes[k] || []).push({
          descripcion: norm(r[D.COL.DESCRIPCION]) || norm(r[D.COL.CANAL]) || "Sin detalle",
          origen: norm(r[D.COL.ORIGEN]),
          monto,
        });
      }
    }

    // 3) Aporte de capital por socio (constante) desde Liquidación_Alianza.
    const L = CONFIG.LIQUIDACION_ALIANZA;
    const aporte = { jesus: 0, martin: 0 };
    for (const r of ((liquidacion && liquidacion.rows) || [])) {
      if (norm(r[0]).startsWith(L.FILA_APORTE)) {
        aporte.jesus = num(r[L.COL_JESUS]);
        aporte.martin = num(r[L.COL_MARTIN]);
        break;
      }
    }

    // Un objeto por mes (Ene..Dic), mismo espíritu que buildModel.
    const mesesAll = EA.MES_COLS.map((_, i) => ({
      key: mesKey(anio, i + 1),
      mesNum: i + 1,
      nombre: CONFIG.MESES_ES[i],
      ingresos: get("ingresosTotal", i),
      egresos: get("egresosTotal", i),
      beneficio: get("beneficio", i),
      margen: get("margen", i),
      beneficioSocio: get("beneficioSocio", i),
      canales: EA.CANALES.map((c) => ({ label: c.label, value: get(c.key, i) })),
      categorias: EA.CATEGORIAS_EGRESO.map((c) => ({ label: c.label, value: get(c.key, i) })),
    }));

    // Liquidación del mes: mismas reglas que la pestaña Liquidación_Alianza
    // (flujo = cobró − pagó; a cada socio le corresponde el 50% del beneficio;
    // ajuste + = recibe, − = transfiere), pero calculadas para CUALQUIER mes.
    function liquidacionDe(key) {
      const f = flujos[key] || { jesus: { cobro: 0, pago: 0 }, martin: { cobro: 0, pago: 0 } };
      const beneficio = f.jesus.cobro + f.martin.cobro - f.jesus.pago - f.martin.pago;
      const corresponde = beneficio / 2;
      const snap = (s, ap) => {
        const flujo = s.cobro - s.pago;
        return { cobro: s.cobro, pago: s.pago, flujo, corresponde, ajuste: corresponde - flujo, aporte: ap };
      };
      return { jesus: snap(f.jesus, aporte.jesus), martin: snap(f.martin, aporte.martin), beneficio };
    }

    // Meses con actividad → alimentan el desplegable y el gráfico de evolución.
    const conDatos = mesesAll.filter((m) => m.ingresos !== 0 || m.egresos !== 0);
    const meses = conDatos.map((m) => m.key);

    // Mes por defecto: el activo de Parámetros si tiene datos; si no, el último.
    const defaultKey = meses.includes(mesActivo) ? mesActivo : (meses[meses.length - 1] || null);

    return {
      meses,
      defaultKey,
      mesesConDatos: conDatos,
      getMes: (key) => {
        const m = mesesAll.find((x) => x.key === key);
        return m ? { ...m, liq: liquidacionDe(key), egresosMes: egresosMes[key] || [] } : null;
      },
    };
  }

  // ── Formato ────────────────────────────────────────────────────────────────
  const fmtCurrency = new Intl.NumberFormat(CONFIG.LOCALE, {
    style: "currency",
    currency: CONFIG.CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const Format = {
    money: (n) => fmtCurrency.format(num(n)),
    percent: (n) => `${(num(n) * 100).toFixed(1)}%`,
    monthLabel: (key) => {
      const m = /(\d{4})-(\d{2})/.exec(key || "");
      if (!m) return key || "";
      return `${CONFIG.MESES_ES[parseInt(m[2], 10) - 1]} ${m[1]}`;
    },
  };

  return { buildModel, buildAlianza, Format, _norm: norm, _excelSerialToYM: excelSerialToYM };
})();

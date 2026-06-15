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

  // Construye el modelo completo a partir de las pestañas leídas.
  function buildModel({ evolucion, parametros }) {
    const E = CONFIG.EVOLUCION;
    const { mesActivo, anioFiscal } = leerParametros(parametros);

    // fila lógica → array de 12 valores mensuales
    const serie = {};
    for (const row of evolucion.rows) {
      const key = E.FILAS[norm(row[0])];
      if (!key) continue;
      serie[key] = E.MES_COLS.map((ci) => num(row[ci]));
    }

    const get = (key, i) => (serie[key] ? serie[key][i] : 0);

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
      getMes: (key) => meses.find((m) => m.key === key) || null,
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

  return { buildModel, Format, _norm: norm, _excelSerialToYM: excelSerialToYM };
})();

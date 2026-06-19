// ───────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL DASHBOARD
//
// Único lugar a tocar si cambia el Google Sheet (ID, nombres de pestañas o
// etiquetas de filas). La lógica de cálculo y de gráficos no depende de strings
// hardcodeados fuera de este archivo.
// ───────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // ID del Google Sheet público (BALANCE-ADPD_2026.xlsx).
  // El Sheet debe estar compartido como "cualquiera con el enlace puede ver".
  SHEET_ID: "1hJjanrVr9iCzHE-cH7Vjl1o1-m5kN7pq",

  // Cada cuánto se vuelve a leer el Sheet (ms). 0 = sin auto-refresco.
  REFRESH_MS: 60_000,

  // Formato de números/moneda. La base es USD.
  LOCALE: "es-AR",
  CURRENCY: "USD",

  // Pestañas que se leen. El dashboard se alimenta principalmente de
  // "Evolución_Mensual", una matriz YA CALCULADA por el propio Sheet
  // (filas = conceptos, columnas = meses). Así los números coinciden 1:1 con
  // el workbook sin re-implementar fórmulas de atribución.
  SHEETS: {
    evolucion: "Evolución_Mensual",
    parametros: "Parámetros",
    // Pestañas de detalle para la sección "¿Cuánto dinero tenemos?" (posición de
    // caja + por cobrar − egresos). Se leen crudas y se filtran por mes en JS.
    ingresos: "Ingresos",
    cuentasCobrar: "Cuentas_por_Cobrar",
    egresosDetalle: "Egresos_Detalle",
    egresosExternos: "Egresos_Externos",
    // Ingresos en cuentas que solo accede Jesús (PayPal, USDT directos, Brubank…).
    cuentasVerificar: "Cuentas_A_Verificar",
  },

  // ── Mapeo de la matriz Evolución_Mensual ──────────────────────────────────
  // Las columnas 1..12 son Ene..Dic (col 0 = etiqueta, col 13 = YTD).
  // Cada clave lógica apunta a la etiqueta EXACTA de la fila (col 0), trim().
  EVOLUCION: {
    // Índices de columna (0-based) de cada mes dentro de table.rows[i].c
    MES_COLS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    YTD_COL: 13,

    // Etiquetas de fila → clave lógica (se comparan con .trim())
    FILAS: {
      "Ingresos totales (caja)": "ingresosTotal",
      "- Hotmart": "ingHotmart",
      "- Financiera": "ingFinanciera",
      "- Shopify": "ingShopify",
      "- Dlocal": "ingDlocal",
      "- Otros canales": "ingOtros",
      "Egresos totales": "egresosTotal",
      "- Marketing & Ads": "egMarketing",
      "- Operaciones & SaaS": "egOperaciones",
      "- Otros": "egOtros",
      "RESULTADO OPERATIVO": "resultadoOperativo",
      "Margen %": "margen",
      "Ingresos ADPD (atribuidos)": "adpdIngresos",
      "Egresos ADPD": "adpdEgresos",
      "RESULTADO ADPD": "adpdResultado",
      "Margen ADPD": "adpdMargen",
    },

    // Agrupaciones para los gráficos de desglose
    CANALES: [
      { key: "ingHotmart", label: "Hotmart" },
      { key: "ingFinanciera", label: "Financiera" },
      { key: "ingShopify", label: "Shopify" },
      { key: "ingDlocal", label: "Dlocal" },
      { key: "ingOtros", label: "Otros canales" },
    ],
    CATEGORIAS_EGRESO: [
      { key: "egMarketing", label: "Marketing & Ads" },
      { key: "egOperaciones", label: "Operaciones & SaaS" },
      { key: "egOtros", label: "Otros" },
    ],
  },

  // ── Parámetros: dónde encontrar el "mes activo" ────────────────────────────
  // En la pestaña Parámetros, la fila "Mes a analizar" trae el mes activo.
  // Ojo: el Sheet lo guarda como SERIAL de Excel (p. ej. 46174 = 2026-06).
  PARAMETROS: {
    FILA_MES_ACTIVO: "Mes a analizar",
    FILA_ANIO_FISCAL: "Año fiscal",
    COL_ETIQUETA: 0,
    COL_VALOR: 1,
  },

  // ── Posición del mes: "¿Cuánto dinero tenemos?" ───────────────────────────
  // Se reconstruye desde las pestañas de detalle filtrando por la columna Mes
  // (string "YYYY-MM"), para que siga al selector de mes del panel. Reconcilia
  // 1:1 con la columna PyG_TooAudience del Sheet para el mes activo.
  //   Neto = Plataformas (caja) + Otros ingresos + Por cobrar (pendiente)
  //          − (Egresos_Detalle + Egresos_Externos)  [ambos en crudo]
  // Los índices de columna son 0-based según table.rows[i] de gviz.
  POSICION: {
    INGRESOS: {
      COL_CANAL: 2, COL_NETO: 6, COL_MES: 9,
      // Canales que cuentan como "plataformas" (= TOTAL INGRESOS caja de PyG).
      // "Brubank" = ventas ADPD directas cobradas en la cuenta de Jesús (cargadas
      // en Ingresos, no en Cuentas_A_Verificar, porque el monto se conoce del CRM).
      // "USDT-Financiera" = USDT vía Financiera; en PyG es la línea
      // "USDT (Financiera USDT)", parte del TOTAL INGRESOS caja.
      CANALES_PLATAFORMA: ["Hotmart", "Financiera", "Shopify", "Dlocal", "Brubank", "USDT-Financiera"],
      // Canal de "otros ingresos / no-operativos" (Revolut, Multi D, etc.).
      CANAL_OTROS: "Otros",
    },
    // Solo filas pendientes; se excluye "Pendiente-Detalle" (informativo) y las
    // ya cobradas (esas ya están en la caja de Ingresos → evita doble conteo).
    CUENTAS: { COL_MONTO: 4, COL_ESTADO: 5, COL_MES_ORIGEN: 9 },
    EGRESOS_DETALLE: { COL_MONTO: 5, COL_MES: 8 },
    EGRESOS_EXTERNOS: { COL_MONTO: 7, COL_MES: 10 },
    // "Otras plataformas": solo suma filas con Estado "Confirmado-Con movimiento".
    CUENTAS_VERIFICAR: { COL_ESTADO: 3, COL_MONTO: 5, COL_MES: 9 },
  },

  // Nombres de meses en español (índice 0 = Enero).
  MESES_ES: [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ],
};

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

  // Nombres de meses en español (índice 0 = Enero).
  MESES_ES: [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ],
};

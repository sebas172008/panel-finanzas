// ───────────────────────────────────────────────────────────────────────────
// CAPA DE DATOS — lee el Google Sheet público vía el endpoint gviz/tq (JSONP).
//
// No requiere API key: solo que el Sheet esté compartido como
// "cualquiera con el enlace puede ver". El endpoint devuelve los valores YA
// CALCULADOS de las fórmulas, así que reflejamos el estado actual del Sheet.
//
// IMPORTANTE — por qué JSONP y no fetch():
//   Si la página se abre con doble clic (origen "file://") o el navegador es
//   estricto con CORS, un fetch() a docs.google.com se bloquea con
//   "Failed to fetch" (Google no autoriza el origen "null"). Cargar el Sheet
//   con una etiqueta <script> (JSONP) NO está sujeto a CORS, así que funciona
//   igual abriendo el archivo directo o sirviéndolo por http://localhost.
// ───────────────────────────────────────────────────────────────────────────

const Sheets = (() => {
  let counter = 0;

  // gviz acepta tqx=out:json;responseHandler:<cb>, y responde "<cb>({...});".
  // Construimos la URL a mano para no escapar los ':' y ';' del parámetro tqx.
  function buildUrl(sheetName, callbackName) {
    const base = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq`;
    const tqx = `out:json;responseHandler:${callbackName}`;
    return `${base}?tqx=${tqx}&sheet=${encodeURIComponent(sheetName)}`;
  }

  // Inserta un <script> que, al cargar, invoca nuestro callback global con el
  // JSON ya parseado. Resuelve/rechaza una promesa y limpia siempre el DOM.
  function jsonp(sheetName) {
    return new Promise((resolve, reject) => {
      const cb = `__gvizCb_${Date.now()}_${counter++}`;
      const script = document.createElement("script");
      let settled = false;

      const cleanup = () => {
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Tiempo de espera agotado al leer "${sheetName}". ` +
          `Revisá tu conexión o que el Sheet siga compartido públicamente.`));
      }, 20000);

      window[cb] = (json) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(json);
      };

      script.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error(`No se pudo cargar "${sheetName}" desde Google Sheets ` +
          `(¿sin conexión, o un firewall/extensión bloquea docs.google.com?).`));
      };

      script.src = buildUrl(sheetName, cb);
      document.head.appendChild(script);
    });
  }

  // Devuelve { cols: [label,...], rows: [[v,...],...] }.
  // Cada celda se reduce a su valor crudo (c.v); null cuando la celda está vacía.
  async function fetchSheet(sheetName) {
    const json = await jsonp(sheetName);

    if (json.status === "error") {
      const msg = (json.errors || []).map((e) => e.detailed_message || e.message).join(" · ");
      throw new Error(msg || `Error gviz en "${sheetName}".`);
    }

    const table = json.table || { cols: [], rows: [] };
    const cols = (table.cols || []).map((c) => (c.label || "").trim());
    const rows = (table.rows || []).map((r) =>
      (r.c || []).map((cell) => (cell && cell.v !== undefined ? cell.v : null))
    );
    return { cols, rows };
  }

  return { buildUrl, fetchSheet };
})();

// ───────────────────────────────────────────────────────────────────────────
// ORQUESTACIÓN — carga, selector de mes, render y auto-refresco "en vivo".
// ───────────────────────────────────────────────────────────────────────────

(() => {
  const el = {
    loading: document.getElementById("loading"),
    error: document.getElementById("error"),
    errorMsg: document.getElementById("errorMsg"),
    main: document.getElementById("main"),
    mesSelect: document.getElementById("mesSelect"),
    refreshBtn: document.getElementById("refreshBtn"),
    retryBtn: document.getElementById("retryBtn"),
    lastUpdate: document.getElementById("lastUpdate"),
  };

  let model = null;
  let selectedKey = null;
  let timer = null;

  function show(node, visible) {
    if (node) node.hidden = !visible;
  }

  function showError(err) {
    console.error("[dashboard] Error al leer el Sheet:", err);
    const msg = err && err.message ? err.message : String(err);
    // "Failed to fetch" / "NetworkError" = la petición ni siquiera llegó:
    // suele ser un bloqueador (uBlock/Brave/AdGuard) o una extensión de privacidad.
    const esBloqueo = /failed to fetch|networkerror|load failed/i.test(msg);
    el.errorMsg.textContent = esBloqueo
      ? `La petición al Sheet fue bloqueada por el navegador (“${msg}”). Suele ser una extensión bloqueadora de anuncios/privacidad o el modo escudos. Desactivala para localhost o probá en una ventana de incógnito sin extensiones.`
      : (msg + (err && err.stack ? "\n\n" + err.stack : ""));
    show(el.loading, false);
    show(el.error, true);
  }

  // Lee ambas pestañas en paralelo y arma el modelo.
  async function fetchModel() {
    const [evolucion, parametros] = await Promise.all([
      Sheets.fetchSheet(CONFIG.SHEETS.evolucion),
      Sheets.fetchSheet(CONFIG.SHEETS.parametros),
    ]);
    return Calc.buildModel({ evolucion, parametros });
  }

  function populateSelector() {
    const meses = model.mesesConDatos.length ? model.mesesConDatos : model.meses;
    el.mesSelect.innerHTML = "";
    for (const m of meses) {
      const opt = document.createElement("option");
      opt.value = m.key;
      opt.textContent = Calc.Format.monthLabel(m.key);
      el.mesSelect.appendChild(opt);
    }
    // Mantener selección previa si sigue existiendo; si no, usar default del modelo.
    if (!meses.some((m) => m.key === selectedKey)) {
      selectedKey = model.defaultKey || (meses[0] && meses[0].key) || null;
    }
    el.mesSelect.value = selectedKey;
  }

  function render() {
    const mes = model.getMes(selectedKey);
    if (!mes) return;
    Charts.renderAll(model, mes);
  }

  function stampUpdate() {
    const hora = new Date().toLocaleTimeString(CONFIG.LOCALE, { hour: "2-digit", minute: "2-digit" });
    el.lastUpdate.textContent = `Actualizado ${hora}`;
  }

  // Carga inicial (con overlay). Falla → pantalla de error.
  async function load() {
    show(el.error, false);
    show(el.loading, true);
    let paso = "inicio";
    try {
      paso = "verificar Chart.js";
      if (typeof Chart === "undefined") {
        throw new Error("No se pudo cargar Chart.js (el CDN está bloqueado o sin conexión). Revisá si una extensión o el firewall bloquea cdn.jsdelivr.net.");
      }
      paso = "leer el Sheet (fetchModel)";
      model = await fetchModel();
      paso = "armar el selector de meses (populateSelector)";
      populateSelector();
      paso = "dibujar (render)";
      render();
      paso = "marca de tiempo (stampUpdate)";
      stampUpdate();
      show(el.loading, false);
      show(el.main, true);
      scheduleRefresh();
    } catch (err) {
      if (err && !/^\[paso:/.test(err.message)) {
        err.message = `[paso: ${paso}] ${err.message}`;
      }
      showError(err);
    }
  }

  // Refresco silencioso (sin overlay). Si falla, conserva los datos previos.
  async function refresh() {
    try {
      model = await fetchModel();
      populateSelector();
      render();
      stampUpdate();
    } catch (err) {
      console.warn("Refresco fallido, se conservan los datos previos:", err);
    }
  }

  function scheduleRefresh() {
    if (timer) clearInterval(timer);
    if (CONFIG.REFRESH_MS > 0) timer = setInterval(refresh, CONFIG.REFRESH_MS);
  }

  // ── Eventos ────────────────────────────────────────────────────────────────
  el.mesSelect.addEventListener("change", (e) => {
    selectedKey = e.target.value;
    render();
  });
  el.refreshBtn.addEventListener("click", refresh);
  el.retryBtn.addEventListener("click", load);

  load();
})();

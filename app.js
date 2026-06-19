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
    vistaMes: document.getElementById("vistaMes"),
    vistaYtd: document.getElementById("vistaYtd"),
  };

  let model = null;
  let selectedKey = null;
  let vista = "mes"; // "mes" | "ytd"
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

  // Lee todas las pestañas en paralelo y arma el modelo.
  async function fetchModel() {
    const [evolucion, parametros, ingresos, cuentas, egresosDetalle, egresosExternos, cuentasVerificar] =
      await Promise.all([
        Sheets.fetchSheet(CONFIG.SHEETS.evolucion),
        Sheets.fetchSheet(CONFIG.SHEETS.parametros),
        Sheets.fetchSheet(CONFIG.SHEETS.ingresos),
        Sheets.fetchSheet(CONFIG.SHEETS.cuentasCobrar),
        Sheets.fetchSheet(CONFIG.SHEETS.egresosDetalle),
        Sheets.fetchSheet(CONFIG.SHEETS.egresosExternos),
        Sheets.fetchSheet(CONFIG.SHEETS.cuentasVerificar),
      ]);
    return Calc.buildModel({ evolucion, parametros, ingresos, cuentas, egresosDetalle, egresosExternos, cuentasVerificar });
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
    if (vista === "ytd") {
      Charts.renderAll(model, model.ytd, null, model.getPosicion(null), `Acumulado ${model.anioFiscal}`);
      return;
    }
    const mes = model.getMes(selectedKey);
    if (!mes) return;
    Charts.renderAll(
      model, mes, model.getPrevMes(selectedKey),
      model.getPosicion(selectedKey), Calc.Format.monthLabel(selectedKey)
    );
  }

  // Refleja la vista activa en el toggle y atenúa el selector de mes en YTD.
  function syncVista() {
    const esYtd = vista === "ytd";
    el.vistaYtd.classList.toggle("is-active", esYtd);
    el.vistaMes.classList.toggle("is-active", !esYtd);
    el.vistaYtd.setAttribute("aria-pressed", String(esYtd));
    el.vistaMes.setAttribute("aria-pressed", String(!esYtd));
    el.mesSelect.disabled = esYtd;
  }

  function setVista(v) {
    if (vista === v) return;
    vista = v;
    syncVista();
    render();
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
  el.vistaMes.addEventListener("click", () => setVista("mes"));
  el.vistaYtd.addEventListener("click", () => setVista("ytd"));

  load();
})();

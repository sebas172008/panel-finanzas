// ───────────────────────────────────────────────────────────────────────────
// ORQUESTACIÓN — carga, selector de mes, render y auto-refresco "en vivo".
// ───────────────────────────────────────────────────────────────────────────

(() => {
  const el = {
    loading: document.getElementById("loading"),
    error: document.getElementById("error"),
    errorMsg: document.getElementById("errorMsg"),
    main: document.getElementById("main"),
    mainAlianza: document.getElementById("mainAlianza"),
    proyectoSelect: document.getElementById("proyectoSelect"),
    mesControls: document.getElementById("mesControls"),
    mesAlianzaControls: document.getElementById("mesAlianzaControls"),
    mesSelect: document.getElementById("mesSelect"),
    alzMesSelect: document.getElementById("alzMesSelect"),
    egrConceptoSelect: document.getElementById("egrConceptoSelect"),
    refreshBtn: document.getElementById("refreshBtn"),
    retryBtn: document.getElementById("retryBtn"),
    lastUpdate: document.getElementById("lastUpdate"),
    vistaMes: document.getElementById("vistaMes"),
    vistaYtd: document.getElementById("vistaYtd"),
  };

  let model = null;
  let alianza = null;            // datos de la pestaña Alianza Rieznik (best-effort)
  let proyecto = "tooaudience";  // "tooaudience" | "alianza"
  let selectedKey = null;
  let selectedAlianzaKey = null; // mes elegido en la vista Alianza
  let selectedEgrConcepto = "__TODOS__"; // concepto del gráfico de detalle de egresos
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

  // Lee las pestañas del rediseño de la Alianza (matriz + detalle + aporte)
  // y arma su modelo. Ver ALIANZA_RIEZNIK_REDISEÑO.md.
  async function fetchAlianza() {
    const [evolucion, detalle, liquidacion] = await Promise.all([
      Sheets.fetchSheet(CONFIG.SHEETS.evolucionAlianza),
      Sheets.fetchSheet(CONFIG.SHEETS.alianzaDetalle),
      Sheets.fetchSheet(CONFIG.SHEETS.liquidacionAlianza),
    ]);
    return Calc.buildAlianza({ evolucion, detalle, liquidacion });
  }

  function populateProyectos() {
    el.proyectoSelect.innerHTML = "";
    for (const p of CONFIG.PROYECTOS) {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = p.label;
      el.proyectoSelect.appendChild(opt);
    }
    el.proyectoSelect.value = proyecto;
  }

  // Muestra el <main> del proyecto activo y los controles de mes que correspondan.
  function syncProyecto() {
    const esAlianza = proyecto === "alianza";
    show(el.main, !esAlianza);
    show(el.mainAlianza, esAlianza);
    show(el.mesControls, !esAlianza);
    show(el.mesAlianzaControls, esAlianza);
  }

  // Llena el selector de mes de la Alianza con los meses con datos. Por defecto,
  // el mes activo de Parámetros si la alianza tiene datos ese mes; si no, el último.
  function populateAlianzaSelector() {
    if (!alianza) return;
    el.alzMesSelect.innerHTML = "";
    for (const k of alianza.meses) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = Calc.Format.monthLabel(k);
      el.alzMesSelect.appendChild(opt);
    }
    const preferido = (model && alianza.meses.includes(model.mesActivo))
      ? model.mesActivo : alianza.defaultKey;
    if (!alianza.meses.includes(selectedAlianzaKey)) selectedAlianzaKey = preferido;
    el.alzMesSelect.value = selectedAlianzaKey;
  }

  // Llena el selector de concepto del gráfico de detalle de egresos: "Todos" +
  // cada concepto (proveedor) ordenado por gasto acumulado, con su total al lado.
  function populateEgresoConceptoSelector() {
    if (!model) return;
    const data = model.getEgresosDetalleEvol();
    el.egrConceptoSelect.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "__TODOS__";
    optAll.textContent = "Todos (principales)";
    el.egrConceptoSelect.appendChild(optAll);

    for (const c of data.conceptos) {
      const opt = document.createElement("option");
      opt.value = c.label;
      opt.textContent = `${c.label} · ${Calc.Format.money(c.total)}`;
      el.egrConceptoSelect.appendChild(opt);
    }

    // Si el concepto elegido ya no existe (cambió el Sheet), volver a "Todos".
    if (selectedEgrConcepto !== "__TODOS__" && !data.conceptos.some((c) => c.label === selectedEgrConcepto)) {
      selectedEgrConcepto = "__TODOS__";
    }
    el.egrConceptoSelect.value = selectedEgrConcepto;
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
    if (proyecto === "alianza") {
      if (!alianza || !alianza.meses.length) {
        Charts.setText("alzMesLabel", "datos no disponibles");
        return;
      }
      Charts.renderAlianza(alianza, selectedAlianzaKey);
      return;
    }
    // Detalle de egresos: independiente del mes/vista (compara todos los meses).
    Charts.renderEgresoDetalleEvol(model, selectedEgrConcepto);
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
      paso = "leer el Sheet (fetchModel + Alianza)";
      // TooAudience es crítico; la Alianza es best-effort (no debe tumbar la vista
      // principal si esa pestaña se renombró o falla).
      const [modelRes, alianzaRes] = await Promise.allSettled([fetchModel(), fetchAlianza()]);
      if (modelRes.status === "rejected") throw modelRes.reason;
      model = modelRes.value;
      alianza = alianzaRes.status === "fulfilled" ? alianzaRes.value : null;
      if (alianzaRes.status === "rejected") console.warn("Alianza Rieznik no disponible:", alianzaRes.reason);
      paso = "armar selectores (proyecto + meses)";
      populateProyectos();
      populateSelector();
      populateAlianzaSelector();
      populateEgresoConceptoSelector();
      syncProyecto();
      paso = "dibujar (render)";
      render();
      paso = "marca de tiempo (stampUpdate)";
      stampUpdate();
      show(el.loading, false);
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
      const [modelRes, alianzaRes] = await Promise.allSettled([fetchModel(), fetchAlianza()]);
      if (modelRes.status === "fulfilled") model = modelRes.value;
      if (alianzaRes.status === "fulfilled") alianza = alianzaRes.value;
      populateSelector();
      populateAlianzaSelector();
      populateEgresoConceptoSelector();
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
  el.proyectoSelect.addEventListener("change", (e) => {
    proyecto = e.target.value;
    syncProyecto();
    render();
  });
  el.mesSelect.addEventListener("change", (e) => {
    selectedKey = e.target.value;
    render();
  });
  el.alzMesSelect.addEventListener("change", (e) => {
    selectedAlianzaKey = e.target.value;
    render();
  });
  el.egrConceptoSelect.addEventListener("change", (e) => {
    selectedEgrConcepto = e.target.value;
    Charts.renderEgresoDetalleEvol(model, selectedEgrConcepto);
  });
  el.refreshBtn.addEventListener("click", refresh);
  el.retryBtn.addEventListener("click", load);
  el.vistaMes.addEventListener("click", () => setVista("mes"));
  el.vistaYtd.addEventListener("click", () => setVista("ytd"));

  load();
})();

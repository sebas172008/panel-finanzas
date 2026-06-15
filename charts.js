// ───────────────────────────────────────────────────────────────────────────
// RENDER — KPIs (DOM) y gráficos (Chart.js).
// ───────────────────────────────────────────────────────────────────────────

const Charts = (() => {
  const F = Calc.Format;
  const instances = {}; // id de canvas → instancia Chart (para destruir/recrear)

  const PALETA = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0891b2"];
  const COLOR_ING = "#16a34a";
  const COLOR_EGR = "#dc2626";
  const COLOR_RES = "#2563eb";

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // Aplica color rojo a montos negativos en una card de KPI.
  function setMonto(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = F.money(n);
    el.classList.toggle("neg", Number(n) < 0);
  }

  function draw(canvasId, configFn) {
    if (instances[canvasId]) {
      instances[canvasId].destroy();
      delete instances[canvasId];
    }
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    instances[canvasId] = new Chart(canvas.getContext("2d"), configFn());
  }

  const moneyTick = (v) => F.money(v).replace(/[,\.]00$/, "");

  // ── KPIs (pregunta 1: ¿cuánto ganó TooAudience este mes?) ──────────────────
  function renderKpis(mes) {
    setMonto("kpiIngresos", mes.ingresosTotal);
    setMonto("kpiEgresos", mes.egresosTotal);
    setMonto("kpiResultado", mes.resultadoOperativo);
    const margenEl = document.getElementById("kpiMargen");
    if (margenEl) {
      margenEl.textContent = F.percent(mes.margen);
      margenEl.classList.toggle("neg", Number(mes.margen) < 0);
    }
  }

  // ── Línea de negocio (pregunta 2) ──────────────────────────────────────────
  function renderLineaNegocio(mes) {
    setMonto("lnTotalIng", mes.ingresosTotal);
    setMonto("lnTotalRes", mes.resultadoOperativo);
    setMonto("lnAdpdIng", mes.adpd.ingresos);
    setMonto("lnAdpdRes", mes.adpd.resultado);

    draw("chartLinea", () => ({
      type: "bar",
      data: {
        labels: ["LN-01 TooAudience", "LN-02 ADPD"],
        datasets: [
          { label: "Ingresos", data: [mes.ingresosTotal, mes.adpd.ingresos], backgroundColor: COLOR_ING },
          { label: "Egresos", data: [mes.egresosTotal, mes.adpd.egresos], backgroundColor: COLOR_EGR },
          { label: "Resultado", data: [mes.resultadoOperativo, mes.adpd.resultado], backgroundColor: COLOR_RES },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${F.money(c.parsed.y)}` } },
        },
        scales: { y: { ticks: { callback: moneyTick } } },
      },
    }));
  }

  // ── Ingresos por canal (doughnut) ──────────────────────────────────────────
  function renderCanales(mes) {
    const datos = mes.canales.filter((c) => c.value > 0);
    draw("chartCanales", () => ({
      type: "doughnut",
      data: {
        labels: datos.map((d) => d.label),
        datasets: [{ data: datos.map((d) => d.value), backgroundColor: PALETA }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right" },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${F.money(c.parsed)}` } },
        },
      },
    }));
  }

  // ── Egresos por categoría (barras horizontales) ────────────────────────────
  function renderCategorias(mes) {
    const datos = mes.categorias.filter((c) => c.value > 0);
    draw("chartCategorias", () => ({
      type: "bar",
      data: {
        labels: datos.map((d) => d.label),
        datasets: [{ label: "Egresos", data: datos.map((d) => d.value), backgroundColor: COLOR_EGR }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => F.money(c.parsed.x) } },
        },
        scales: { x: { ticks: { callback: moneyTick } } },
      },
    }));
  }

  // ── Evolución mensual (líneas, todos los meses con datos) ──────────────────
  function renderEvolucion(model) {
    const meses = model.mesesConDatos.length ? model.mesesConDatos : model.meses;
    draw("chartEvolucion", () => ({
      type: "line",
      data: {
        labels: meses.map((m) => m.nombre),
        datasets: [
          { label: "Ingresos", data: meses.map((m) => m.ingresosTotal), borderColor: COLOR_ING, tension: 0.3 },
          { label: "Egresos", data: meses.map((m) => m.egresosTotal), borderColor: COLOR_EGR, tension: 0.3 },
          { label: "Resultado", data: meses.map((m) => m.resultadoOperativo), borderColor: COLOR_RES, tension: 0.3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${F.money(c.parsed.y)}` } },
        },
        scales: { y: { ticks: { callback: moneyTick } } },
      },
    }));
  }

  function renderAll(model, mes) {
    renderKpis(mes);
    renderLineaNegocio(mes);
    renderCanales(mes);
    renderCategorias(mes);
    renderEvolucion(model);
  }

  return { renderAll, renderKpis, renderLineaNegocio, renderCanales, renderCategorias, renderEvolucion, setText };
})();

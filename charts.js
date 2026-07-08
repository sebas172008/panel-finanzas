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

  // Badge de tendencia ▲/▼ vs. el valor previo.
  //  - mode "money": variación porcentual (cur-prev)/|prev|.
  //  - mode "points": diferencia en puntos (para márgenes), sufijo "pp".
  // higherIsBetter define el color: subir es verde salvo en egresos (rojo).
  function setDelta(id, cur, prev, { higherIsBetter, mode }) {
    const el = document.getElementById(id);
    if (!el) return;

    // Sin comparación posible (modo YTD o primer mes con datos): ocultar.
    if (prev == null || (mode === "money" && Number(prev) === 0)) {
      el.hidden = true;
      el.textContent = "";
      return;
    }

    const cur_ = Number(cur), prev_ = Number(prev);
    let diff, texto;
    if (mode === "points") {
      diff = cur_ * 100 - prev_ * 100;
      texto = `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)} pp`;
    } else {
      diff = (cur_ - prev_) / Math.abs(prev_);
      texto = `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff * 100).toFixed(1)}%`;
    }

    const bueno = diff >= 0 ? higherIsBetter : !higherIsBetter;
    el.hidden = false;
    el.textContent = texto;
    el.classList.toggle("pos", bueno);
    el.classList.toggle("neg", !bueno);
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
  // `prev` (opcional): mes anterior con datos para los badges de tendencia.
  // Si es null (modo YTD o primer mes), los badges se ocultan.
  function renderKpis(mes, prev) {
    setMonto("kpiIngresos", mes.ingresosTotal);
    setMonto("kpiEgresos", mes.egresosTotal);
    setMonto("kpiResultado", mes.resultadoOperativo);
    const margenEl = document.getElementById("kpiMargen");
    if (margenEl) {
      margenEl.textContent = F.percent(mes.margen);
      margenEl.classList.toggle("neg", Number(mes.margen) < 0);
    }

    setDelta("kpiIngresosDelta", mes.ingresosTotal, prev && prev.ingresosTotal, { higherIsBetter: true, mode: "money" });
    setDelta("kpiEgresosDelta", mes.egresosTotal, prev && prev.egresosTotal, { higherIsBetter: false, mode: "money" });
    setDelta("kpiResultadoDelta", mes.resultadoOperativo, prev && prev.resultadoOperativo, { higherIsBetter: true, mode: "money" });
    setDelta("kpiMargenDelta", mes.margen, prev ? prev.margen : null, { higherIsBetter: true, mode: "points" });
  }

  // ── Posición del mes: ¿Cuánto dinero tenemos? ──────────────────────────────
  // pos = { plataformas, otros, porCobrar, egresos, neto }; etiqueta = mes/YTD.
  function renderPosicion(pos, etiqueta) {
    setText("posMesLabel", etiqueta || "");
    setMonto("posPlataformas", pos.plataformas);
    setMonto("posOtros", pos.otros);
    setMonto("posOtrasPlataformas", pos.otrasPlataformas);
    setMonto("posPorCobrar", pos.porCobrar);
    setMonto("posTotalIngresos", pos.totalIngresos);
    setMonto("posEgresos", -pos.egresos); // se muestra en negativo (rojo)
    setMonto("posNeto", pos.neto);

    // Profit & Loss explícito: badge Ganancia / Pérdida según el signo del neto.
    const estadoEl = document.getElementById("posNetoEstado");
    if (estadoEl) {
      const esGanancia = Number(pos.neto) >= 0;
      estadoEl.textContent = esGanancia ? "✔ Ganancia" : "✖ Pérdida";
      estadoEl.classList.toggle("kpi-tag--res-ok", esGanancia);
      estadoEl.classList.toggle("kpi-tag--res-bad", !esGanancia);
    }

    draw("chartPosicion", () => ({
      type: "bar",
      data: {
        labels: ["Plataformas", "Otros ingr.", "Externos conf.", "Pendiente cobrar", "Egresos", "Resultado"],
        datasets: [{
          data: [pos.plataformas, pos.otros, pos.otrasPlataformas, pos.porCobrar, -pos.egresos, pos.neto],
          backgroundColor: [COLOR_ING, "#0891b2", "#7c3aed", "#f59e0b", COLOR_EGR, COLOR_RES],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => F.money(c.parsed.y) } },
        },
        scales: { y: { ticks: { callback: moneyTick } } },
      },
    }));
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

  // ── Evolución dentro del mes (ingresos de caja acumulados, día a día) ──────
  // Responde a "¿cómo venimos en el mes?": línea de caja acumulada por día del
  // mes seleccionado, con el mes anterior (con datos) en línea punteada como
  // referencia de ritmo. Sigue al selector de mes (se redibuja en cada render).
  function renderEvolucionMes(model, mesKey) {
    const cur = model.getIngresosDiarios(mesKey);
    const prevMes = model.getPrevMes ? model.getPrevMes(mesKey) : null;
    const prev = prevMes ? model.getIngresosDiarios(prevMes.key) : null;

    // Eje X = día del mes (1..máximo entre ambas series, mínimo 1).
    const maxDia = Math.max(cur.ultimoDia, prev ? prev.ultimoDia : 0, 1);
    const labels = Array.from({ length: maxDia }, (_, i) => String(i + 1));
    const serie = (s) => labels.map((_, i) => (i < s.acumulado.length ? s.acumulado[i] : null));

    const esMes = typeof mesKey === "string" && /^\d{4}-\d{2}$/.test(mesKey);
    const datasets = [{
      label: esMes ? `Acumulado ${F.monthLabel(mesKey)}` : "Acumulado del mes",
      data: serie(cur),
      borderColor: COLOR_ING,
      backgroundColor: COLOR_ING + "22",
      fill: true,
      tension: 0.25,
      pointRadius: 2,
    }];
    if (prev) {
      datasets.push({
        label: `Acumulado ${F.monthLabel(prevMes.key)}`,
        data: serie(prev),
        borderColor: "#94a3b8",
        borderDash: [6, 4],
        fill: false,
        tension: 0.25,
        pointRadius: 0,
      });
    }

    draw("chartEvolucionMes", () => ({
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: (items) => `Día ${items[0].label}`,
              label: (c) => `${c.dataset.label}: ${F.money(c.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { title: { display: true, text: "Día del mes" } },
          y: { ticks: { callback: moneyTick } },
        },
      },
    }));
  }

  // ── Evolución del detalle de egresos (por concepto, mes a mes) ─────────────
  // Responde a "¿se gastó de más de un mes a otro?". Con un concepto elegido
  // (p. ej. "Facebook Ads") dibuja barras por mes, en ROJO los meses en que el
  // gasto SUPERÓ al mes anterior y en verde los que bajaron/igualaron, con un
  // badge de variación del último mes. Con "Todos" muestra los conceptos top
  // como líneas para ver la evolución conjunta.
  function renderEgresoDetalleEvol(model, conceptoLabel) {
    const data = model.getEgresosDetalleEvol();
    const meses = data.meses;
    const labels = meses.map((k) => F.monthLabel(k));
    const badge = document.getElementById("egrDeltaBadge");

    if (!meses.length) {
      if (badge) badge.hidden = true;
      draw("chartEgresoDetalle", () => ({
        type: "bar",
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: false },
      }));
      return;
    }

    const esTodos = !conceptoLabel || conceptoLabel === "__TODOS__";

    if (esTodos) {
      if (badge) badge.hidden = true;
      const TOP = 6;
      const top = data.conceptos.slice(0, TOP);
      const resto = data.conceptos.slice(TOP);
      const datasets = top.map((c, i) => ({
        label: c.label,
        data: meses.map((m) => c.porMes[m] || 0),
        borderColor: PALETA[i % PALETA.length],
        backgroundColor: PALETA[i % PALETA.length] + "22",
        tension: 0.3,
        pointRadius: 2,
      }));
      if (resto.length) {
        datasets.push({
          label: `Otros (${resto.length})`,
          data: meses.map((m) => resto.reduce((s, c) => s + (c.porMes[m] || 0), 0)),
          borderColor: "#94a3b8",
          backgroundColor: "#94a3b822",
          borderDash: [6, 4],
          tension: 0.3,
          pointRadius: 0,
        });
      }
      draw("chartEgresoDetalle", () => ({
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "bottom" },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${F.money(c.parsed.y)}` } },
          },
          scales: { y: { ticks: { callback: moneyTick } } },
        },
      }));
      return;
    }

    // Un solo concepto: barras por mes. Rojo si gastó más que el mes anterior.
    const concepto = data.conceptos.find((c) => c.label === conceptoLabel);
    const serie = meses.map((m) => (concepto ? concepto.porMes[m] || 0 : 0));
    const colores = serie.map((v, i) => (i > 0 && v > serie[i - 1] ? COLOR_EGR : COLOR_ING));

    // Badge: variación del último mes vs. el anterior (subir = gastar de más = rojo).
    if (badge) {
      const n = serie.length;
      if (n >= 2 && serie[n - 2] !== 0) {
        const diff = serie[n - 1] - serie[n - 2];
        const pct = (diff / Math.abs(serie[n - 2])) * 100;
        badge.hidden = false;
        badge.textContent = `${diff >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% vs ${F.monthLabel(meses[n - 2])}`;
        badge.classList.toggle("neg", diff > 0);
        badge.classList.toggle("pos", diff <= 0);
      } else {
        badge.hidden = true;
      }
    }

    draw("chartEgresoDetalle", () => ({
      type: "bar",
      data: { labels, datasets: [{ label: conceptoLabel, data: serie, backgroundColor: colores }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => F.money(c.parsed.y),
              afterLabel: (c) => {
                const i = c.dataIndex;
                if (i === 0 || !serie[i - 1]) return "";
                const diff = serie[i] - serie[i - 1];
                const pct = (diff / Math.abs(serie[i - 1])) * 100;
                return `${diff >= 0 ? "▲" : "▼"} ${F.money(Math.abs(diff))} (${Math.abs(pct).toFixed(1)}%) vs mes anterior`;
              },
            },
          },
        },
        scales: { y: { ticks: { callback: moneyTick } } },
      },
    }));
  }

  // Escapa texto que viene del Sheet antes de inyectarlo como HTML.
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Vista Alianza Rieznik (P&L + liquidación 50/50 Jesús / Martín) ─────────
  // alz = modelo de Calc.buildAlianza; mesKey = 'YYYY-MM' del desplegable.
  // El P&L sale 1:1 de Evolución_Alianza; la liquidación se recalcula por mes
  // desde Alianza_Detalle. Layout aislado (su propio <main>), para Martín.
  function renderAlianza(alz, mesKey) {
    const mes = alz.getMes(mesKey);
    if (!mes) return;
    setText("alzMesLabel", F.monthLabel(mesKey));

    // KPIs del P&L (egresos en negativo → rojo).
    setMonto("alzIngresos", mes.ingresos);
    setMonto("alzEgresos", -mes.egresos);
    setMonto("alzBeneficio", mes.beneficio);
    setMonto("alzPorSocio", mes.beneficioSocio);
    const margenEl = document.getElementById("alzMargen");
    if (margenEl) {
      margenEl.textContent = F.percent(mes.margen);
      margenEl.classList.toggle("neg", Number(mes.margen) < 0);
    }

    // Liquidación: tarjetas por socio (prefijo alzJ = Jesús, alzM = Martín).
    const fillSocio = (pfx, s) => {
      setMonto(pfx + "Cobro", s.cobro);
      setMonto(pfx + "Pago", -s.pago);
      setMonto(pfx + "Flujo", s.flujo);
      setMonto(pfx + "Corresponde", s.corresponde);
      setMonto(pfx + "Ajuste", s.ajuste);
      setMonto(pfx + "Aporte", s.aporte);
    };
    const j = mes.liq.jesus, m = mes.liq.martin;
    fillSocio("alzJ", j);
    fillSocio("alzM", m);

    // Nota en lenguaje llano: quién le transfiere a quién a fin de mes.
    const nota = document.getElementById("alzAjusteNota");
    if (nota) {
      if (Math.abs(j.ajuste) < 0.005) {
        nota.textContent = "Mes equilibrado: nadie tiene que transferir.";
      } else {
        const recibe = j.ajuste > 0 ? "Jesús" : "Martín";
        const paga = j.ajuste > 0 ? "Martín" : "Jesús";
        nota.textContent = `${paga} le transfiere ${F.money(Math.abs(j.ajuste))} a ${recibe} ` +
          `para que cada uno quede con su 50% del beneficio (${F.money(j.corresponde)}).`;
      }
    }

    // Egresos del mes (lista informativa, desde Alianza_Detalle).
    const cont = document.getElementById("alzEgresosLista");
    if (cont) {
      cont.innerHTML = mes.egresosMes.length
        ? mes.egresosMes.map((e) =>
            `<div class="ln-row"><span>${escapeHtml(e.descripcion)}` +
            (e.origen ? ` <small>· pagó ${escapeHtml(e.origen)}</small>` : "") +
            `</span><span class="mono">${F.money(e.monto)}</span></div>`).join("")
        : '<div class="ln-note">Sin egresos cargados para el mes.</div>';
    }

    // Comparativa de la liquidación (barras agrupadas Jesús vs Martín).
    draw("chartAlianzaSocios", () => ({
      type: "bar",
      data: {
        labels: ["Cobró", "Pagó", "Flujo neto", "Le corresponde (50%)"],
        datasets: [
          { label: "Jesús", data: [j.cobro, j.pago, j.flujo, j.corresponde], backgroundColor: PALETA[0] },
          { label: "Martín", data: [m.cobro, m.pago, m.flujo, m.corresponde], backgroundColor: PALETA[2] },
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

    // Ingresos por canal (doughnut) y egresos por categoría (barras).
    const canales = mes.canales.filter((c) => c.value > 0);
    draw("chartAlianzaCanales", () => ({
      type: "doughnut",
      data: {
        labels: canales.map((d) => d.label),
        datasets: [{ data: canales.map((d) => d.value), backgroundColor: PALETA }],
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

    const categorias = mes.categorias.filter((c) => c.value > 0);
    draw("chartAlianzaEgresos", () => ({
      type: "bar",
      data: {
        labels: categorias.map((d) => d.label),
        datasets: [{ label: "Egresos", data: categorias.map((d) => d.value), backgroundColor: COLOR_EGR }],
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

    // Evolución mensual de la alianza (todos los meses con datos).
    const evol = alz.mesesConDatos;
    draw("chartAlianzaEvolucion", () => ({
      type: "line",
      data: {
        labels: evol.map((x) => x.nombre),
        datasets: [
          { label: "Ingresos", data: evol.map((x) => x.ingresos), borderColor: COLOR_ING, tension: 0.3 },
          { label: "Egresos", data: evol.map((x) => x.egresos), borderColor: COLOR_EGR, tension: 0.3 },
          { label: "Beneficio neto", data: evol.map((x) => x.beneficio), borderColor: COLOR_RES, tension: 0.3 },
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

  function renderAll(model, mes, prev, posicion, etiquetaPos) {
    if (posicion) renderPosicion(posicion, etiquetaPos);
    renderKpis(mes, prev);
    renderLineaNegocio(mes);
    renderCanales(mes);
    renderCategorias(mes);
    renderEvolucion(model);
    renderEvolucionMes(model, mes && mes.key);
  }

  return { renderAll, renderAlianza, renderKpis, renderPosicion, renderLineaNegocio, renderCanales, renderCategorias, renderEvolucion, renderEvolucionMes, renderEgresoDetalleEvol, setText };
})();

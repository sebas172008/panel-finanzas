# Panel de Finanzas TooAudience

Dashboard estático (HTML + Chart.js) que lee un **Google Sheet público en tiempo real** y muestra
las finanzas de TooAudience de forma gráfica. Sin backend, sin base de datos, sin build.

## Cómo funciona

- El Google Sheet (`BALANCE-ADPD_2026.xlsx`) es la **única fuente de verdad** y ya hace todos los
  cálculos. El dashboard solo lee y grafica.
- Lee la pestaña **`Evolución_Mensual`** (matriz ya calculada: ingresos por canal, egresos por
  categoría, resultado, márgenes y ADPD por mes) y la pestaña **`Parámetros`** (mes activo).
- Usa el endpoint **gviz** del Sheet (`/gviz/tq?tqx=out:json&sheet=...`) — **no requiere API key**.

## Requisito: compartir el Sheet

El Sheet debe estar compartido como **“Cualquiera con el enlace → Lector”**.
En Google Drive: botón _Compartir_ → _Acceso general_ → _Cualquiera con el enlace_ → _Lector_.
Si se restringe el acceso, el dashboard mostrará un mensaje de error.

## Uso local

Abrí `index.html` en el navegador. (Para evitar restricciones de `file://` en algunos navegadores,
podés servirlo con `npx serve .` o `python -m http.server` desde esta carpeta.)

## Desplegar online

**Vercel** (recomendado): subí esta carpeta como proyecto estático.
- Con la CLI: `vercel` desde la raíz del repo (el `vercel.json` apunta a `dashboard/`).
- O importá el repo en vercel.com — sin framework, output dir `dashboard`.

**GitHub Pages**: subí el repo y serví la carpeta `dashboard/` (rama `gh-pages` o carpeta `/docs`).

## Configuración

Todo lo específico del Sheet vive en **`config.js`**:

- `SHEET_ID` — ID del Google Sheet.
- `REFRESH_MS` — cada cuánto se re-lee el Sheet (por defecto 60 s; `0` desactiva el auto-refresco).
- `LOCALE` / `CURRENCY` — formato de moneda (es-AR / USD).
- `SHEETS`, `EVOLUCION`, `PARAMETROS` — nombres de pestañas y mapeo de filas/columnas.

Si el Sheet cambia de estructura (nombres de pestañas o etiquetas de filas), **solo se toca
`config.js`**. La lógica de cálculo y los gráficos mapean por claves lógicas, no por texto fijo.

## Estructura

```
dashboard/
  index.html   estructura + carga de scripts
  styles.css   estilos (KPIs, grid responsive, rojo para negativos)
  config.js    SHEET_ID + mapeo de pestañas/filas/columnas
  sheets.js    fetch gviz + parseo
  calc.js      modelo por mes + mes activo + formato
  charts.js    KPIs (DOM) y gráficos (Chart.js)
  app.js       orquestación + selector de mes + auto-refresco
```

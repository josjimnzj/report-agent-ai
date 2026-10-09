# AD.Data.Assistant

Chat a pantalla completa para consultar en lenguaje natural la base de datos del CEM. Está hecho con Vue 3 y DevExtreme 22.2, siguiendo la estructura de `AD.Campaign.Manager`.

**Fase actual: front con datos en duro.** No se llama a ninguna API. El servicio `src/services/dataAgentApi.mock.js` emite la misma secuencia de eventos que el SSE de `workflow-agent-api` (`status…` y después `done`) y devuelve un payload con la forma de `done` (`columns`, `rows`, `queries`, `conversationId`, `runId`…). La fase 3 solo sustituye ese módulo por el cliente real.

## Uso

```bash
npm install
npm run dev        # http://localhost:5175
npm test           # node --test sobre las funciones puras
npm run build      # dist/ → AD.Web/Views/DataAssistant/
```

## Stack

- Vite 6, Vue 3.5, Vue Router 4.
- DevExtreme y devextreme-vue 22.2 (`dx.light.css`, locale `es-MX`).
- Tailwind 3 con los tokens `brandlight #009cdb` y `brandblue #074863`. Sin preflight y con `important: '.dx-viewport'` para que las utilidades ganen a `dx.light.css`.
- Font Awesome 6.
- Pinia con `pinia-plugin-persistedstate`. Las claves en localStorage son `ada.chats`, `ada.reports` y `ada.prefs`, y el esquema está en la versión 1 con `migrate`.
- `exceljs` y `file-saver` para exportar a Excel.

## Estructura

```
src/
  mocks/          datos en duro: ventas por mes y sucursal (12 meses), SQL, sugerencias y semillas del menú
  services/       dataAgentApi.js → hoy reexporta la implementación mock
  shared/         funciones puras: salesReport (KPIs, participación, insights, Markdown), persist, colores, notify
  stores/         chats y reports (persistidos), prefs (persistido), session (chat activo, no persistido)
  components/     ChatSidebar, ChatPanel, AssistantMessage, LiveProgress, Composer, ReportPanel,
                  KpiCard, BranchBarChart, MonthlyTrendChart, DetailTable, ShareDoughnut,
                  InsightsList, ResultGrid, SqlPanel, PromptDialog
  views/          AssistantView (menú + chat + resultados)
test/             salesReport.test.js, persist.test.js
```

## Qué hace la maqueta

- **Menú lateral.**
  - Conversaciones guardadas: abrir, fijar, renombrar y eliminar.
  - Reportes guardados.
  - Búsqueda y menú colapsable.
- **Chat.**
  - Pregunta libre o sugerencias, con progreso en vivo por fases y duración.
  - Botón Detener.
  - Botón Guardar: el chat activo es temporal hasta que se guarda y, una vez guardado, se actualiza solo.
  - Pide confirmación antes de descartar cambios.
- **Resultados.**
  - Pestaña Resultados: 4 KPI comparados con el periodo anterior, barras por sucursal, evolución mensual, detalle con totales, participación en dona e insights.
  - Pestaña Tabla: dxDataGrid con filtro, búsqueda, orden, totales y exportación a Excel.
  - Pestaña SQL: copiar una consulta o todas.
  - Pestaña Insights.
- **Periodo.** Últimos 3 o 6 meses. Siempre se compara con el mismo número de meses inmediatamente anteriores.
- **Respuestas simuladas.**
  - «¿Qué sucursal creció más?», «Compara con el periodo anterior» y «Analiza la rentabilidad» (responde que el CEM no tiene costos por sucursal).
  - «Muestra solo las 3 principales sucursales» filtra todo el reporte.
  - Cualquier otra pregunta devuelve el análisis de ventas.
- **Acciones.**
  - Guardar reporte: lo guarda en localStorage.
  - Exportar PDF: abre el diálogo de impresión con estilos de impresión; desde ahí se guarda como PDF.
  - Generar Markdown: descarga un `.md`.
  - Compartir: copia el resumen en Markdown al portapapeles.

## Diferencias con la imagen de referencia

- **Cifras.** La imagen tiene cifras que no cuadran entre sí: el KPI total, la tabla, el total de abril y los porcentajes de la dona. Aquí todas las cifras se calculan a partir de una sola tabla (`src/mocks/salesByBranch.js`), así que los KPI, las gráficas, la tabla, la dona, los insights y el Markdown siempre coinciden. Por eso los importes difieren de la imagen.
- **Selector de periodo.** Hay uno solo, global, en lugar de uno por gráfica, para no tener controles sin efecto.
- **Colores.** Las sucursales usan la paleta categórica validada para daltonismo, con el color fijo por sucursal. Al filtrar, las sucursales que quedan no cambian de color.

## Pendiente (fase 3)

- Cliente SSE real (`fetch` + `ReadableStream`) contra `POST /api/agent/query/stream`, seleccionado con `VITE_DATA_MODE=api`. La clave se pone en `.env.<amb>.local`.
- Traza y Log, ajustes de modelo y valoración 👍/👎. Están en el plan pero no tienen sentido con datos en duro.
- Interpretar resultados genéricos (`chartGuess`). Hoy el dashboard asume el resultado de ventas por mes y sucursal.
- Usuario real de la sesión del CEM. Hoy son las iniciales en duro `JG`.

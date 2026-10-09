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

## Docker y Render

La imagen compila con Node 22, ejecuta las pruebas y sirve `dist/` con nginx sin root. nginx escucha en `$PORT` (Render lo inyecta; en local es 8080), redirige a `index.html` las rutas de la SPA y responde `/healthz`.

El `Dockerfile` está en la raíz del repositorio, y el contexto de build también es la raíz:

```bash
# desde la raíz del repositorio
docker build -t ad-data-assistant .
docker run --rm -p 8080:8080 ad-data-assistant      # http://localhost:8080
```

**Render.** Funciona sin configurar nada, porque Render busca `./Dockerfile` en la raíz. El blueprint `render.yaml`, también en la raíz, define un servicio web Docker en el plan gratuito con comprobación de salud en `/healthz`. No necesita variables de entorno.

Para publicarlo:

1. En Render, abre **New → Blueprint**.
2. Elige el repositorio `josjimnzj/report-agent-ai` y la rama.
3. Pulsa **Apply**.

En el plan gratuito, el servicio se duerme tras 15 minutos sin tráfico y la primera visita después tarda unos 50 s.

## Stack

- Vite 6, Vue 3.5, Vue Router 4.
- DevExtreme y devextreme-vue 22.2 (`dx.light.css`, locale `es-MX`).
- Tailwind 3 con los tokens `brandlight #009cdb` y `brandblue #074863`. Sin preflight y con `important: '.dx-viewport'` para que las utilidades ganen a `dx.light.css`.
- Font Awesome 6.
- Pinia con `pinia-plugin-persistedstate`. Las claves en localStorage son `ada.chats`, `ada.reports` y `ada.prefs`.
- El esquema está en la versión 2. La migración desde la versión 1 quita los iconos de las conversaciones y añade las etiquetas sin perder los chats guardados.
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
                  InsightsList, ResultGrid, SqlPanel, PromptDialog, ChatDetailsDialog,
                  KebabMenu, ModelPicker, ReportActionDialog
  views/          AssistantView (menú + chat + resultados)
test/             salesReport.test.js, persist.test.js, tags.test.js, models.test.js, reportActions.test.js
```

## Qué hace la maqueta

- **Menú lateral.**
  - Conversaciones guardadas. El menú «⋯» de cada una permite fijarla arriba, editar el título y las etiquetas, o eliminarla.
  - Reportes guardados. El menú «⋯» de cada uno permite abrirlo, editarlo en una conversación nueva, disparar una campaña, crear un segmento, publicarlo en el menú (o quitarlo), renombrarlo o eliminarlo.
  - Segmentos y campañas creados, con su menú «⋯»: disparar una campaña con el segmento, o eliminar o cancelar.
  - Búsqueda por título o etiqueta, y menú colapsable.
- **Etiquetas.**
  - Hasta 6 por conversación, de texto libre.
  - Se asignan al guardar el chat o después, desde el menú «⋯» de la cabecera del chat abierto o del menú lateral.
  - No se duplican aunque cambien mayúsculas o acentos.
  - En el menú, las etiquetas en uso aparecen como filtros.
- **Acciones sobre un reporte (simuladas: no se envía nada al CEM).**
  - Se lanzan desde la conversación (botones bajo cada respuesta), desde el menú «Acciones» de Resultados o desde el «⋯» de un reporte guardado.
  - **Crear segmento:** nombre, quiénes entran (cuentas con venta ganada, con oportunidad no ganada o todas), sucursales y periodo. El tamaño estimado se calcula con los datos del reporte (`segmentSize`).
  - **Disparar campaña:** segmento (uno nuevo desde el reporte o uno existente), canal (llamada, correo, SMS o WhatsApp) y fecha de inicio. Pide confirmación antes de programarla.
  - **Publicar en el menú:** nombre, sección del menú, quién lo ve y periodo móvil. Si el reporte no estaba guardado, se guarda al publicarlo, y en el panel lateral aparece como «Publicado en …».
  - Todo queda en el navegador, en la clave `ada.actions` de localStorage.
- **Editar un reporte guardado en una conversación nueva.** Desde su «⋯» o con el botón que aparece en Resultados cuando el reporte está abierto. Crea un chat sin guardar con el reporte cargado para pedir cambios y guardarlo de nuevo.
- **Chat abierto.** Su cabecera tiene el mismo menú «⋯»: guardar (si aún no está guardado), fijar, editar título y etiquetas, nuevo chat y eliminar.
- **Modelo y esfuerzo.**
  - Se eligen en el selector bajo la caja de texto, con el mismo catálogo que `GET /api/models` (`src/mocks/models.js`): Claude Opus, Sonnet, Fable y Haiku, y Gemini Flash y Flash-Lite.
  - Las reglas son las de la API: Haiku no admite esfuerzo y Gemini solo tiene Bajo, Medio y Alto (Muy alto y Máximo se rebajan a Alto).
  - La elección se recuerda en el navegador y cada respuesta indica con qué modelo y esfuerzo se hizo.
  - Al pasar de Claude a Gemini, o al revés, la pregunta va como conversación nueva en el servidor y el chat lo avisa.
  - En la maqueta, el esfuerzo y el modelo cambian la duración simulada.
- **Pantallas pequeñas (menos de 1200 px).**
  - Se ve una vista a la vez, Chat o Resultados, con un selector arriba.
  - El menú se abre como cajón lateral.
  - «Análisis completado» lleva a Resultados, y un punto avisa cuando hay un resultado nuevo.
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
- Traza y Log, razonamiento visible, máximo de iteraciones y valoración 👍/👎. Están en el plan pero no tienen sentido con datos en duro.
- Interpretar resultados genéricos (`chartGuess`). Hoy el dashboard asume el resultado de ventas por mes y sucursal.
- Usuario real de la sesión del CEM. Hoy son las iniciales en duro `JG`.
- Segmentos, campañas y publicación reales: definir los endpoints del CEM (AD.Web) que crean listas de cuentas, programan campañas y registran opciones de menú. Hoy son simulados.

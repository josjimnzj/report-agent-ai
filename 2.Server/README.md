# AD.Data.Assistant.Api

Backend del asistente de datos: **agente propio** (Claude, Anthropic SDK para .NET) que responde preguntas de negocio sobre la base del CEM usando el **MCP de SQL Server de AddACCION** ([addaccion-mcp-sql](https://github.com/josjimnzj/addaccion-mcp-sql)) como proceso hijo por stdio, y que guarda todo en **Neon** como documentos JSON.

## Cómo funciona

1. `POST /api/agent/query/stream` recibe `{ question, conversationId?, model?, effort?, maxIterations? }` y responde por **Server-Sent Events**.
2. **Fases.** El agente arranca el MCP (`node /opt/addaccion-mcp-sql/dist/index.js`) y le da a Claude sus herramientas:
   - Grafo del esquema: `schema_overview`, `schema_search`, `schema_describe`, `schema_path`, `schema_examples` y `schema_checks`.
   - Exploración: `list_tables`, `describe_table`…
   - `execute_query`, solo lectura.

   El progreso llega como eventos `status` con `phase`/`label`: Interpretando, Revisando el modelo de datos, Generando consulta SQL, Ejecutando en SQL Server y Analizando resultados.
3. **Filas reales.** El servidor guarda el resultado completo de cada `execute_query`. El modelo solo ve una muestra (100 filas) y al final indica qué consulta es el resultado principal (`resultQuery`) y qué gráfica conviene (`chart`). Así las filas que recibe el usuario salen de SQL Server tal cual y no se gastan tokens en reescribirlas.
4. **Seguimiento.** Cada conversación guarda un historial compacto en Neon (pregunta, respuesta, SQL y 15 filas de muestra por turno, hasta 16 turnos). Las preguntas de seguimiento («ahora solo septiembre») reutilizan el SQL anterior.
5. **Registro.** Cada ejecución queda registrada (modelo, esfuerzo, iteraciones, tokens, SQL, error) en la colección `runs`.

**Modelos** (`GET /api/models`):

| Modelo | Uso | Fallback si declina por política |
|---|---|---|
| Claude Opus 5.5 | por defecto | Claude Opus 4.8 |
| Claude Sonnet 5.5 | — | — |
| Claude Haiku 5.5 | — | — |
| Claude Fable 5.1 | — | Claude Opus 4.8 |

- Todos admiten esfuerzo de `low` a `max`; el valor por defecto es `high`.
- El razonamiento es adaptativo.
- El prompt de sistema se cachea; la fecha de hoy va en el mensaje para no romper la caché.
- El fallback usa el parámetro beta `fallbacks` del servidor (`server-side-fallback-2026-06-01`). Se desactiva con `Anthropic__ServerFallbacks=false`.

## Almacenamiento (Neon)

Una tabla JSONB, `ada_documents (owner, collection, id, data, created_at, updated_at)`, que se crea sola al arrancar. Por ahora el dueño de todo es `admin` (`Storage__Owner`).

| Colección | Qué guarda | Endpoint |
|---|---|---|
| `chats` | conversaciones guardadas del front (con etiquetas y resultados, máximo 500 filas por turno) | `/api/docs/chats` |
| `reports` | reportes guardados con una copia del resultado | `/api/docs/reports` |
| `prefs` | preferencias (modelo, esfuerzo, menú…) | `/api/docs/prefs` |
| `conversations` | historial del agente para las preguntas de seguimiento | — |
| `runs` | registro de ejecuciones | — |

`GET /api/docs/{colección}`, `GET|PUT|DELETE /api/docs/{colección}/{id}`. Si no se configura `DATABASE_URL`, se usa memoria; solo sirve para desarrollo y se pierde al reiniciar.

Campañas, segmentos y publicar en el menú **aún no tienen backend**. En el front aparecen como «próximamente».

## Configuración

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de Anthropic |
| `DATABASE_URL` | Neon: `postgresql://usuario:clave@host/db?sslmode=require` |
| `Auth__ApiKey` | Clave que exige `/api/*` (`X-Api-Key` o `Authorization: Bearer`). Sin ella, `/api` responde 503 |
| `Cors__AllowedOrigins` | Orígenes del front, separados por coma, o `*` |
| `SqlMcp__Host`, `__Port`, `__Database`, `__User`, `__Password`, `__Encrypt`, `__TrustCert` | SQL Server del CEM (solo lectura) |
| `SqlMcp__Script` | Ruta del MCP compilado (en la imagen: `/opt/addaccion-mcp-sql/dist/index.js`) |
| `Anthropic__Model` / `__Effort` / `__DefaultMaxIterations` | Valores por defecto |
| `Telemetry__ConnectionString` | Opcional. Postgres **aparte** (otra base u otra cadena de Neon) para la telemetría. Sin valor, la telemetría está apagada |
| `Telemetry__RetentionDays` / `__RowSample` / `__MaxEventBytes` / `__MaxToolResultChars` | Retención (90 días para ejecuciones sin valoración), filas de muestra (20) y recortes del log |

`GET /health` informa el almacenamiento (`neon` o `memory`), si Neon dio error al arrancar, si hay clave de Anthropic y si la telemetría está activa.

## Telemetría

Portada de workflow-agent-api. Con `Telemetry__ConnectionString` cada ejecución del agente se guarda en la tabla `runs` de **esa** base: pregunta, respuesta, SQL, modelo, esfuerzo, estado, iteraciones, tokens, duración, versión, muestra de filas, eventos y traza. Las valoraciones 👍/👎 del chat van a `feedback`. El esquema se crea solo al arrancar y las escrituras van por una cola en segundo plano: si la base está dormida o caída, el usuario no lo nota. Acepta URL `postgresql://…` (SSL forzado salvo `sslmode` explícito) o cadena clave=valor.

| Endpoint | Uso |
|---|---|
| `GET /api/telemetry/status` | `{ enabled, lastError, retentionDays }`; el front lo usa para mostrar los botones de valoración |
| `POST /api/feedback` | `{ runId, rating: 1 \| -1, tags[], comment }` |
| `GET /api/telemetry/runs` · `summary` · `facets` | Historial y métricas; filtros `days`, `rating` (1, -1, 0 = sin valorar), `model`, `mode`, `status`, `q`, `limit`, `offset` |
| `GET /api/telemetry/runs/{id}` | Detalle completo de una ejecución |
| `GET /api/telemetry/export?format=csv\|json&detail=1` | Exportación (máx. 20 000 filas) |

Ejemplo: `select model, count(*), avg(f.rating) from runs r join feedback f on f.run_id = r.id group by model;`

### Traza, log e historial en el front

Igual que en workflow-agent-api:

- **Traza** (pestaña de Resultados): tokens de entrada, salida y caché, iteraciones, duración, modelo que sirvió, y cada llamada a herramienta con su entrada y la vista previa del resultado (`toolCalls` del evento `done`).
- **Log** (pestaña de Resultados): cada evento SSE con su tiempo desde el inicio: `request` (proveedor, modelo, esfuerzo, respaldo, max_tokens, iteraciones, tamaño del prompt, herramientas), fases, razonamiento, texto del modelo, herramientas (entrada y resultado), fin de cada iteración con tokens, fin y errores. Botones para copiar el log del turno, el de toda la conversación o todo (petición, respuesta, SQL, traza y log). El log se guarda con el chat (recortado: 4 000 caracteres por entrada y 120 000 por turno).
- **Valoración**: 👍 se guarda al momento; 👎 pide motivos (mismos que workflow-agent-api) y un comentario.
- **Historial y métricas** (menú lateral): filtros por periodo, valoración, modelo, modo y estado, búsqueda libre, resumen por modelo (acierto, errores, límites, iteraciones, tokens y segundos promedio), lista paginada con la traza y el log guardados de cada ejecución, copia del detalle en JSON y exportación a CSV o JSON completo.

El agente marca sus ejecuciones con `mode = "query"`; si la base se comparte con workflow-agent-api, el filtro «Modo» también muestra las de `workflow`.

## Gráficas y reporte

La respuesta final del agente incluye `chart`, `display`, `reusePrevious`, `askChart`, `openReport` e `insights`:

- `display: "table_first"` (por defecto, sin gráfica pedida): Resultados muestra primero los **datos en crudo** en tabla y el agente pregunta si se lleva a una gráfica; `chart` es su sugerencia. Un clic en «Ver en …», en los atajos bajo la respuesta o en el selector la dibuja sin volver a consultar.
- `display: "table_only"`: el usuario pidió solo tabla; no se insiste con gráficas (el selector sigue disponible). **Regla del servidor:** si la pregunta dice «solo tabla», «sin gráfica», «en tabla», «datos en crudo» o «no quiero gráfica», se fuerza `table_only` aunque el modelo diga otra cosa.
- `display: "chart"`: gráfica pedida; se dibuja directo solo si el agente está 100 % seguro del tipo; si no, la propone y pregunta (`askChart`).
- `reusePrevious`: el usuario solo cambió cómo se ve el resultado anterior (solo tabla, otra gráfica, líneas); el agente no vuelve a consultar y el front reutiliza los datos, el SQL y los insights del turno anterior.
- `insights`: 2 a 4 hallazgos (`finding`), alertas (`alert`) y recomendaciones (`recommendation`) con cifras de los datos. Se muestran en Resultados («Insights y recomendaciones») y en la pestaña Insights, se guardan con el reporte y van en el Markdown.
- `openReport`: el usuario pidió verlo en el reporte; el front abre Resultados.
- El selector de tipo incluye «Solo tabla (sin gráfica)» para volver a los datos.

`chart` (DevExtreme dxChart / dxPieChart):

| Campo | Valores |
|---|---|
| `type` | `bar`, `horizontalbar`, `stackedbar`, `fullstackedbar`, `combo` (barras + línea), `line`, `spline`, `stepline`, `area`, `splinearea`, `stackedarea`, `scatter`, `pie`, `doughnut`, `none` |
| `x`, `y` | Columna del eje / categorías y columnas numéricas |
| `series` | Mezcla por columna: `{ column, type: bar\|line\|spline\|area\|scatter, axis: left\|right }` (p. ej. barras de ventas y monto como línea en el eje derecho) |
| `refLines` | Líneas de referencia: `{ kind: average\|max\|min\|value, column, value, label }` (promedio, máximo y mínimo se calculan en el front con todas las filas; `value` para metas) |

Las líneas de referencia son **opcionales**: el agente solo las agrega si se piden y por defecto no hay ninguna. En Resultados el usuario cambia el tipo (lista agrupada), elige líneas de referencia (promedio, máximo, mínimo y una meta en un valor fijo, todas opcionales) y abre la ayuda «¿Qué gráficas hay?» con todos los tipos, extras y ejemplos para pedírselos al asistente. Al **guardar un reporte** se elige la gráfica con vista previa (si se estaba viendo la tabla, parte de la sugerida; también se puede guardar «Solo tabla»); queda en el reporte (`chartType`, `chartLines`; `[]` = sin líneas) y se usa al reabrirlo.

## Desarrollo

```bash
# MCP compilado en local
git clone https://github.com/josjimnzj/addaccion-mcp-sql ../addaccion-mcp-sql && (cd ../addaccion-mcp-sql && npm ci && npm run build)

cd 2.Server/AD.Data.Assistant.Api
ANTHROPIC_API_KEY=… Auth__ApiKey=devkey Cors__AllowedOrigins=* \
SqlMcp__Script=../../../addaccion-mcp-sql/dist/index.js SqlMcp__Host=… SqlMcp__User=… SqlMcp__Password=… SqlMcp__Database=… \
dotnet run            # sin DATABASE_URL usa memoria

cd 2.Server && dotnet test
# Las pruebas del almacén contra un Postgres real se activan con
# ADA_TEST_PG="Host=localhost;Port=5432;Username=postgres;Database=ada_test"
```

El front en desarrollo se conecta con `VITE_DATA_MODE=api VITE_DATA_API_URL=http://localhost:5080 VITE_DATA_API_KEY=devkey npm run dev`.

## Docker

El `Dockerfile` de la raíz construye una sola imagen:

- El front compilado en `wwwroot`.
- La API publicada.
- addaccion-mcp-sql, compilado desde la copia en `3.Mcp/addaccion-mcp-sql` (el repositorio original es privado; para actualizarlo, copia de nuevo su contenido).

Corre sobre `aspnet:10.0`, sin root. La API sirve la SPA en cualquier ruta que no sea `/api` ni `/health`. CORS sigue disponible para clientes en otro dominio.

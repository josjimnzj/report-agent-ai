// Datos en duro para la maqueta funcional. Tienen la forma del evento `done` de
// POST /api/agent/query/stream (workflow-agent-api): columns[], rows[][], queries[].
// Una fila por mes y sucursal, 12 meses: los 6 últimos son el periodo actual y los 6 anteriores
// la base de comparación. Monto = suma de EstimatedAmount de las ventas ganadas.

export const BRANCHES = ['Centro', 'Norte', 'Sur', 'Oriente', 'Occidente', 'Pacífico'];

export const SALES_COLUMNS = ['Mes', 'Sucursal', 'Monto', 'Oportunidades', 'Ganadas'];

export const SALES_ROWS = [
  ['2025-07', 'Centro', 33100, 61, 17],
  ['2025-07', 'Norte', 27400, 50, 13],
  ['2025-07', 'Sur', 22800, 42, 10],
  ['2025-07', 'Oriente', 26300, 48, 12],
  ['2025-07', 'Occidente', 19600, 36, 8],
  ['2025-07', 'Pacífico', 14900, 28, 6],
  ['2025-08', 'Centro', 34000, 62, 17],
  ['2025-08', 'Norte', 28200, 51, 14],
  ['2025-08', 'Sur', 23500, 43, 10],
  ['2025-08', 'Oriente', 27100, 49, 12],
  ['2025-08', 'Occidente', 20200, 37, 8],
  ['2025-08', 'Pacífico', 15300, 28, 6],
  ['2025-09', 'Centro', 35200, 65, 18],
  ['2025-09', 'Norte', 29000, 53, 14],
  ['2025-09', 'Sur', 24100, 44, 10],
  ['2025-09', 'Oriente', 27800, 51, 13],
  ['2025-09', 'Occidente', 20700, 38, 9],
  ['2025-09', 'Pacífico', 15600, 29, 6],
  ['2025-10', 'Centro', 36400, 66, 18],
  ['2025-10', 'Norte', 30100, 54, 14],
  ['2025-10', 'Sur', 25000, 45, 11],
  ['2025-10', 'Oriente', 28900, 52, 13],
  ['2025-10', 'Occidente', 21500, 39, 9],
  ['2025-10', 'Pacífico', 16200, 29, 6],
  ['2025-11', 'Centro', 38900, 69, 19],
  ['2025-11', 'Norte', 32300, 57, 15],
  ['2025-11', 'Sur', 26800, 48, 11],
  ['2025-11', 'Oriente', 30700, 55, 14],
  ['2025-11', 'Occidente', 22800, 41, 9],
  ['2025-11', 'Pacífico', 17000, 30, 7],
  ['2025-12', 'Centro', 41200, 70, 20],
  ['2025-12', 'Norte', 34500, 59, 16],
  ['2025-12', 'Sur', 28700, 49, 12],
  ['2025-12', 'Oriente', 32400, 55, 14],
  ['2025-12', 'Occidente', 24300, 42, 9],
  ['2025-12', 'Pacífico', 18100, 31, 7],
  ['2026-01', 'Centro', 32400, 67, 20],
  ['2026-01', 'Norte', 28100, 58, 17],
  ['2026-01', 'Sur', 21300, 44, 11],
  ['2026-01', 'Oriente', 25800, 53, 14],
  ['2026-01', 'Occidente', 18900, 39, 10],
  ['2026-01', 'Pacífico', 14200, 29, 7],
  ['2026-02', 'Centro', 36200, 68, 21],
  ['2026-02', 'Norte', 31500, 60, 17],
  ['2026-02', 'Sur', 24000, 45, 12],
  ['2026-02', 'Oriente', 27900, 53, 14],
  ['2026-02', 'Occidente', 20400, 39, 10],
  ['2026-02', 'Pacífico', 16300, 31, 7],
  ['2026-03', 'Centro', 41300, 70, 22],
  ['2026-03', 'Norte', 34200, 58, 17],
  ['2026-03', 'Sur', 28400, 48, 13],
  ['2026-03', 'Oriente', 32100, 54, 15],
  ['2026-03', 'Occidente', 24100, 41, 10],
  ['2026-03', 'Pacífico', 19800, 34, 8],
  ['2026-04', 'Centro', 39800, 70, 22],
  ['2026-04', 'Norte', 33600, 59, 17],
  ['2026-04', 'Sur', 26700, 47, 13],
  ['2026-04', 'Oriente', 30400, 53, 15],
  ['2026-04', 'Occidente', 22600, 40, 10],
  ['2026-04', 'Pacífico', 17900, 31, 7],
  ['2026-05', 'Centro', 45200, 71, 22],
  ['2026-05', 'Norte', 37100, 58, 18],
  ['2026-05', 'Sur', 33000, 52, 14],
  ['2026-05', 'Oriente', 38600, 61, 17],
  ['2026-05', 'Occidente', 26800, 42, 11],
  ['2026-05', 'Pacífico', 21400, 34, 8],
  ['2026-06', 'Centro', 47100, 75, 24],
  ['2026-06', 'Norte', 40300, 64, 20],
  ['2026-06', 'Sur', 32600, 52, 14],
  ['2026-06', 'Oriente', 36200, 57, 17],
  ['2026-06', 'Occidente', 28400, 45, 12],
  ['2026-06', 'Pacífico', 24900, 40, 10],
];

// Consulta según el glosario del grafo (addaccion-mcp-sql): ventas = AD_Case de FormType 'SALE',
// monto = EstimatedAmount, ganada = ProductStateId IN ('GANAD','APROB'), sucursal = ST_T_User.LocationId.
export const SALES_QUERIES = [
  `SELECT TOP 500
       FORMAT(C.ResolvedOn, 'yyyy-MM') AS Mes,
       L.LocationName AS Sucursal,
       SUM(CASE WHEN D.ProductStateId IN ('GANAD','APROB') THEN C.EstimatedAmount ELSE 0 END) AS Monto,
       COUNT(C.CaseId) AS Oportunidades,
       SUM(CASE WHEN D.ProductStateId IN ('GANAD','APROB') THEN 1 ELSE 0 END) AS Ganadas
FROM AD_Case C
JOIN AD_T_CaseType CT ON CT.CaseTypeId = C.CaseTypeId AND CT.FormType = 'SALE'
JOIN AD_T_ProductStateDefinition D ON D.CaseTypeId = C.CaseTypeId AND D.CaseStateId = C.CaseStateId
JOIN ST_T_User U ON U.UserId = C.Owner
JOIN ST_T_Location L ON L.LocationId = U.LocationId AND L.IsBranch = 'S'
WHERE C.CaseId > 0
  AND C.ResolvedOn >= DATEADD(MONTH, -12, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
GROUP BY FORMAT(C.ResolvedOn, 'yyyy-MM'), L.LocationName
ORDER BY Mes, Sucursal`,
];

export const SALES_QUESTION = 'Muéstrame el análisis de ventas por sucursal de los últimos 6 meses.';

// Fases que muestra el progreso en vivo. `ms` es la duración simulada.
export const MOCK_PHASES = [
  { id: 'interpret', label: 'Interpretando tu consulta', ms: 700 },
  { id: 'sql', label: 'Generando consulta SQL', ms: 550 },
  { id: 'execute', label: 'Ejecutando en SQL Server', ms: 1100 },
  { id: 'process', label: 'Procesando resultados', ms: 400 },
  { id: 'charts', label: 'Generando visualizaciones', ms: 250 },
];

export const SUGGESTIONS = [
  '¿Qué sucursal creció más?',
  'Compara con el periodo anterior',
  'Muestra solo las 3 principales sucursales',
  'Analiza la rentabilidad por sucursal',
];

export const EMPTY_STATE_SUGGESTIONS = [
  SALES_QUESTION,
  'Ventas ganadas por mes en 2026',
  'Trámites abiertos por asunto',
  'Top 10 vendedores por oportunidades ganadas',
];

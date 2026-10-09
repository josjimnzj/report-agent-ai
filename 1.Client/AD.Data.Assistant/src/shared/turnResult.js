// Convierte el evento «done» del agente en los campos de un turno del chat.

/** 'chart' | 'table_first' | 'table_only' (respuestas anteriores solo traían showChart). */
export function displayOf(done) {
  if (['chart', 'table_first', 'table_only'].includes(done?.display)) return done.display;
  return done?.showChart === false ? 'table_first' : 'chart';
}

/**
 * @param {object} done payload del evento «done»
 * @param {object|null} previous último turno con datos del chat: si el agente solo cambió cómo se ve
 *   (`reusePrevious`, sin consulta nueva), se reutilizan sus datos, SQL e insights.
 */
export function turnFromDone(done, previous = null) {
  const display = displayOf(done);
  const reuse = Boolean(done.reusePrevious) && !done.columns?.length && previous?.columns?.length > 0;
  const source = reuse ? previous : done;
  const insights = Array.isArray(done.insights) && done.insights.length ? done.insights : (reuse ? previous.insights ?? [] : []);
  const view = { ...(done.view ?? {}), chart: done.view?.chart ?? (reuse ? previous.view?.chart ?? null : null) };
  // «Solo tabla» pedido en el chat: queda como elección explícita (sin la propuesta de llevarlo a gráfica).
  if (display === 'table_only') view.chartType = 'table';
  return {
    status: done.status, answer: done.answer,
    columns: source.columns ?? [], rows: source.rows ?? [], totalRows: source.totalRows ?? source.rows?.length ?? 0,
    truncated: reuse ? Boolean(previous.truncated) : undefined,
    queries: reuse ? previous.queries ?? [] : done.queries ?? [],
    view, display, showChart: display === 'chart', reused: reuse, insights,
    // El reporte conserva el título de la pregunta que trajo los datos, no «Ahora solo tabla».
    sourceQuestion: reuse ? previous.sourceQuestion ?? previous.question ?? null : null,
    askChart: display === 'chart' && Boolean(done.askChart), openReport: Boolean(done.openReport),
  };
}

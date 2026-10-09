import { defineStore } from 'pinia';
import { streamQuery } from '@/services/dataAgentApi';
import { sendFeedback } from '@/services/telemetryApi';
import { capLog, capture } from '@/shared/runLog';
import { newId } from '@/shared/ids';
import { $notify } from '@/shared/notify';
import { normalizeTags } from '@/shared/tags';
import { useChatsStore } from './chats';
import { useModelsStore } from './models';
import { PROVIDER_LABELS } from '@/shared/models';
import { SALES_COLUMNS, SALES_QUERIES, SALES_ROWS } from '@/mocks/salesByBranch';

const blankChat = () => ({ id: newId(), title: '', tags: [], conversationId: null, provider: null, turns: [], createdAt: Date.now() });

/**
 * Un chat abierto desde un reporte guardado aún no tiene conversación en el servidor: la primera pregunta
 * lleva el SQL del reporte como contexto para que el agente parta de él.
 */
function withReportContext(chat, question) {
  const base = chat.turns.find((t) => t.kind === 'report');
  if (chat.conversationId || !base?.queries?.length) return question;
  return `Partimos del reporte guardado «${chat.title}», que se obtuvo con este SQL:\n${base.queries.join('\n\n')}\n\nPetición: ${question}`;
}

// Estado del chat activo. No se persiste: un chat solo se guarda con «Guardar».
export const useSessionStore = defineStore('session', {
  state: () => ({
    chat: blankChat(),
    savedId: null,
    dirty: false,
    running: false,
    selectedTurnId: null,
    reportTitle: null,
    reportOverride: null, // reporte guardado abierto: { id, title, months, branches, columns, rows, queries }
    controller: null,
    revealTick: 0, // sube cuando el usuario pidió ver el resultado en el reporte
  }),
  getters: {
    turnsWithData: (s) => s.chat.turns.filter((t) => (t.status === 'ok' || t.status === 'max_iterations') && t.columns?.length),
    selectedTurn() {
      return this.turnsWithData.find((t) => t.id === this.selectedTurnId) ?? this.turnsWithData.at(-1) ?? null;
    },
    isSaved: (s) => s.savedId !== null,
    /** Lo que muestra el panel de resultados: un reporte guardado abierto o el turno seleccionado. */
    result() {
      if (this.reportOverride) return this.reportOverride;
      const t = this.selectedTurn;
      return t ? {
        id: t.id, title: null, question: t.question, answer: t.answer, chart: t.view?.chart ?? null,
        chartType: t.view?.chartType ?? null, askChart: Boolean(t.askChart), turnId: t.kind === 'report' ? null : t.id,
        branches: t.view?.branches ?? null, columns: t.columns, rows: t.rows,
        queries: t.queries, totalRows: t.totalRows ?? t.rows.length, truncated: Boolean(t.truncated),
      } : null;
    },
  },
  actions: {
    openChat(id) {
      const saved = useChatsStore().byId(id);
      if (!saved) return;
      this.chat = { tags: [], ...JSON.parse(JSON.stringify(saved)) };
      this.savedId = saved.id;
      this.dirty = false;
      this.selectedTurnId = null;
      this.reportTitle = null;
      this.reportOverride = null;
    },
    newChat() {
      this.chat = blankChat();
      this.savedId = null;
      this.dirty = false;
      this.selectedTurnId = null;
      this.reportTitle = null;
      this.reportOverride = null;
    },
    saveChat(title, tags = this.chat.tags) {
      this.chat.title = title.trim() || this.chat.turns[0]?.question.slice(0, 60) || 'Chat sin título';
      this.chat.tags = normalizeTags(tags);
      useChatsStore().upsert(this.chat);
      this.savedId = this.chat.id;
      this.dirty = false;
    },
    /** Cambia título y etiquetas de un chat guardado (y del activo si es el mismo). */
    updateChat(id, { title, tags }) {
      useChatsStore().update(id, { title, tags });
      if (this.savedId === id) {
        const saved = useChatsStore().byId(id);
        this.chat.title = saved.title;
        this.chat.tags = [...saved.tags];
      }
    },
    persistIfSaved() {
      if (this.savedId) useChatsStore().upsert(this.chat);
      else this.dirty = true;
    },
    /** Datos de un reporte guardado para mostrarlo o actuar sobre él (null si es de ejemplo sin datos). */
    savedReportData(report) {
      if (report.result) {
        // Reporte guardado con su resultado (modo API).
        return {
          id: report.id, title: report.title, months: report.months ?? 6, branches: report.branches ?? null,
          columns: report.result.columns, rows: report.result.rows, queries: report.result.queries,
          answer: report.result.answer, chart: report.result.chart, chartType: report.result.chartType ?? null,
          totalRows: report.result.totalRows, reportId: report.id,
        };
      }
      if (report.source !== 'sales') {
        $notify.info(`«${report.title}» es un reporte de ejemplo sin datos en esta maqueta.`);
        return null;
      }
      return {
        id: report.id, title: report.title, months: report.months ?? 6, branches: report.branches ?? null,
        columns: SALES_COLUMNS, rows: SALES_ROWS, queries: SALES_QUERIES, reportId: report.id,
      };
    },
    /** Abre un reporte guardado en una conversación nueva para seguir ajustándolo. */
    openReportInNewChat(report) {
      const data = this.savedReportData(report);
      if (!data) return false;
      this.newChat();
      const scope = data.branches?.length ? data.branches.join(', ') : 'todas las sucursales';
      const answer = report.result
        ? `Cargué el reporte guardado «${report.title}». Pídeme los cambios (otro periodo, otro filtro, una comparación…) y guárdalo de nuevo desde Resultados.`
        : `Cargué el reporte guardado «${report.title}» (últimos ${data.months} meses · ${scope}). Pídeme los cambios: otro periodo, otras sucursales, una comparación… y guárdalo de nuevo desde Resultados.`;
      this.chat.title = report.title;
      this.chat.turns.push({
        id: newId(), kind: 'report', reportId: report.id, question: `Editar el reporte «${report.title}»`,
        askedAt: Date.now(), answeredAt: Date.now(), status: 'ok', phases: [],
        answer, columns: data.columns, rows: data.rows, queries: data.queries, totalRows: data.totalRows,
        view: { branches: data.branches, chart: data.chart ?? null, chartType: data.chartType ?? null }, reportAnswer: data.answer ?? null,
        elapsedMs: 0, runId: null,
      });
      this.reportTitle = report.title;
      this.dirty = true;
      return true;
    },
    openReport(report) {
      const data = this.savedReportData(report);
      if (!data) return false;
      this.reportOverride = data;
      return true;
    },
    /** Tipo de gráfica elegido por el usuario para un turno (o para el reporte guardado abierto). */
    setChartType(type, turnId = null) {
      if (this.reportOverride && !turnId) {
        this.reportOverride = { ...this.reportOverride, chartType: type };
        return;
      }
      const turn = turnId ? this.chat.turns.find((t) => t.id === turnId) : this.selectedTurn;
      if (!turn) return;
      turn.view = { ...(turn.view ?? {}), chartType: type };
      this.persistIfSaved();
    },
    /** Valoración 👍/👎 de una respuesta (telemetría del servidor); 👎 puede llevar motivos y comentario. */
    async rate(turnId, rating, { tags = [], comment = null } = {}) {
      const turn = this.chat.turns.find((t) => t.id === turnId);
      if (!turn?.runId) return false;
      const previous = { rating: turn.rating ?? null, ratingTags: turn.ratingTags ?? [], ratingComment: turn.ratingComment ?? null };
      Object.assign(turn, { rating, ratingTags: tags, ratingComment: comment });
      try {
        await sendFeedback(turn.runId, rating, { tags, comment });
        this.persistIfSaved();
        return true;
      } catch (err) {
        Object.assign(turn, previous);
        $notify.handleError(err);
        return false;
      }
    },
    stop() {
      this.controller?.abort();
    },
    async ask(question) {
      const q = question.trim();
      if (!q || this.running) return;
      const models = useModelsStore();
      await models.load();
      const run = models.current ?? { model: null, label: 'Modelo por defecto', effort: null, provider: null };
      // El historial del servidor es de un proveedor: al cambiar de Claude a Gemini (o al revés) empieza conversación nueva.
      let note = null;
      if (this.chat.provider && run.provider && run.provider !== this.chat.provider && this.chat.conversationId) {
        note = `Cambiaste de ${PROVIDER_LABELS[this.chat.provider]} a ${PROVIDER_LABELS[run.provider]}: la pregunta se envió como conversación nueva en el servidor. El hilo de aquí se conserva.`;
        this.chat.conversationId = null;
      }
      this.chat.provider = run.provider;
      const turn = {
        id: newId(), question: q, askedAt: Date.now(), status: 'running', answer: '', phases: [],
        columns: [], rows: [], queries: [], view: null, elapsedMs: 0, runId: null,
        model: run.model, modelLabel: run.label, effort: run.effort, provider: run.provider, note,
        log: [], toolCalls: [], usage: null, iterations: null,
      };
      this.chat.turns.push(turn);
      const live = this.chat.turns.at(-1);
      this.running = true;
      this.controller = new AbortController();
      let last = null;
      const closePhase = (at) => { if (last) last.ms = Math.round(at - last.startedAt); };
      try {
        const done = await streamQuery(
          { question: withReportContext(this.chat, q), conversationId: this.chat.conversationId, model: run.model, effort: run.effort },
          {
            signal: this.controller.signal,
            onRaw: (event, data) => capture(live.log, event, data),
            onEvent: (e) => {
              if (e.type === 'status') {
                closePhase(e.at);
                live.phases.push({ id: e.phase, label: e.label, startedAt: e.at, ms: null });
                last = live.phases.at(-1);
              } else if (e.type === 'done') {
                closePhase(e.at);
                last = null;
              }
            },
          },
        );
        Object.assign(live, {
          status: done.status, answer: done.answer, columns: done.columns, rows: done.rows, totalRows: done.totalRows ?? done.rows?.length,
          queries: done.queries, view: done.view, elapsedMs: done.elapsedMs, runId: done.runId, answeredAt: Date.now(),
          servedBy: done.servedBy ?? null, askChart: Boolean(done.askChart), openReport: Boolean(done.openReport), rating: null,
          toolCalls: Array.isArray(done.toolCalls) ? done.toolCalls : [], usage: done.usage ?? null, iterations: done.iterations ?? null,
        });
        this.chat.conversationId = done.conversationId;
        this.selectedTurnId = live.id;
        this.reportOverride = null;
        this.reportTitle = null;
        if (done.openReport) this.revealTick += 1;
      } catch (err) {
        closePhase(performance.now());
        live.status = err?.name === 'AbortError' ? 'stopped' : 'error';
        live.answer = live.status === 'stopped' ? 'Consulta detenida.' : (err?.message || 'La consulta falló.');
        live.answeredAt = Date.now();
        $notify.handleError(err);
      } finally {
        live.log = capLog(live.log);
        this.running = false;
        this.controller = null;
        this.persistIfSaved();
      }
    },
  },
});

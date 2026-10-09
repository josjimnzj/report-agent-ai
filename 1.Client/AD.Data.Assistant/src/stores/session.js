import { defineStore } from 'pinia';
import { streamQuery } from '@/services/dataAgentApi';
import { newId } from '@/shared/ids';
import { $notify } from '@/shared/notify';
import { normalizeTags } from '@/shared/tags';
import { useChatsStore } from './chats';
import { SALES_COLUMNS, SALES_QUERIES, SALES_ROWS } from '@/mocks/salesByBranch';

const blankChat = () => ({ id: newId(), title: '', tags: [], conversationId: null, turns: [], createdAt: Date.now() });

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
  }),
  getters: {
    turnsWithData: (s) => s.chat.turns.filter((t) => t.status === 'ok' && t.columns?.length),
    selectedTurn() {
      return this.turnsWithData.find((t) => t.id === this.selectedTurnId) ?? this.turnsWithData.at(-1) ?? null;
    },
    isSaved: (s) => s.savedId !== null,
    /** Lo que muestra el panel de resultados: un reporte guardado abierto o el turno seleccionado. */
    result() {
      if (this.reportOverride) return this.reportOverride;
      const t = this.selectedTurn;
      return t ? {
        id: t.id, title: null, branches: t.view?.branches ?? null, columns: t.columns, rows: t.rows,
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
    openReport(report) {
      if (report.source !== 'sales') {
        $notify.info(`«${report.title}» es un reporte de ejemplo sin datos en esta maqueta.`);
        return false;
      }
      this.reportOverride = {
        id: report.id, title: report.title, months: report.months, branches: report.branches,
        columns: SALES_COLUMNS, rows: SALES_ROWS, queries: SALES_QUERIES,
      };
      return true;
    },
    stop() {
      this.controller?.abort();
    },
    async ask(question) {
      const q = question.trim();
      if (!q || this.running) return;
      const turn = {
        id: newId(), question: q, askedAt: Date.now(), status: 'running', answer: '', phases: [],
        columns: [], rows: [], queries: [], view: null, elapsedMs: 0, runId: null,
      };
      this.chat.turns.push(turn);
      const live = this.chat.turns.at(-1);
      this.running = true;
      this.controller = new AbortController();
      let last = null;
      const closePhase = (at) => { if (last) last.ms = Math.round(at - last.startedAt); };
      try {
        const done = await streamQuery(
          { question: q, conversationId: this.chat.conversationId },
          {
            signal: this.controller.signal,
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
          status: done.status, answer: done.answer, columns: done.columns, rows: done.rows,
          queries: done.queries, view: done.view, elapsedMs: done.elapsedMs, runId: done.runId, answeredAt: Date.now(),
        });
        this.chat.conversationId = done.conversationId;
        this.selectedTurnId = live.id;
        this.reportOverride = null;
        this.reportTitle = null;
      } catch (err) {
        closePhase(performance.now());
        live.status = err?.name === 'AbortError' ? 'stopped' : 'error';
        live.answer = live.status === 'stopped' ? 'Consulta detenida.' : (err?.message || 'La consulta falló.');
        live.answeredAt = Date.now();
        $notify.handleError(err);
      } finally {
        this.running = false;
        this.controller = null;
        this.persistIfSaved();
      }
    },
  },
});

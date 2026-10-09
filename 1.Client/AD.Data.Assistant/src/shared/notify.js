import notify from 'devextreme/ui/notify';

const show = (message, type, displayTime = 3000) =>
  notify({ message, type, displayTime, width: 'auto', position: { at: 'bottom center', my: 'bottom center', offset: '0 -24' } });

export const $notify = {
  success: (m) => show(m, 'success'),
  info: (m) => show(m, 'info'),
  warning: (m) => show(m, 'warning', 4500),
  error: (m) => show(m, 'error', 6000),
  handleError(err, fallback = 'Ocurrió un error inesperado.') {
    if (err?.name === 'AbortError') return;
    console.error(err);
    show(err?.message || fallback, 'error', 6000);
  },
};

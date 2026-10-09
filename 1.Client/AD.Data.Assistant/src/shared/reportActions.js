// Acciones sobre un reporte: crear segmento, disparar campaña y publicar en el menú del CEM.
// En la maqueta son simuladas; el tamaño del segmento sí se calcula con los datos del reporte.

export const SEGMENT_CRITERIA = [
  { id: 'won', text: 'Cuentas con venta ganada', hint: 'Venta cruzada, fidelización o encuestas de satisfacción.' },
  { id: 'notWon', text: 'Cuentas con oportunidad no ganada', hint: 'Reactivar oportunidades perdidas o que siguen abiertas.' },
  { id: 'all', text: 'Todas las cuentas con oportunidad', hint: 'Todo el periodo y las sucursales del reporte.' },
];

export const CHANNELS = [
  { id: 'call', text: 'Llamada', icon: 'fa-solid fa-phone' },
  { id: 'email', text: 'Correo', icon: 'fa-solid fa-envelope' },
  { id: 'sms', text: 'SMS', icon: 'fa-solid fa-comment-sms' },
  { id: 'whatsapp', text: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
];

export const MENU_SECTIONS = ['Reportes', 'Ventas', 'Sucursales', 'Dirección'];

export const AUDIENCES = [
  { id: 'me', text: 'Solo yo' },
  { id: 'team', text: 'Mi equipo' },
  { id: 'company', text: 'Toda la empresa' },
];

const label = (list, id) => list.find((x) => x.id === id)?.text ?? id;
export const criterionLabel = (id) => label(SEGMENT_CRITERIA, id);
export const channelLabel = (id) => label(CHANNELS, id);
export const audienceLabel = (id) => label(AUDIENCES, id);

/**
 * Cuentas que entrarían en el segmento: se suman los casos de los últimos `months` meses de las
 * sucursales del reporte (null = todas). Cada caso cuenta como una cuenta (aproximación).
 */
export function segmentSize(columns, rows, { months = 6, branches = null, criterion = 'won' } = {}) {
  const i = Object.fromEntries(columns.map((c, n) => [c, n]));
  const keys = [...new Set(rows.map((r) => r[i.Mes]))].sort().slice(-months);
  let opportunities = 0;
  let won = 0;
  for (const r of rows) {
    if (!keys.includes(r[i.Mes])) continue;
    if (branches?.length && !branches.includes(r[i.Sucursal])) continue;
    opportunities += Number(r[i.Oportunidades]) || 0;
    won += Number(r[i.Ganadas]) || 0;
  }
  if (criterion === 'won') return won;
  if (criterion === 'notWon') return opportunities - won;
  return opportunities;
}

/** «últimos 6 meses · Centro, Norte» o «últimos 6 meses · todas las sucursales» */
export function describeScope({ months = 6, branches = null } = {}) {
  return `últimos ${months} meses · ${branches?.length ? branches.join(', ') : 'todas las sucursales'}`;
}

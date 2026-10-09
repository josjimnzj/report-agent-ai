import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SAVED_ROWS, SCHEMA_VERSION, compactTurn, createSafeStorage, migrate } from '../src/shared/persist.js';

test('compactTurn recorta filas y marca truncated', () => {
  const rows = Array.from({ length: MAX_SAVED_ROWS + 20 }, (_, i) => [i]);
  const t = compactTurn({ rows });
  assert.equal(t.rows.length, MAX_SAVED_ROWS);
  assert.equal(t.totalRows, MAX_SAVED_ROWS + 20);
  assert.equal(t.truncated, true);
  const small = compactTurn({ rows: [[1]] });
  assert.equal(small.truncated, false);
  assert.equal(small.totalRows, 1);
});

test('migrate acepta la versión actual y descarta otras', () => {
  const defaults = { version: SCHEMA_VERSION, chats: [] };
  assert.deepEqual(migrate({ version: SCHEMA_VERSION, chats: [1] }, defaults), { version: SCHEMA_VERSION, chats: [1] });
  assert.equal(migrate({ version: 0, chats: [1] }, defaults), defaults);
  assert.equal(migrate(null, defaults), defaults);
});

test('createSafeStorage avisa al llenarse la cuota sin lanzar', () => {
  const err = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  globalThis.localStorage = { getItem: () => 'x', setItem: () => { throw err; } };
  let warned = null;
  const s = createSafeStorage((k) => { warned = k; });
  assert.doesNotThrow(() => s.setItem('ada.chats', '{}'));
  assert.equal(warned, 'ada.chats');
  assert.equal(s.getItem('k'), 'x');
  delete globalThis.localStorage;
});

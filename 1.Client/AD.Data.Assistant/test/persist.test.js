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

test('migrate acepta la versión actual y descarta estados inválidos o futuros', () => {
  const defaults = { version: SCHEMA_VERSION, chats: [] };
  assert.deepEqual(migrate({ version: SCHEMA_VERSION, chats: [1] }, defaults), { version: SCHEMA_VERSION, chats: [1] });
  assert.equal(migrate({ version: SCHEMA_VERSION + 1, chats: [1] }, defaults), defaults);
  assert.equal(migrate(null, defaults), defaults);
  assert.equal(migrate({ chats: [1] }, defaults), defaults);
});

test('migrate aplica las migraciones en orden y descarta si falta un paso', () => {
  const defaults = { version: SCHEMA_VERSION, chats: [] };
  const upgrades = { 1: (s) => ({ ...s, chats: s.chats.map(({ icon, ...c }) => ({ ...c, tags: [] })) }) };
  const v1 = { version: 1, chats: [{ id: 'a', icon: 'fa-x' }] };
  assert.deepEqual(migrate(v1, defaults, upgrades), { version: 2, chats: [{ id: 'a', tags: [] }] });
  assert.equal(migrate(v1, defaults, {}), defaults);
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

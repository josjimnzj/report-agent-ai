import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TAGS, MAX_TAG_LENGTH, collectTags, normalizeTags } from '../src/shared/tags.js';

test('normalizeTags limpia espacios, quita vacías y duplicadas sin distinguir mayúsculas ni acentos', () => {
  assert.deepEqual(normalizeTags(['  Ventas ', 'ventas', 'Operación', 'operacion', '', '   ', 'Q3  2026']), ['Ventas', 'Operación', 'Q3 2026']);
});

test('normalizeTags limita cantidad y longitud', () => {
  const many = Array.from({ length: 10 }, (_, i) => `t${i}`);
  assert.equal(normalizeTags(many).length, MAX_TAGS);
  assert.equal(normalizeTags(['x'.repeat(40)])[0].length, MAX_TAG_LENGTH);
  assert.deepEqual(normalizeTags(undefined), []);
});

test('collectTags une las etiquetas de todos los chats y las ordena', () => {
  const chats = [{ tags: ['Ventas', 'Sucursales'] }, { tags: ['ventas', 'Clientes'] }, {}];
  assert.deepEqual(collectTags(chats), ['Clientes', 'Sucursales', 'Ventas']);
});

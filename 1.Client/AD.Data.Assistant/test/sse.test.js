import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser } from '../src/shared/sse.js';

test('createSseParser junta eventos partidos entre trozos e ignora keep-alive', () => {
  const p = createSseParser();
  assert.deepEqual(p.feed('event: status\ndata: {"phase":"interpret"'), []);
  assert.deepEqual(p.feed('}\n\n: keep-alive\n\nevent: text\r\ndata: {"delta":"Ho"}\r\n\r\n'), [
    { event: 'status', data: '{"phase":"interpret"}' },
    { event: 'text', data: '{"delta":"Ho"}' },
  ]);
  assert.deepEqual(p.feed('data: a\ndata: b\n\n'), [{ event: 'message', data: 'a\nb' }]);
});

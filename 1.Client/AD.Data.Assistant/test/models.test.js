import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS_RESPONSE } from '../src/mocks/models.js';
import { resolveRunSettings } from '../src/shared/models.js';

test('sin preferencias usa el modelo y el esfuerzo por defecto', () => {
  assert.deepEqual(resolveRunSettings(MODELS_RESPONSE, null, null),
    { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', effort: 'high', provider: 'anthropic' });
});

test('un modelo que ya no existe vuelve al por defecto', () => {
  assert.equal(resolveRunSettings(MODELS_RESPONSE, 'claude-viejo', 'low').model, 'claude-opus-5-5');
});

test('Haiku no admite esfuerzo', () => {
  assert.equal(resolveRunSettings(MODELS_RESPONSE, 'claude-haiku-4-5', 'max').effort, null);
});

test('Gemini rebaja xhigh/max a high y respeta los niveles que tiene', () => {
  assert.equal(resolveRunSettings(MODELS_RESPONSE, 'gemini-2.5-flash', 'max').effort, 'high');
  assert.equal(resolveRunSettings(MODELS_RESPONSE, 'gemini-2.5-flash', 'low').effort, 'low');
  assert.equal(resolveRunSettings(MODELS_RESPONSE, 'gemini-2.5-flash', null).provider, 'gemini');
});

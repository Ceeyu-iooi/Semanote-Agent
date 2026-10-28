import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createRequestId } from '../src/requestIdentity.js';

test('LAN HTTP without randomUUID still produces distinct valid v4 request identities', () => {
  const insecureContextCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const values = Array.from({ length: 50 }, () => createRequestId(insecureContextCrypto));
  assert.equal(new Set(values).size, values.length);
  for (const value of values) assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('secure contexts retain the browser native UUID implementation', () => {
  assert.equal(createRequestId({ randomUUID: () => 'native-identity' }), 'native-identity');
});

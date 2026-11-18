import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { projectRoot, rewriteMysqlOptions } from '../local-web.mjs';

test('MySQL compatibility options preserve line endings and unrelated settings', () => {
  const path = (...parts) => resolve(projectRoot, ...parts).replaceAll('\\', '/');
  const input = `[mysqld]\r\nbasedir=${path('profile','tools','mysql')}\r\ndatadir=${path('profile','runtime','mysql-data')}\r\ncollation-server=utf8mb4_0900_bin\r\nlog-error=${path('profile','runtime','mysql-error.log')}\r\nmax_connections=42\r\n`;
  const output = rewriteMysqlOptions(input, 'Z:');
  assert.match(output, /basedir=Z:\/profile\/tools\/mysql\r\n/);
  assert.match(output, /collation-server=utf8mb4_0900_bin\r\nlog-error=Z:/);
  assert.match(output, /max_connections=42\r\n/);
  assert.throws(() => rewriteMysqlOptions(input.replace(path('profile','runtime','mysql-data'), path('unrelated')), 'Z:'), /datadir/);
});

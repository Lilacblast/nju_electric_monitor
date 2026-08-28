import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, '..', 'index.html');

function loadCore() {
  assert.ok(existsSync(indexPath), 'index.html must exist');
  const html = readFileSync(indexPath, 'utf8');
  const match = html.match(/<script id="dashboard-core">([\s\S]*?)<\/script>/u);
  assert.ok(match, 'index.html must expose the marked dashboard core');

  const context = vm.createContext({
    console,
    Date,
    Intl,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
  });
  context.globalThis = context;
  vm.runInContext(match[1], context, { filename: 'dashboard-core.js' });
  assert.ok(context.NJUPowerCore, 'dashboard core must be exported');
  return context.NJUPowerCore;
}

test('parses quoted CSV cells without corrupting commas or escaped quotes', () => {
  const core = loadCore();
  const rows = core.parseCsv(
    'time,num,unit,note\r\n"2026-08-28T17:15:28.912692","99.51","度","宿舍, \"\"当前\"\""\r\n',
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].time, '2026-08-28T17:15:28.912692');
  assert.equal(rows[0].num, '99.51');
  assert.equal(rows[0].note, '宿舍, "当前"');
});

test('normalization skips invalid rows, keeps the last duplicate, and sorts ascending', () => {
  const core = loadCore();
  const csv = [
    'time,num,unit',
    '2026-08-28T18:00:00,98.2,度',
    'bad,abc,度',
    '2026-08-28T17:00:00,99.0,度',
    '2026-08-28T18:00:00,97.8,度',
  ].join('\n');

  const normalized = core.normalizeRecords(core.parseCsv(csv));

  assert.equal(normalized.skippedCount, 1);
  assert.deepEqual(
    Array.from(normalized.records, (record) => record.balance),
    [99, 97.8],
  );
  assert.ok(normalized.records[0].timeMs < normalized.records[1].timeMs);
});

test('naive ISO timestamps are interpreted as Beijing time', () => {
  const core = loadCore();
  const parsed = core.parseBeijingTime('2026-08-28T17:15:28.912692');

  assert.equal(parsed, Date.parse('2026-08-28T17:15:28.912+08:00'));
});

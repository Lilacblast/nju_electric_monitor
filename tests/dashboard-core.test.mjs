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

function makeRecords(core, pairs) {
  return core.normalizeRecords(pairs.map(([time, num]) => ({ time, num, unit: '度' }))).records;
}

test('a normal decrease becomes consumption with duration-derived average power', () => {
  const core = loadCore();
  const records = makeRecords(core, [
    ['2026-08-28T17:00:00', 50],
    ['2026-08-28T18:06:00', 49.3],
  ]);

  const [interval] = core.deriveIntervals(records);

  assert.ok(Math.abs(interval.hours - 1.1) < 1e-10);
  assert.ok(Math.abs(interval.consumption - 0.7) < 1e-10);
  assert.ok(Math.abs(interval.averagePowerKW - (0.7 / 1.1)) < 1e-10);
  assert.equal(interval.rechargeEvent, null);
});

test('an explainable increase records recharge and its simultaneous consumption', () => {
  const core = loadCore();
  const records = makeRecords(core, [
    ['2026-08-28T17:00:00', 20],
    ['2026-08-28T18:00:00', 68.7],
    ['2026-08-28T19:00:00', 61.9],
  ]);

  const [rechargeInterval] = core.deriveIntervals(records);

  assert.ok(Math.abs(rechargeInterval.consumption - 1.3) < 1e-10);
  assert.equal(rechargeInterval.rechargeEvent.estimatedRecharge, 50);
  assert.ok(Math.abs(rechargeInterval.rechargeEvent.estimatedConsumption - 1.3) < 1e-10);
  assert.equal(rechargeInterval.rechargeEvent.confidence, 'high');
});

test('the 32.4 to 61.9 example estimates a 30 kWh recharge', () => {
  const core = loadCore();
  const [interval] = core.deriveIntervals(makeRecords(core, [
    ['2026-08-28T17:00:00', 32.4],
    ['2026-08-28T18:00:00', 61.9],
  ]));

  assert.equal(interval.rechargeEvent.estimatedRecharge, 30);
  assert.ok(Math.abs(interval.consumption - 0.5) < 1e-10);
  assert.equal(interval.rechargeEvent.confidence, 'high');
});

test('an increase that implies over 5 kWh consumption is low confidence and excluded', () => {
  const core = loadCore();
  const [interval] = core.deriveIntervals(makeRecords(core, [
    ['2026-08-28T17:00:00', 10],
    ['2026-08-28T18:00:00', 33.7],
  ]));

  assert.equal(interval.rechargeEvent.estimatedRecharge, 30);
  assert.ok(Math.abs(interval.rechargeEvent.estimatedConsumption - 6.3) < 1e-10);
  assert.equal(interval.rechargeEvent.confidence, 'low');
  assert.equal(interval.consumption, null);
  assert.equal(interval.averagePowerKW, null);
});

test('statistics include recharge-hour consumption and respect Beijing windows', () => {
  const core = loadCore();
  const records = makeRecords(core, [
    ['2026-08-28T10:00:00', 50],
    ['2026-08-28T13:00:00', 47],
    ['2026-08-29T00:00:00', 45],
    ['2026-08-29T11:00:00', 43],
  ]);
  const intervals = core.deriveIntervals(records);
  const nowMs = core.parseBeijingTime('2026-08-29T12:00:00');

  const stats = core.calculateStats(records, intervals, nowMs);

  assert.equal(stats.recent.consumption, 2);
  assert.equal(stats.consumption24h, 7);
  assert.equal(stats.consumptionToday, 4);
  assert.equal(stats.prediction.totalHours, 25);
  assert.ok(Math.abs(stats.prediction.dailyAverage - 6.72) < 1e-10);
  assert.ok(Math.abs(stats.prediction.remainingDays - (43 / 6.72)) < 1e-10);
});

test('prediction remains unavailable below twelve eligible hours', () => {
  const core = loadCore();
  const records = makeRecords(core, [
    ['2026-08-29T01:00:00', 50],
    ['2026-08-29T11:00:00', 45],
  ]);
  const intervals = core.deriveIntervals(records);
  const stats = core.calculateStats(
    records,
    intervals,
    core.parseBeijingTime('2026-08-29T12:00:00'),
  );

  assert.equal(stats.prediction.totalHours, 10);
  assert.equal(stats.prediction.dailyAverage, null);
  assert.equal(stats.prediction.remainingDays, null);
});

test('freshness and balance thresholds match the dashboard rules', () => {
  const core = loadCore();
  const nowMs = core.parseBeijingTime('2026-08-29T12:00:00');

  assert.equal(core.getFreshness(nowMs - 2.5 * 3600000, nowMs), 'normal');
  assert.equal(core.getFreshness(nowMs - 2.6 * 3600000, nowMs), 'warning');
  assert.equal(core.getFreshness(nowMs - 6.1 * 3600000, nowMs), 'danger');
  assert.equal(core.getBalanceLevel(20), 'normal');
  assert.equal(core.getBalanceLevel(10), 'notice');
  assert.equal(core.getBalanceLevel(5), 'warning');
  assert.equal(core.getBalanceLevel(4.99), 'critical');
});

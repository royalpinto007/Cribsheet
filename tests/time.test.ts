import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatUtc, humaniseDuration, readEpoch, readIsoDate, relative } from '../src/time.js';

const NOW = Date.parse('2026-08-08T12:00:00Z');

test('UTC is printed without depending on the machine timezone', () => {
  assert.equal(formatUtc(Date.parse('2023-11-14T22:13:20Z')), '2023-11-14 22:13:20 UTC');
  assert.equal(formatUtc(0), '1970-01-01 00:00:00 UTC');
});

test('relative time is rounded to the unit that says something', () => {
  const hour = 3_600_000;
  assert.equal(relative(NOW, NOW), 'just now');
  assert.equal(relative(NOW - 5 * 60_000, NOW), '5 minutes ago');
  assert.equal(relative(NOW + 2 * hour, NOW), 'in 2 hours');
  assert.equal(relative(NOW - 400 * 24 * hour, NOW), '1 year ago');
  assert.equal(relative(NOW + 60 * 24 * hour, NOW), 'in 2 months');
});

test('durations stop at two units, which is where they stop being useful', () => {
  assert.equal(humaniseDuration(500), '500 ms');
  assert.equal(humaniseDuration(1000), '1s');
  assert.equal(humaniseDuration(90_000), '1m 30s');
  assert.equal(humaniseDuration(7_980_000), '2h 13m');
  assert.equal(humaniseDuration(100_000_000), '1d 3h');
});

test('a ten digit number is read as seconds, and as other things too', () => {
  const readings = readEpoch('1700000000', NOW);
  const titles = readings.map((r) => r.title);
  assert.ok(titles.includes('Unix time in seconds'));
  // The millisecond reading of this lands in 1970, outside the plausible range.
  assert.equal(titles.includes('Unix time in milliseconds'), false);
  assert.match(readings[0]!.rows[0]!.value, /2023-11-14/);
});

test('a thirteen digit number is milliseconds', () => {
  const readings = readEpoch('1700000000000', NOW);
  assert.equal(readings[0]?.title, 'Unix time in milliseconds');
});

test('a timestamp near now is offered ahead of one far away', () => {
  // The microsecond reading of a recent second-precision stamp lands decades
  // out, and offering that first would be actively misleading.
  const readings = readEpoch('1770000000', NOW);
  const sorted = [...readings].sort((a, b) => b.confidence - a.confidence);
  assert.equal(sorted[0]?.title, 'Unix time in seconds');
});

test('numbers that cannot be a plausible date are not offered as one', () => {
  // Every reading of this lands before 1990: 1973 as seconds, 1970 as
  // milliseconds, and earlier still as microseconds.
  assert.deepEqual(readEpoch('100000000', NOW), []);
  assert.deepEqual(readEpoch('123', NOW), []);
  assert.deepEqual(readEpoch('not a number', NOW), []);
});

test('a date that is old but plausible is still offered', () => {
  // 2001 is a perfectly ordinary thing to find a timestamp for.
  assert.equal(readEpoch('999999999', NOW)[0]?.title, 'Unix time in seconds');
});

test('ISO dates are unambiguous and are treated that way', () => {
  const reading = readIsoDate('2026-03-01T09:30:00Z', NOW);
  assert.ok(reading);
  assert.equal(reading.confidence, 0.95);
  assert.match(reading.rows[0]!.value, /2026-03-01 09:30:00 UTC/);
  assert.equal(reading.note, undefined);
});

test('an ISO date without a zone says which one it assumed', () => {
  const reading = readIsoDate('2026-03-01', NOW);
  assert.ok(reading);
  assert.match(reading.note ?? '', /local time/);
});

test('something merely date-shaped is not a date', () => {
  assert.equal(readIsoDate('2026-13-45', NOW), null);
  assert.equal(readIsoDate('hello', NOW), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeCron, parseField, readCron, runsOf } from '../src/cron.js';

test('the everyday expressions read as sentences', () => {
  assert.equal(describeCron('0 3 * * 1'), 'At 03:00 on Mondays.');
  assert.equal(describeCron('* * * * *'), 'Every minute every day.');
  assert.equal(describeCron('30 2 1 * *'), 'At 02:30 on the 1st of the month.');
  assert.equal(describeCron('0 0 1 1 *'), 'At 00:00 on the 1st of the month in January.');
});

test('consecutive values collapse into ranges', () => {
  // "Monday to Friday" rather than five separate weekdays, which is the whole
  // reason to translate the line at all.
  assert.match(describeCron('0 9 * * 1-5') ?? '', /Monday to Friday/);
  assert.match(describeCron('0 9 * * mon-fri') ?? '', /Monday to Friday/);
  assert.deepEqual(runsOf([1, 2, 3, 5, 8, 9]), [
    [1, 3],
    [5, 5],
    [8, 9],
  ]);
});

test('steps are described as steps', () => {
  assert.equal(describeCron('*/5 * * * *'), 'Every 5 minutes every day.');
  assert.match(describeCron('0 */6 * * *') ?? '', /every 6 hours/);
});

test('the shorthands are understood', () => {
  assert.equal(describeCron('@daily'), 'At 00:00 every day.');
  assert.equal(describeCron('@hourly'), 'At 00 past the hour every day.');
  assert.equal(describeCron('@weekly'), 'At 00:00 on Sundays.');
});

test('both 0 and 7 mean Sunday', () => {
  assert.equal(describeCron('0 0 * * 0'), describeCron('0 0 * * 7'));
});

test('six fields are read as seconds first', () => {
  const described = describeCron('30 0 3 * * 1');
  assert.match(described ?? '', /second 30/);
  assert.match(described ?? '', /Mondays/);
});

test('the day of month and day of week trap is called out', () => {
  // Standard cron runs when *either* matches, and people are caught by this
  // constantly.
  const reading = readCron('0 0 13 * 5');
  assert.ok(reading);
  assert.match(reading.note ?? '', /either matches, not both/);
  assert.match(reading.rows[0]!.value, /whichever comes round/);
});

test('nonsense fields are refused rather than guessed at', () => {
  assert.equal(describeCron('99 * * * *'), null);
  assert.equal(describeCron('0 0 * *'), null); // four fields
  assert.equal(describeCron('0 0 * * * * *'), null); // seven
  assert.equal(describeCron('a b c d e'), null);
  assert.equal(describeCron('0 0 32 * *'), null); // no 32nd
  assert.equal(describeCron('5-1 * * * *'), null); // backwards range
});

test('a bare five numbers is offered, but not confidently', () => {
  // "1 2 3 4 5" is valid cron and is almost never cron.
  const plain = readCron('1 2 3 4 5');
  const real = readCron('*/15 9-17 * * 1-5');
  assert.ok(plain && real);
  assert.ok(plain.confidence < real.confidence);
});

test('fields parse into the values they mean', () => {
  assert.deepEqual(parseField('1-3', 0, 59)?.values, [1, 2, 3]);
  assert.deepEqual(parseField('1,5,9', 0, 59)?.values, [1, 5, 9]);
  assert.deepEqual(parseField('*/20', 0, 59)?.values, [0, 20, 40]);
  assert.equal(parseField('*', 0, 59)?.every, true);
  assert.equal(parseField('60', 0, 59), null);
  assert.equal(parseField('', 0, 59), null);
  assert.equal(parseField('*/0', 0, 59), null);
});

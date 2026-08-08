import type { Reading } from './types.js';

/**
 * Dates and durations.
 *
 * The awkward part is not formatting, it is deciding whether a number is a
 * time at all. Ten digits is a Unix timestamp or it is a large number, and the
 * only honest way to tell is whether the resulting date is one a person would
 * plausibly be looking at.
 */

/** Timestamps outside this range are almost certainly not timestamps. */
const EARLIEST = Date.UTC(1990, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

/**
 * How long ago, or how far ahead.
 *
 * Rounded to the largest unit that still says something. "in 3 months" is more
 * use than "in 7,776,000 seconds", which is the form every online converter
 * gives you.
 */
export function relative(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const ahead = diff > 0;

  const units: [number, string][] = [
    [1000, 'second'],
    [60_000, 'minute'],
    [3_600_000, 'hour'],
    [86_400_000, 'day'],
    [2_629_800_000, 'month'],
    [31_557_600_000, 'year'],
  ];

  if (abs < 45_000) return ahead ? 'in a moment' : 'just now';

  let chosen = units[0]!;
  for (const unit of units) if (abs >= unit[0]) chosen = unit;

  const n = Math.round(abs / chosen[0]);
  const word = `${n} ${chosen[1]}${n === 1 ? '' : 's'}`;
  return ahead ? `in ${word}` : `${word} ago`;
}

/** A count of milliseconds as a person would say it: 2h 13m, not 7,980,000. */
export function humaniseDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;

  const parts: string[] = [];
  let left = Math.floor(ms / 1000);
  const units: [number, string][] = [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
    [1, 's'],
  ];

  for (const [size, suffix] of units) {
    const n = Math.floor(left / size);
    if (n > 0) parts.push(`${n}${suffix}`);
    left -= n * size;
    // Two units is enough to be useful and short. "1d 4h" beats "1d 4h 9m 3s".
    if (parts.length === 2) break;
  }
  return parts.join(' ');
}

/**
 * A number read as a Unix timestamp, in whichever precision fits.
 *
 * Seconds, milliseconds and microseconds are all in common use and are told
 * apart only by magnitude, so each is tried and the ones landing in a
 * believable range are offered. More than one can fit, and when they do, both
 * are shown rather than one being picked.
 */
export function readEpoch(text: string, now: number): Reading[] {
  if (!/^-?\d{9,19}$/.test(text)) return [];
  const value = Number(text);
  if (!Number.isFinite(value)) return [];

  const scales: [number, string, number][] = [
    [1000, 'seconds', 0.75],
    [1, 'milliseconds', 0.7],
    [1 / 1000, 'microseconds', 0.55],
  ];

  const readings: Reading[] = [];
  for (const [multiplier, unit, base] of scales) {
    const ms = value * multiplier;
    if (ms < EARLIEST || ms > LATEST) continue;

    // A timestamp near now is far more likely to be the one meant than one in
    // 2091, which is what the microsecond reading of a recent second-precision
    // stamp usually looks like.
    const nearness = Math.abs(ms - now) < 5 * 31_557_600_000 ? 0.15 : 0;

    readings.push({
      kind: 'epoch',
      title: `Unix time in ${unit}`,
      confidence: base + nearness,
      rows: [
        { label: 'UTC', value: formatUtc(ms) },
        { label: 'Local', value: new Date(ms).toString() },
        { label: 'Relative', value: relative(ms, now) },
      ],
    });
  }
  return readings;
}

/** An ISO 8601 date, which is unambiguous and so needs no hedging. */
export function readIsoDate(text: string, now: number): Reading | null {
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return null;
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;

  const zoned = /Z|[+-]\d{2}:?\d{2}$/.test(text);
  return {
    kind: 'iso-date',
    title: 'ISO 8601 date',
    confidence: 0.95,
    rows: [
      { label: 'UTC', value: formatUtc(ms) },
      { label: 'Local', value: new Date(ms).toString() },
      { label: 'Relative', value: relative(ms, now) },
      { label: 'Unix seconds', value: String(Math.floor(ms / 1000)) },
    ],
    note: zoned ? undefined : 'No timezone given, so this was read as local time.',
  };
}

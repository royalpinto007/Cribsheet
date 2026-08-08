import type { Reading } from './types.js';

/**
 * Cron expressions, in English.
 *
 * This is the one people most often paste into a website, because the syntax
 * is genuinely unreadable and the cost of getting it wrong is a job that runs
 * at four in the morning every day instead of once a month.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const NAMED_MONTHS: Record<string, number> = Object.fromEntries(
  MONTHS.map((m, i) => [m.slice(0, 3).toLowerCase(), i + 1])
);
const NAMED_DAYS: Record<string, number> = Object.fromEntries(
  DAYS.map((d, i) => [d.slice(0, 3).toLowerCase(), i])
);

/** The shorthands, which are common enough to be worth understanding. */
const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export interface CronField {
  /** Every value in range. */
  every: boolean;
  /** The specific values meant, sorted, when it is not every value. */
  values: number[];
  /** The step, when the field used one. */
  step: number | null;
}

/**
 * One field of a cron line.
 *
 * Returns null rather than throwing on anything it does not understand, so a
 * line that merely looks like cron does not produce a confident wrong answer.
 */
export function parseField(
  field: string,
  min: number,
  max: number,
  names: Record<string, number> = {}
): CronField | null {
  const values = new Set<number>();
  let step: number | null = null;
  let every = false;

  for (const part of field.split(',')) {
    if (!part) return null;

    const [rangePart, stepPart] = part.split('/');
    if (stepPart !== undefined) {
      const n = Number(stepPart);
      if (!Number.isInteger(n) || n < 1) return null;
      step = n;
    }
    if (rangePart === undefined) return null;

    let from: number;
    let to: number;

    if (rangePart === '*' || rangePart === '?') {
      from = min;
      to = max;
      if (stepPart === undefined) every = true;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      const start = named(a, names);
      const end = named(b, names);
      if (start === null || end === null) return null;
      from = start;
      to = end;
    } else {
      const only = named(rangePart, names);
      if (only === null) return null;
      from = only;
      to = only;
    }

    if (from < min || to > max || from > to) return null;
    for (let v = from; v <= to; v += step ?? 1) values.add(v);
  }

  if (!values.size) return null;
  return { every, values: [...values].sort((a, b) => a - b), step };
}

function named(part: string | undefined, names: Record<string, number>): number | null {
  if (part === undefined || part === '') return null;
  const byName = names[part.toLowerCase()];
  if (byName !== undefined) return byName;
  const n = Number(part);
  return Number.isInteger(n) ? n : null;
}

/**
 * A cron line as a sentence.
 *
 * Built time-first, then day, then month, because that is the order the
 * question is usually asked in: when in the day, then which days.
 */
export function describeCron(expression: string): string | null {
  const line = ALIASES[expression.trim().toLowerCase()] ?? expression.trim();
  const parts = line.split(/\s+/);
  // Five fields is standard cron; six with leading seconds is the Quartz and
  // systemd style, and is common enough that refusing it would be unhelpful.
  if (parts.length !== 5 && parts.length !== 6) return null;

  const withSeconds = parts.length === 6;
  const [secondsRaw, minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = withSeconds
    ? parts
    : [undefined, ...parts];

  const seconds = withSeconds ? parseField(secondsRaw!, 0, 59) : null;
  const minute = parseField(minuteRaw!, 0, 59);
  const hour = parseField(hourRaw!, 0, 23);
  const dom = parseField(domRaw!, 1, 31);
  const month = parseField(monthRaw!, 1, 12, NAMED_MONTHS);
  // Both 0 and 7 mean Sunday in every implementation that matters.
  const dow = parseField((dowRaw ?? '*').replace(/\b7\b/g, '0'), 0, 6, NAMED_DAYS);

  if (!minute || !hour || !dom || !month || !dow) return null;
  if (withSeconds && !seconds) return null;

  const time = describeTime(minute, hour, seconds);
  const days = describeDays(dom, dow);
  const months = month.every ? '' : ` in ${spans(month.values, (m) => MONTHS[m - 1]!)}`;

  return capitalise(`${time}${days}${months}.`);
}

function describeTime(minute: CronField, hour: CronField, seconds: CronField | null): string {
  const secondsNote =
    seconds && !seconds.every ? `at second ${list(seconds.values.map(String))}, ` : '';

  if (minute.every && hour.every) return `${secondsNote}every minute`;
  if (minute.step && hour.every) return `${secondsNote}every ${minute.step} minutes`;
  if (minute.every) return `${secondsNote}every minute of ${hourList(hour)}`;

  if (hour.step) {
    return `${secondsNote}at ${pad(minute.values[0]!)} past the hour, every ${hour.step} hours`;
  }
  if (hour.every) {
    return `${secondsNote}at ${list(minute.values.map((m) => `${pad(m)} past the hour`))}`;
  }

  // The common case: a handful of exact times.
  const times: string[] = [];
  for (const h of hour.values) for (const m of minute.values) times.push(`${pad(h)}:${pad(m)}`);
  // Beyond a few, listing every combination is worse than describing it.
  if (times.length > 6) {
    return `${secondsNote}at ${list(minute.values.map(pad))} past ${hourList(hour)}`;
  }
  return `${secondsNote}at ${list(times)}`;
}

function describeDays(dom: CronField, dow: CronField): string {
  const everyDom = dom.every;
  const everyDow = dow.every;

  if (everyDom && everyDow) return ' every day';
  if (everyDow) {
    if (dom.step) return ` every ${dom.step} days`;
    return ` on the ${list(dom.values.map(ordinal))} of the month`;
  }
  if (everyDom) return ` on ${dayList(dow)}`;

  // Both set is a genuine trap: standard cron runs on either, not both, and
  // people are caught by it constantly.
  return ` on the ${list(dom.values.map(ordinal))} of the month, or on ${dayList(
    dow
  )}, whichever comes round`;
}

function hourList(hour: CronField): string {
  if (hour.every) return 'every hour';
  return spans(hour.values, (h) => `${pad(h)}:00`);
}

/**
 * Consecutive values as ranges.
 *
 * "Monday to Friday" rather than "Mondays, Tuesdays, Wednesdays, Thursdays and
 * Fridays". The whole reason to translate a cron line is that the result is
 * easier to read than the original, and a nine item list is not.
 */
export function runsOf(values: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const value of values) {
    const last = runs[runs.length - 1];
    if (last && value === last[1] + 1) last[1] = value;
    else runs.push([value, value]);
  }
  return runs;
}

function spans(values: readonly number[], show: (n: number) => string): string {
  return list(
    runsOf(values).map(([from, to]) =>
      // Two in a row reads better as two items than as a range.
      to - from >= 2 ? `${show(from)} to ${show(to)}` : range(from, to, show)
    )
  ).replace(/, ([^,]*) to /, ', $1 to ');
}

function range(from: number, to: number, show: (n: number) => string): string {
  return from === to ? show(from) : `${show(from)} and ${show(to)}`;
}

/** Weekdays, as a range where they are consecutive. */
function dayList(dow: CronField): string {
  const runs = runsOf(dow.values);
  return list(
    runs.map(([from, to]) =>
      to - from >= 2 ? `${DAYS[from]!} to ${DAYS[to]!}` : range(from, to, (d) => `${DAYS[d]!}s`)
    )
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

function list(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function readCron(text: string): Reading | null {
  const description = describeCron(text);
  if (!description) return null;

  const fields = text.trim().split(/\s+/).length;
  const bothDayFields =
    fields >= 5 &&
    !/^[*?]$/.test(text.trim().split(/\s+/).slice(-3)[0] ?? '*') &&
    !/^[*?]$/.test(text.trim().split(/\s+/).slice(-1)[0] ?? '*');

  return {
    kind: 'cron',
    title: text.trim().startsWith('@') ? 'Cron shorthand' : `Cron expression, ${fields} fields`,
    // Short numeric lines like "1 2 3 4 5" parse as valid cron and are usually
    // not cron, so a bare five numbers is offered with less certainty.
    confidence: /[*/,@-]/.test(text) ? 0.9 : 0.45,
    rows: [{ label: 'Runs', value: description }],
    note: bothDayFields
      ? 'Day of month and day of week are both set. Standard cron runs when either matches, not both.'
      : undefined,
  };
}

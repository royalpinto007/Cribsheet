import { readCron } from './cron.js';
import { readEpoch, readIsoDate } from './time.js';
import { readHash, readJwt, readUuid } from './tokens.js';
import {
  readBase64,
  readBytes,
  readColour,
  readDuration,
  readFileMode,
  readHttpStatus,
  readIp,
  readUnicodeEscape,
  readUrlEncoded,
} from './values.js';
import type { Reading } from './types.js';

/**
 * Everything a selection might be, best guess first.
 *
 * Deliberately not a classifier. A classifier picks one answer, and the whole
 * difficulty here is that the same characters are honestly several things at
 * once. `1700000000` really is a timestamp, a byte count and a number, and the
 * user is the only one who knows which. So all of them are offered, ordered by
 * how much the shape of the text supports each.
 */
const DETECTORS = [
  readJwt,
  (text: string, now: number) => readUuid(text, now),
  (text: string) => readCron(text),
  (text: string, now: number) => readIsoDate(text, now),
  readEpoch,
  (text: string) => readColour(text),
  (text: string) => readIp(text),
  (text: string) => readUnicodeEscape(text),
  (text: string) => readUrlEncoded(text),
  (text: string) => readBase64(text),
  (text: string) => readHash(text),
  (text: string) => readHttpStatus(text),
  (text: string) => readFileMode(text),
  (text: string) => readBytes(text),
  (text: string) => readDuration(text),
] as const;

/** The most text worth looking at. Beyond this it is prose, not a value. */
export const MAX_LENGTH = 8000;

export interface Decoded {
  /** The text as it was read, trimmed. */
  text: string;
  readings: Reading[];
}

export function decode(input: string, now: number = Date.now()): Decoded {
  const text = input.trim();
  if (!text || text.length > MAX_LENGTH) return { text, readings: [] };

  const readings: Reading[] = [];
  for (const detect of DETECTORS) {
    const found = detect(text, now);
    if (!found) continue;
    if (Array.isArray(found)) readings.push(...found);
    else readings.push(found);
  }

  readings.sort((a, b) => b.confidence - a.confidence || a.kind.localeCompare(b.kind));
  return { text, readings };
}

/**
 * What to say when nothing matched.
 *
 * A tool that shrugs is worse than one that says plainly that it does not
 * recognise this, because the user is left wondering whether they used it
 * wrongly.
 */
export function nothingFound(text: string): string {
  if (!text) return 'Select some text first.';
  if (text.length > MAX_LENGTH) return 'That is too much text to be a single value.';
  return 'Nothing recognisable here. Cribsheet reads values, not prose.';
}

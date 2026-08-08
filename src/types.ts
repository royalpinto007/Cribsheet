/**
 * One way of reading a piece of text.
 *
 * A reading is never the answer, it is *an* answer. `1700000000` is a
 * plausible Unix timestamp, a plausible byte count and an entirely ordinary
 * number, and a tool that silently picks one has guessed on the user's behalf
 * about something they cannot check without the tool they are already using.
 */
export interface Reading {
  /** Stable identifier, used for tests and ordering. */
  kind: Kind;
  /** What this reading claims the text is. */
  title: string;
  /**
   * How sure the detector is, 0 to 1.
   *
   * Not a probability, just an ordering. A JWT is unmistakable; a ten digit
   * number being a timestamp is a reasonable guess and is scored like one.
   */
  confidence: number;
  /** The decoded detail, in display order. */
  rows: Row[];
  /** A caveat that belongs with this reading rather than with the text. */
  note?: string;
}

export interface Row {
  label: string;
  value: string;
  /** A colour to show as a swatch beside the value, if one applies. */
  swatch?: string;
  /** Text worth warning about rather than merely showing. */
  warn?: boolean;
}

export type Kind =
  | 'epoch'
  | 'iso-date'
  | 'duration'
  | 'cron'
  | 'jwt'
  | 'base64'
  | 'url-encoded'
  | 'uuid'
  | 'hash'
  | 'colour'
  | 'bytes'
  | 'http-status'
  | 'ip'
  | 'file-mode'
  | 'unicode-escape'
  | 'number';

/** A detector: given trimmed text, say nothing or say what it might be. */
export type Detector = (text: string, now: number) => Reading[] | Reading | null;

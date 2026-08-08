import { humaniseDuration } from './time.js';
import type { Reading, Row } from './types.js';

/** Encodings, colours, sizes, statuses and addresses. */

/**
 * Base64, decoded only when the result is actually text.
 *
 * Almost any long alphanumeric string is valid base64 by accident, and
 * decoding one produces a line of control characters that looks like a bug.
 * The check is whether the output is something a person could read.
 */
export function readBase64(text: string): Reading | null {
  const value = text.trim();
  if (value.length < 8 || value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  let decoded: string;
  try {
    const binary = atob(value);
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    );
  } catch {
    return null;
  }

  if (!isReadable(decoded)) return null;

  return {
    kind: 'base64',
    title: 'Base64',
    // Higher when the padding is explicit, since that is a real signal rather
    // than a coincidence of length.
    confidence: value.endsWith('=') ? 0.85 : 0.65,
    rows: [{ label: 'Decodes to', value: decoded }],
  };
}

/**
 * Whether decoded bytes are text rather than a binary blob.
 *
 * Written as escapes rather than literal control characters, which are
 * invisible in an editor and get mangled by anything that touches the file.
 * Tab, newline and carriage return are deliberately excluded from the range:
 * they are ordinary parts of text.
 */
export function isReadable(text: string): boolean {
  if (!text) return false;
  const control = text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)?.length ?? 0;
  return control / text.length < 0.05;
}

export function readUrlEncoded(text: string): Reading | null {
  const value = text.trim();
  if (!/%[0-9a-fA-F]{2}/.test(value) && !value.includes('+')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
  if (decoded === value) return null;

  return {
    kind: 'url-encoded',
    title: 'Percent encoded text',
    confidence: /%[0-9a-fA-F]{2}/.test(value) ? 0.9 : 0.4,
    rows: [{ label: 'Decodes to', value: decoded }],
  };
}

/** é and \xe9 escapes, which turn up in logs and error messages. */
export function readUnicodeEscape(text: string): Reading | null {
  const value = text.trim();
  if (!/\\u\{?[0-9a-fA-F]{2,6}\}?|\\x[0-9a-fA-F]{2}/.test(value)) return null;

  const decoded = value
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

  if (decoded === value) return null;
  return {
    kind: 'unicode-escape',
    title: 'Escaped characters',
    confidence: 0.85,
    rows: [{ label: 'Reads as', value: decoded }],
  };
}

/** Colours, in the notations that turn up in a stylesheet. */
export function readColour(text: string): Reading | null {
  const value = text.trim().toLowerCase();

  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  const hex = value.match(/^#?([0-9a-f]{3,8})$/);
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);

  if (hex?.[1] && [3, 4, 6, 8].includes(hex[1].length)) {
    const h = hex[1];
    const wide = h.length >= 6;
    const at = (i: number) => (wide ? h.slice(i * 2, i * 2 + 2) : h[i]!.repeat(2));
    r = parseInt(at(0), 16);
    g = parseInt(at(1), 16);
    b = parseInt(at(2), 16);
    if (h.length === 4 || h.length === 8) a = parseInt(at(3), 16) / 255;
    // A bare six digit hex string is far more often an id than a colour, so
    // only an explicit # is treated as a confident colour.
    if (!value.startsWith('#')) return null;
  } else if (rgb?.[1]) {
    const parts = rgb[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
    [r, g, b] = parts as [number, number, number];
    a = parts[3] ?? 1;
  } else {
    return null;
  }

  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const swatch = `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

  const rows: Row[] = [
    { label: 'Hex', value: `#${toHex(r)}${toHex(g)}${toHex(b)}`, swatch },
    { label: 'RGB', value: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})` },
    { label: 'HSL', value: toHsl(r, g, b) },
  ];
  if (a < 1) rows.push({ label: 'Alpha', value: `${Math.round(a * 100)}%` });

  return { kind: 'colour', title: 'Colour', confidence: 0.9, rows };
}

function toHsl(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/**
 * A plain number read as a byte count.
 *
 * Both conventions, because the difference between them is exactly the
 * confusion this is here to settle: a "1 GB" file is 1000000000 bytes to a
 * disk manufacturer and 1073741824 to an operating system.
 */
export function readBytes(text: string): Reading | null {
  if (!/^\d{4,}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  if (!Number.isFinite(n) || n < 1024) return null;

  return {
    kind: 'bytes',
    title: 'Read as a byte count',
    confidence: 0.3,
    rows: [
      { label: 'Binary', value: scale(n, 1024, ['bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']) },
      { label: 'Decimal', value: scale(n, 1000, ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB']) },
    ],
  };
}

function scale(n: number, base: number, units: string[]): string {
  let value = n;
  let unit = 0;
  while (value >= base && unit < units.length - 1) {
    value /= base;
    unit++;
  }
  const rounded = unit === 0 ? value : Math.round(value * 100) / 100;
  return `${rounded} ${units[unit]}`;
}

/** A number read as a length of time, which is what most four digit ms are. */
export function readDuration(text: string): Reading | null {
  if (!/^\d{3,12}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  if (n < 1000) return null;

  return {
    kind: 'duration',
    title: 'Read as a duration',
    confidence: 0.25,
    rows: [
      { label: 'As milliseconds', value: humaniseDuration(n) },
      // Past about a decade the reading is not wrong, it is just useless, and
      // printing it makes the useful line above harder to find. A ten digit
      // number read as seconds is fifty years, which nobody means.
      ...(n * 1000 < 315_576_000_000
        ? [{ label: 'As seconds', value: humaniseDuration(n * 1000) }]
        : []),
    ],
  };
}

const STATUSES: Record<number, [string, string]> = {
  200: ['OK', 'It worked.'],
  201: ['Created', 'It worked and made something new.'],
  204: ['No Content', 'It worked and there is deliberately nothing to return.'],
  301: ['Moved Permanently', 'Update your link. Caches and search engines will remember this.'],
  302: ['Found', 'A temporary redirect. The original address is still the right one.'],
  304: ['Not Modified', 'Your cached copy is still current.'],
  307: ['Temporary Redirect', 'Like 302, but the method must not change.'],
  308: ['Permanent Redirect', 'Like 301, but the method must not change.'],
  400: ['Bad Request', 'The request itself was malformed. Nothing to retry until it changes.'],
  401: ['Unauthorized', 'Actually means unauthenticated. You have not proved who you are.'],
  403: ['Forbidden', 'You are authenticated and still not allowed. Retrying will not help.'],
  404: ['Not Found', 'Nothing at this address. Often also used to hide a 403.'],
  405: ['Method Not Allowed', 'The address exists but not for this verb.'],
  409: ['Conflict', 'It clashes with the current state, often a duplicate or a stale write.'],
  410: ['Gone', 'It existed and was deliberately removed. Unlike 404, this is permanent.'],
  418: ["I'm a Teapot", 'A joke from 1998 that several servers implement anyway.'],
  422: [
    'Unprocessable Content',
    'Well formed but semantically wrong. Common in APIs for validation errors.',
  ],
  429: ['Too Many Requests', 'You are being rate limited. Look for a Retry-After header.'],
  451: ['Unavailable For Legal Reasons', 'Blocked by a legal demand rather than a technical one.'],
  500: ['Internal Server Error', 'Their fault. Nothing you send will fix it.'],
  502: ['Bad Gateway', 'A proxy could not get a valid answer from the thing behind it.'],
  503: [
    'Service Unavailable',
    'Temporarily down or overloaded. Usually worth retrying with backoff.',
  ],
  504: ['Gateway Timeout', 'A proxy waited for the thing behind it and gave up.'],
};

export function readHttpStatus(text: string): Reading | null {
  if (!/^[1-5]\d{2}$/.test(text.trim())) return null;
  const code = Number(text.trim());
  const known = STATUSES[code];

  const classes: Record<number, string> = {
    1: 'Informational',
    2: 'Success',
    3: 'Redirection',
    4: 'Client error, the request was wrong',
    5: 'Server error, the request was fine',
  };

  return {
    kind: 'http-status',
    title: known ? `HTTP ${code} ${known[0]}` : `HTTP ${code}`,
    // A bare three digit number is very often not a status code.
    confidence: known ? 0.5 : 0.2,
    rows: [
      { label: 'Class', value: classes[Math.floor(code / 100)] ?? 'Unknown' },
      ...(known ? [{ label: 'Means', value: known[1] }] : []),
    ],
  };
}

export function readIp(text: string): Reading | null {
  const value = text.trim();
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  if (parts.some((p) => p === '' || (p.length > 1 && p.startsWith('0')))) return null;

  const [a, b] = octets as [number, number, number, number];
  let scope = 'Public address';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    scope = 'Private network, not reachable from the internet';
  } else if (a === 127) scope = 'Loopback, this machine';
  else if (a === 169 && b === 254) scope = 'Link local, usually means DHCP failed';
  else if (a >= 224 && a <= 239) scope = 'Multicast';
  else if (a === 100 && b >= 64 && b <= 127) scope = 'Carrier grade NAT';
  else if (a === 0) scope = 'Unspecified';

  return {
    kind: 'ip',
    title: 'IPv4 address',
    confidence: 0.9,
    rows: [
      { label: 'Scope', value: scope },
      {
        label: 'As a number',
        value: String(((a << 24) >>> 0) + (b << 16) + (octets[2]! << 8) + octets[3]!),
      },
    ],
  };
}

/** Unix file modes, which nobody reads correctly at a glance. */
export function readFileMode(text: string): Reading | null {
  const value = text.trim();
  if (!/^0?[0-7]{3,4}$/.test(value)) return null;

  const digits = value.length === 4 && value.startsWith('0') ? value.slice(1) : value;
  if (digits.length !== 3 && digits.length !== 4) return null;

  const perms = digits.slice(-3);
  const special = digits.length === 4 ? Number(digits[0]) : 0;
  const bits = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const symbolic = [...perms].map((d) => bits[Number(d)]!).join('');

  const who = ['Owner', 'Group', 'Everyone'];
  const rows: Row[] = [
    { label: 'Symbolic', value: symbolic },
    ...[...perms].map((d, i) => ({ label: who[i]!, value: describeBits(Number(d)) })),
  ];

  if (special) {
    const names: string[] = [];
    if (special & 4) names.push('setuid');
    if (special & 2) names.push('setgid');
    if (special & 1) names.push('sticky bit');
    rows.push({ label: 'Special', value: names.join(', '), warn: (special & 6) !== 0 });
  }
  if (perms === '777') {
    rows.push({ label: 'Careful', value: 'Anyone on the machine can change this.', warn: true });
  }

  return {
    kind: 'file-mode',
    title: 'Unix file permissions',
    confidence:
      value.startsWith('0') || perms === '755' || perms === '644' || perms === '777' ? 0.65 : 0.35,
    rows,
  };
}

function describeBits(digit: number): string {
  const parts: string[] = [];
  if (digit & 4) parts.push('read');
  if (digit & 2) parts.push('write');
  if (digit & 1) parts.push('execute');
  return parts.length ? parts.join(', ') : 'nothing';
}

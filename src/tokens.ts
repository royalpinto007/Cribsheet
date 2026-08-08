import { formatUtc, relative } from './time.js';
import type { Reading, Row } from './types.js';

/**
 * Tokens and identifiers.
 *
 * This is the part of the product that justifies its existence. A JWT pasted
 * into an online decoder has been handed to whoever runs that site, and for a
 * live token that is the whole account. Doing it locally is not a convenience,
 * it is the point.
 */

/** Base64url, tolerant of missing padding, which real tokens always are. */
export function decodeBase64Url(part: string): string | null {
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    // Bytes to text, so anything non-ASCII survives.
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Claim names that are defined by the spec and mean something specific. */
const CLAIMS: Record<string, string> = {
  iss: 'Issued by',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires',
  nbf: 'Not before',
  iat: 'Issued at',
  jti: 'Token id',
  scope: 'Scope',
  scp: 'Scope',
  azp: 'Authorised party',
  email: 'Email',
  name: 'Name',
};

const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time', 'updated_at']);

export function readJwt(text: string, now: number): Reading | null {
  const parts = text.trim().split('.');
  if (parts.length !== 3) return null;
  if (!parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;

  const header = parse(decodeBase64Url(parts[0]!));
  const payload = parse(decodeBase64Url(parts[1]!));
  if (!header || !payload) return null;
  if (typeof header.alg !== 'string') return null;

  const rows: Row[] = [
    { label: 'Algorithm', value: String(header.alg), warn: header.alg === 'none' },
  ];
  if (header.kid) rows.push({ label: 'Key id', value: String(header.kid) });

  // The spec claims first, in a sensible order, then whatever else is in there.
  const ordered = [
    ...Object.keys(CLAIMS).filter((k) => k in payload),
    ...Object.keys(payload).filter((k) => !(k in CLAIMS)),
  ];

  for (const key of ordered) {
    const value = payload[key];
    if (TIME_CLAIMS.has(key) && typeof value === 'number') {
      const ms = value * 1000;
      rows.push({
        label: CLAIMS[key] ?? key,
        value: `${formatUtc(ms)} (${relative(ms, now)})`,
        warn: key === 'exp' && ms < now,
      });
    } else {
      rows.push({ label: CLAIMS[key] ?? key, value: show(value) });
    }
  }

  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  const expired = exp !== null && exp < now;

  return {
    kind: 'jwt',
    title: expired ? 'JSON Web Token, expired' : 'JSON Web Token',
    confidence: 0.99,
    rows,
    // Said every time, because the failure it prevents is someone treating a
    // readable token as a verified one.
    note: 'The signature is not checked. Anyone can read a JWT, including whoever you paste it into, so treat one you did not issue as a claim rather than a fact.',
  };
}

function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function show(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

/**
 * UUIDs, including what version tells you about them.
 *
 * Version 1 and version 7 carry a timestamp, which is worth surfacing: it is
 * both useful and, occasionally, a leak nobody meant to ship.
 */
export function readUuid(text: string, now: number): Reading | null {
  const uuid = text.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) return null;

  const hex = uuid.replace(/-/g, '');
  const version = parseInt(hex[12]!, 16);
  const variantNibble = parseInt(hex[16]!, 16);
  const variant = variantNibble >= 8 && variantNibble <= 11 ? 'RFC 4122' : 'other';

  const descriptions: Record<number, string> = {
    1: 'time and MAC address based',
    3: 'MD5 name based',
    4: 'random',
    5: 'SHA-1 name based',
    6: 'reordered time based',
    7: 'Unix time based, sortable',
    8: 'custom',
  };

  const rows: Row[] = [
    {
      label: 'Version',
      value: `${version}${descriptions[version] ? `, ${descriptions[version]}` : ''}`,
    },
    { label: 'Variant', value: variant },
  ];

  if (version === 7) {
    const ms = parseInt(hex.slice(0, 12), 16);
    rows.push({ label: 'Created', value: `${formatUtc(ms)} (${relative(ms, now)})` });
  }
  if (version === 1) {
    // Version 1 counts 100 nanosecond intervals from 1582, for reasons.
    const time = BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`);
    const ms = Number(time / 10000n) - 12_219_292_800_000;
    if (ms > 0) rows.push({ label: 'Created', value: `${formatUtc(ms)} (${relative(ms, now)})` });
    rows.push({
      label: 'Note',
      value: 'Version 1 embeds the generating machine address and the time it was made.',
      warn: true,
    });
  }

  return { kind: 'uuid', title: 'UUID', confidence: 0.97, rows };
}

/** What a bare hex string of a well known length probably is. */
const HASH_LENGTHS: Record<number, string> = {
  32: 'MD5',
  40: 'SHA-1',
  56: 'SHA-224',
  64: 'SHA-256',
  96: 'SHA-384',
  128: 'SHA-512',
};

export function readHash(text: string): Reading | null {
  const hex = text.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) return null;

  const name = HASH_LENGTHS[hex.length];
  if (!name) return null;

  const rows: Row[] = [
    { label: 'Length', value: `${hex.length} hex characters, ${(hex.length * 4).toString()} bits` },
  ];
  if (name === 'MD5' || name === 'SHA-1') {
    rows.push({
      label: 'Strength',
      value: `${name} is broken for anything security related. Fine as a checksum, not as a signature.`,
      warn: true,
    });
  }
  if (hex.length === 40) {
    rows.push({ label: 'Also', value: 'A 40 character hex string is very often a Git commit.' });
  }

  return {
    kind: 'hash',
    title: `${name} digest, by length`,
    // Length is suggestive, never proof: a 64 character hex string is equally
    // a SHA-256, a random key or an ethereum private key.
    confidence: 0.6,
    rows,
    note: 'Identified only by length. Nothing here proves what produced it.',
  };
}

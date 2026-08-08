import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeBase64Url, readHash, readJwt, readUuid } from '../src/tokens.js';

const NOW = Date.parse('2026-08-08T12:00:00Z');

/** Build a JWT with the given payload. No signing: none of this verifies one. */
function jwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }
) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64(header)}.${b64(payload)}.c2lnbmF0dXJl`;
}

test('base64url survives missing padding, which real tokens always have', () => {
  assert.equal(decodeBase64Url('eyJhIjoxfQ'), '{"a":1}');
  assert.equal(decodeBase64Url('!!!'), null);
});

test('a JWT is decoded into named claims', () => {
  const reading = readJwt(jwt({ sub: 'user-42', iss: 'https://auth.example.com' }), NOW);
  assert.ok(reading);
  const labels = reading.rows.map((r) => r.label);
  assert.deepEqual(labels.slice(0, 3), ['Algorithm', 'Issued by', 'Subject']);
});

test('time claims are shown as dates, not as numbers', () => {
  // The number is exactly what a person cannot read, which is why they were
  // about to paste it into a website.
  const reading = readJwt(jwt({ exp: 1_800_000_000, iat: 1_700_000_000 }), NOW);
  const exp = reading?.rows.find((r) => r.label === 'Expires');
  assert.match(exp?.value ?? '', /2027-01-15 08:00:00 UTC \(in \d+ months?\)/);
});

test('an expired token says so in the title and flags the row', () => {
  const reading = readJwt(jwt({ exp: 1_700_000_000 }), NOW);
  assert.equal(reading?.title, 'JSON Web Token, expired');
  assert.equal(reading?.rows.find((r) => r.label === 'Expires')?.warn, true);
});

test('alg none is flagged, because it is almost always an attack', () => {
  const reading = readJwt(jwt({ sub: 'x' }, { alg: 'none' }), NOW);
  assert.equal(reading?.rows[0]?.warn, true);
});

test('every JWT carries the warning that nothing was verified', () => {
  const reading = readJwt(jwt({ sub: 'x' }), NOW);
  assert.match(reading?.note ?? '', /signature is not checked/);
});

test('things that merely have two dots are not JWTs', () => {
  assert.equal(readJwt('a.b.c', NOW), null);
  assert.equal(readJwt('one.two', NOW), null);
  assert.equal(readJwt('www.example.com', NOW), null);
  // Valid base64url, but the payload is not an object.
  assert.equal(readJwt('eyJhbGciOiJIUzI1NiJ9.WyJhIl0.sig', NOW), null);
});

test('a UUID reports its version and what that means', () => {
  const reading = readUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479', NOW);
  assert.ok(reading);
  assert.match(reading.rows[0]!.value, /^4, random/);
  assert.equal(reading.rows[1]?.value, 'RFC 4122');
});

test('a version 7 UUID gives up the time it was made', () => {
  const reading = readUuid('01890a5d-ac96-774b-bcce-b302099a8057', NOW);
  const created = reading?.rows.find((r) => r.label === 'Created');
  assert.match(created?.value ?? '', /2023-06-30/);
});

test('a version 1 UUID is flagged for what it leaks', () => {
  const reading = readUuid('c232ab00-9414-11ec-b3c8-9f6bdeced846', NOW);
  const note = reading?.rows.find((r) => r.label === 'Note');
  assert.equal(note?.warn, true);
  assert.match(note?.value ?? '', /machine address/);
});

test('not every hyphenated hex string is a UUID', () => {
  assert.equal(readUuid('f47ac10b-58cc-4372-a567-0e02b2c3d47', NOW), null);
  assert.equal(readUuid('hello-world', NOW), null);
});

test('hashes are named by length, and said to be named by length', () => {
  assert.equal(readHash('d41d8cd98f00b204e9800998ecf8427e')?.title, 'MD5 digest, by length');
  assert.equal(readHash('a'.repeat(64))?.title, 'SHA-256 digest, by length');
  assert.match(readHash('a'.repeat(64))?.note ?? '', /Identified only by length/);
});

test('the broken ones say they are broken', () => {
  const md5 = readHash('d41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5?.rows.find((r) => r.label === 'Strength')?.warn, true);
});

test('a 40 character hex string mentions git, because it usually is', () => {
  assert.match(
    readHash('a94a8fe5ccb19ba61c4c0873d391e987982fbbd3')
      ?.rows.map((r) => r.value)
      .join(' ') ?? '',
    /Git commit/
  );
});

test('hex of an unremarkable length is not a hash', () => {
  assert.equal(readHash('abc123'), null);
  assert.equal(readHash('z'.repeat(64)), null);
});

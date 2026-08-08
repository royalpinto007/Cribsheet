# Contributing to Cribsheet

Cribsheet is a Chrome MV3 extension written in TypeScript with no runtime
dependencies. It decodes selected text in the page it was selected in.

## Local setup

```bash
npm ci
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose Load unpacked
and select the repository root.

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run format:check
npm run build
npm run test:e2e   # needs: npx playwright install chromium
```

Run the end-to-end suite. It loads the extension against a page whose
stylesheet is deliberately hostile, which is the failure this design exists to
prevent.

## Three rules

**Nothing leaves the machine.** No network calls of any kind, no analytics, no
telemetry, no remote config, no CDN fonts. CI greps the built bundles and fails
if one appears. The whole argument for this extension is that a token decoded
here has not been shown to anyone.

**Nothing is stored.** There is no `storage` permission and there should not be
one. A history of decoded values would be a file full of other people's secrets.

**The permission list does not grow.** `activeTab`, `contextMenus`, `scripting`.
A context menu click and a command shortcut both grant `activeTab`, so no host
permission is ever needed. CI fails the build if the list changes.

## Adding a detector

A detector is a function from text to readings, and the hard half is the
declining.

- It goes in the module it belongs to, and into the `DETECTORS` list in
  `decode.ts`.
- It takes trimmed text and returns `null` when it does not apply. It never
  throws: selections come from arbitrary pages, so eventually every shape
  arrives.
- **Its confidence must be honest.** Score it by how much the shape of the text
  supports the reading, not by how much you would like it to be right. A JWT is
  unmistakable and scores 0.99. A bare five numbers is valid cron and is almost
  never cron, so it scores 0.45.
- **It needs tests for the near misses.** Every detector here has them: a
  version string is not an IP address, a bare six digit hex string is not a
  colour, a number with an eight in it is not an octal mode, something with two
  dots in it is not a JWT. A pull request that only tests the happy path is not
  finished.

## Writing the output

- Rows say what the thing means, not what it is called. "Actually means
  unauthenticated. You have not proved who you are" beats repeating the words
  "Unauthorized" back at someone who just read them.
- Where something is dangerous, say so and set `warn`. An expired token, `alg:
none`, world-writable permissions, MD5 offered as security.
- Where a reading is inferred rather than proved, put that in `note`. A hash is
  identified only by length, and the note says so.

## Guidelines

- Keep the change focused. One concern per pull request.
- Logic that can be pure should be pure. Nothing in `src/` touches the DOM
  except `popover.ts`.
- Decoded values are untrusted input and are never interpolated into markup.
  Build nodes and set `textContent`. There is no `innerHTML` in this codebase.
- Update the README table and the CHANGELOG when you add a format.

## Reporting bugs

Use the bug report template. If the input is a real token or key, replace the
secret parts but keep the shape, since the shape is what the detector sees.

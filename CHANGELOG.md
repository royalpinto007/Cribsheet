# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-08

First release.

### Added

- Decode selected text in place, from the context menu or Alt+Shift+D.
- Sixteen readings: Unix timestamps in three precisions, ISO dates, durations,
  cron expressions, JWTs, base64, percent encoding, escaped characters, UUIDs,
  hashes by length, colours, byte counts, HTTP statuses, IPv4 addresses, Unix
  file modes and plain numbers.
- Several readings at once where the text honestly supports several, ranked by
  how much its shape supports each, and hedged in words rather than numbers.
- Warnings where they matter: an expired token, `alg: none`, a version 1 UUID
  leaking its generating machine, world-writable file modes, MD5 and SHA-1
  offered as security.
- Cron translated with consecutive values collapsed, so a weekday schedule reads
  "Monday to Friday", and with the day-of-month and day-of-week trap called out.
- A popup scratchpad for when you have the string but not the page.

### Notes

- Three permissions, and no host permissions at all: a context menu click and a
  keyboard shortcut each grant `activeTab` for one tab.
- No network requests and no storage permission. Nothing is sent anywhere and
  nothing is kept.
- The service worker never sees the selection. Decoding happens in the page.

[1.0.0]: https://github.com/royalpinto007/Cribsheet/releases/tag/v1.0.0

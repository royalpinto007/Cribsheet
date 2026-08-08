# Security Policy

## Supported versions

The latest release is supported. Cribsheet is a browser extension, so the
version that matters is the one installed from the store.

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a security
problem.

Report it privately through GitHub's
[security advisory form](https://github.com/royalpinto007/Cribsheet/security/advisories/new),
which is visible only to the maintainers.

Include what you found, how to reproduce it, and what an attacker could do with
it. A rough proof of concept helps.

You can expect an acknowledgement within a week. If the report is valid, we
will agree a disclosure timeline with you before anything is made public.

## Scope

People use Cribsheet on secrets. That is the whole point of it, and it sets the
bar for what counts as a serious issue here.

- **Anything that moves a decoded value off the machine.** There should be no
  network request at all, so one appearing is a finding in itself, and a severe
  one.
- **Anything that persists a decoded value.** There is no storage permission.
  Anything that gets a selection into storage, a log, a URL or a title is a
  finding.
- **Anything that lets the host page read what was decoded.** The sheet is in a
  shadow root, but an open shadow root is readable by the page's own script, so
  a way to make a page observe a decoding it did not already have the text for
  is worth reporting.
- **Anything that gets script execution from selected text.** All of it is
  attacker-controlled and is rendered with `textContent`. A way around that is
  the highest severity issue here.
- **Anything that makes a decoding wrong in a way someone would act on.** A JWT
  shown as valid when it is expired, or a permission mode shown as safer than it
  is, is a security bug rather than a display bug.

Out of scope: a format not being recognised, or a reading being ranked below a
better one. Those are bugs, and the bug template is the right place for them.

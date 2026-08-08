import { decode, nothingFound } from './decode.js';
import type { Reading } from './types.js';

/**
 * The result, shown in the page.
 *
 * Everything lives in a shadow root. A popover injected into someone else's
 * document is otherwise at the mercy of their stylesheet, and the failure mode
 * is a tool that works everywhere except the one site you needed it on.
 *
 * There is no side panel and no separate window on purpose: the answer belongs
 * next to the thing you selected, and the interaction should be over in two
 * seconds.
 */

const HOST_ID = '__cribsheet';

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }

  .sheet {
    position: absolute;
    z-index: 2147483647;
    width: min(420px, calc(100vw - 24px));
    max-height: min(60vh, 520px);
    overflow-y: auto;
    background: #ffffff;
    color: #16151c;
    border: 1px solid #dcd9e6;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgb(20 16 40 / 22%);
    font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    padding: 4px 0 6px;
  }

  @media (prefers-color-scheme: dark) {
    .sheet { background: #1a1822; color: #ece9f4; border-color: #322d42; }
    .selected { background: #221f2d; color: #a49fb8; }
    .row + .row { border-top-color: #262232; }
    .copy { color: #837da0; }
    .copy:hover { color: #ece9f4; background: #262232; }
    .note { color: #a49fb8; }
    kbd { background: #262232; border-color: #3a3450; color: #a49fb8; }
  }

  .selected {
    margin: 4px 10px 8px;
    padding: 7px 9px;
    border-radius: 7px;
    background: #f3f1f8;
    color: #5b5670;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    word-break: break-all;
    max-height: 4.5em;
    overflow: hidden;
  }

  .reading { padding: 2px 10px 10px; }
  .reading + .reading { border-top: 1px solid #ece9f4; padding-top: 10px; }

  @media (prefers-color-scheme: dark) {
    .reading + .reading { border-top-color: #262232; }
  }

  .title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-weight: 640;
    margin-bottom: 5px;
  }

  /* Confidence is shown as a word, never as a bare number: "likely" is
     something a person can act on, "0.65" is not. */
  .hedge {
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8b85a6;
    font-weight: 500;
    flex-shrink: 0;
  }

  .row { display: flex; gap: 10px; padding: 3px 0; align-items: baseline; }
  .row + .row { border-top: 1px solid #f4f2f9; }

  .label {
    flex-shrink: 0;
    width: 6.6em;
    color: #8b85a6;
    font-size: 11.5px;
  }

  .value {
    flex: 1;
    min-width: 0;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  .value.warn { color: #c0392b; }
  @media (prefers-color-scheme: dark) { .value.warn { color: #f08a7c; } }

  .swatch {
    display: inline-block;
    width: 11px;
    height: 11px;
    border-radius: 3px;
    border: 1px solid rgb(0 0 0 / 25%);
    margin-right: 6px;
    vertical-align: -1px;
  }

  .copy {
    flex-shrink: 0;
    border: none;
    background: none;
    color: #a9a3bf;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 5px;
  }
  .copy:hover { color: #16151c; background: #f3f1f8; }

  .note {
    margin: 7px 0 0;
    padding: 7px 9px;
    border-radius: 7px;
    background: #f3f1f8;
    color: #5b5670;
    font-size: 11.5px;
  }
  @media (prefers-color-scheme: dark) { .note { background: #221f2d; } }

  .empty { padding: 12px 10px; color: #5b5670; }

  .foot {
    padding: 6px 10px 2px;
    color: #a9a3bf;
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  kbd {
    font: inherit;
    font-size: 10.5px;
    background: #f3f1f8;
    border: 1px solid #e2dfec;
    border-radius: 4px;
    padding: 0 4px;
  }
`;

/** Confidence as a word. A number would imply a precision that is not there. */
export function hedge(confidence: number): string {
  if (confidence >= 0.9) return 'certain';
  if (confidence >= 0.7) return 'likely';
  if (confidence >= 0.45) return 'possible';
  return 'a stretch';
}

export function removePopover(): void {
  document.getElementById(HOST_ID)?.remove();
}

/**
 * Show the decoding for some text, near where it was selected.
 *
 * Returns how many readings were found, which is what the worker reports back.
 */
export function showPopover(input: string, now: number = Date.now()): number {
  removePopover();

  const { text, readings } = decode(input, now);

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:absolute;top:0;left:0;width:0;height:0;';
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Cribsheet');

  const selected = document.createElement('div');
  selected.className = 'selected';
  selected.textContent = text.length > 220 ? `${text.slice(0, 219)}…` : text;
  if (text) sheet.append(selected);

  if (!readings.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = nothingFound(text);
    sheet.append(empty);
  } else {
    for (const reading of readings) sheet.append(renderReading(reading, root));
  }

  const foot = document.createElement('div');
  foot.className = 'foot';
  const left = document.createElement('span');
  left.textContent = 'Nothing left this page.';
  const right = document.createElement('span');
  const key = document.createElement('kbd');
  key.textContent = 'Esc';
  right.append(key, document.createTextNode(' to close'));
  foot.append(left, right);
  sheet.append(foot);

  root.append(style, sheet);
  document.body.appendChild(host);

  position(sheet);
  arm(host);
  return readings.length;
}

function renderReading(reading: Reading, root: ShadowRoot): HTMLElement {
  const block = document.createElement('div');
  block.className = 'reading';

  const title = document.createElement('div');
  title.className = 'title';
  const name = document.createElement('span');
  name.textContent = reading.title;
  const hedged = document.createElement('span');
  hedged.className = 'hedge';
  hedged.textContent = hedge(reading.confidence);
  title.append(name, hedged);
  block.append(title);

  for (const row of reading.rows) {
    const line = document.createElement('div');
    line.className = 'row';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = row.label;

    const value = document.createElement('span');
    value.className = `value${row.warn ? ' warn' : ''}`;
    if (row.swatch) {
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = row.swatch;
      value.append(swatch);
    }
    // Decoded values come from arbitrary page text, so they are only ever text.
    value.append(document.createTextNode(row.value));

    const copy = document.createElement('button');
    copy.className = 'copy';
    copy.type = 'button';
    copy.textContent = 'copy';
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(row.value).then(
        () => {
          copy.textContent = 'copied';
          setTimeout(() => (copy.textContent = 'copy'), 1200);
        },
        () => (copy.textContent = 'blocked')
      );
    });

    line.append(label, value, copy);
    block.append(line);
  }

  if (reading.note) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = reading.note;
    block.append(note);
  }

  void root;
  return block;
}

/**
 * Put the sheet next to the selection, and inside the window.
 *
 * Below the selection by default, above it when there is no room, which is the
 * behaviour every text tool has and so the one nobody has to learn.
 */
function position(sheet: HTMLElement): void {
  const selection = window.getSelection();
  const rect =
    selection && selection.rangeCount > 0 && !selection.isCollapsed
      ? selection.getRangeAt(0).getBoundingClientRect()
      : null;

  const width = sheet.offsetWidth;
  const height = sheet.offsetHeight;
  const margin = 8;

  let top: number;
  let left: number;

  if (rect && (rect.width || rect.height)) {
    const below = rect.bottom + margin;
    const fitsBelow = below + height < window.innerHeight;
    top = (fitsBelow ? below : Math.max(margin, rect.top - height - margin)) + window.scrollY;
    left = rect.left + window.scrollX;
  } else {
    top = window.scrollY + margin;
    left = window.scrollX + window.innerWidth - width - margin;
  }

  const maxLeft = window.scrollX + window.innerWidth - width - margin;
  sheet.style.top = `${Math.max(window.scrollY + margin, top)}px`;
  sheet.style.left = `${Math.min(Math.max(window.scrollX + margin, left), maxLeft)}px`;
}

/** Dismiss on Escape, on a click elsewhere, or on scrolling away. */
function arm(host: HTMLElement): void {
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onClick, true);
    window.removeEventListener('scroll', onScroll, true);
    host.remove();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  // Composed path, because a click inside the shadow root reports the host as
  // its target and would otherwise close the sheet you just clicked in.
  const onClick = (event: MouseEvent) => {
    if (!event.composedPath().includes(host)) close();
  };
  const onScroll = () => close();

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onClick, true);
  window.addEventListener('scroll', onScroll, true);
}

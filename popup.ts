import { decode, nothingFound, MAX_LENGTH } from './src/decode.js';
import { hedge } from './src/popover.js';

/**
 * The popup, which is a scratchpad and a demonstration.
 *
 * It exists because the first question anyone has is "what does this thing
 * read?", and a list of supported formats answers that far worse than typing
 * something in and seeing it work.
 *
 * Nothing typed here is stored or sent. There is no storage permission in the
 * manifest, so that is not a policy, it is an absence of capability.
 */
const input = document.getElementById('input') as HTMLTextAreaElement;
const out = document.getElementById('out') as HTMLElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const charCount = document.getElementById('char-count') as HTMLElement;
const resultCount = document.getElementById('result-count') as HTMLElement;
const examplesEl = document.getElementById('examples') as HTMLElement;

const EXAMPLES = [
  { label: '1700000000', hint: 'timestamp' },
  { label: '0 3 * * 1-5', hint: 'cron' },
  { label: '#5b3fd6', hint: 'colour' },
  { label: '01890a5d-ac96-774b-bcce-b302099a8057', hint: 'uuid' },
  { label: '0755', hint: 'file mode' },
  { label: '429', hint: 'http status' },
];

for (const ex of EXAMPLES) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'example-chip';
  chip.textContent = ex.label;
  chip.title = `Try a ${ex.hint} example`;
  chip.setAttribute('aria-label', `Try example ${ex.label}, a ${ex.hint}`);
  chip.addEventListener('click', () => {
    input.value = ex.label;
    render();
    input.focus();
    input.select();
  });
  examplesEl.append(chip);
}

input.addEventListener('input', render);
clearBtn.addEventListener('click', () => {
  input.value = '';
  render();
  input.focus();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.activeElement !== input && input.value) {
    input.value = '';
    render();
    input.focus();
  }
});

input.value = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]?.label ?? EXAMPLES[0]!.label;
render();
input.focus();
input.select();

function hedgeClass(confidence: number): string {
  const word = hedge(confidence);
  return `hedge ${word === 'certain' || word === 'likely' ? word : ''}`.trim();
}

function render(): void {
  const { text, readings } = decode(input.value);

  clearBtn.hidden = !input.value;
  charCount.textContent = input.value
    ? `${input.value.length.toLocaleString()} char${input.value.length === 1 ? '' : 's'}${input.value.length > MAX_LENGTH ? ' · too long' : ''}`
    : '';
  resultCount.textContent = readings.length
    ? `${readings.length} reading${readings.length === 1 ? '' : 's'}`
    : '';

  if (!readings.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const art = document.createElement('div');
    art.className = 'empty-art';
    art.textContent = text ? '❓' : '✨';
    art.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = text ? 'No reading for that' : 'Paste a value to decode it';
    const hint = document.createElement('span');
    hint.textContent = nothingFound(text);
    empty.append(art, title, hint);
    out.replaceChildren(empty);
    return;
  }

  out.replaceChildren(...readings.map((r, i) => block(r, i === 0)));
}

function block(
  reading: ReturnType<typeof decode>['readings'][number],
  topPick: boolean
): HTMLElement {
  const el = document.createElement('section');
  el.className = `reading${topPick && reading.confidence >= 0.7 ? ' top-pick' : ''}`;

  const title = document.createElement('div');
  title.className = 'title';

  const name = document.createElement('span');
  name.textContent = reading.title;

  const hedged = document.createElement('span');
  hedged.className = hedgeClass(reading.confidence);
  hedged.textContent = hedge(reading.confidence);
  hedged.title = `Confidence ${Math.round(reading.confidence * 100)} percent`;

  title.append(name, hedged);
  el.append(title);

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
    // Typed input is untrusted like any other, so it is only ever text.
    value.append(document.createTextNode(row.value));

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn';
    copy.textContent = 'Copy';
    copy.setAttribute('aria-label', `Copy ${row.label} value`);
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(row.value);
        copy.textContent = 'Copied';
        copy.classList.add('copied');
        setTimeout(() => {
          copy.textContent = 'Copy';
          copy.classList.remove('copied');
        }, 1200);
      } catch {
        copy.textContent = 'Blocked';
      }
    });

    line.append(label, value, copy);
    el.append(line);
  }

  if (reading.note) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = reading.note;
    el.append(note);
  }
  return el;
}

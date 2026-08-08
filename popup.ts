import { decode, nothingFound } from './src/decode.js';
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

const EXAMPLES = [
  '1700000000',
  '0 3 * * 1-5',
  '#5b3fd6',
  '01890a5d-ac96-774b-bcce-b302099a8057',
  '0755',
  '429',
];

input.addEventListener('input', render);
input.value = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)] ?? EXAMPLES[0]!;
render();
input.focus();
input.select();

function render(): void {
  const { text, readings } = decode(input.value);

  if (!readings.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = nothingFound(text);
    out.replaceChildren(empty);
    return;
  }

  out.replaceChildren(...readings.map(block));
}

function block(reading: ReturnType<typeof decode>['readings'][number]): HTMLElement {
  const el = document.createElement('section');
  el.className = 'reading';

  const title = document.createElement('div');
  title.className = 'title';

  const name = document.createElement('span');
  name.textContent = reading.title;

  const hedged = document.createElement('span');
  hedged.className = 'hedge';
  hedged.textContent = hedge(reading.confidence);

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

    line.append(label, value);
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

// Pure table-parsing helpers for chat replies (kept apart from the React component so they can be unit-tested).

export const isRow = (line) => /^\s*\|?.*\|.*$/.test(line) && line.includes('|');
const isSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

const splitCells = (line) => {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
};

// Column alignment from the separator row (---: right, :---: center), else right for columns whose every
// value is a number ("1,191", "40.2%", "-3.5", "12.4x"), else left.
const NUMERIC = /^[~≈+\-−]?\s*[₹$]?\s*\d[\d,]*(\.\d+)?\s*(%|x|×|k|m|cr|lakh)?$/i;
export function columnAligns(separator, rows, columns) {
  const cells = separator ? splitCells(separator) : [];
  return Array.from({ length: columns }, (_, c) => {
    const spec = (cells[c] || '').trim();
    if (spec.startsWith(':') && spec.endsWith(':')) return 'center';
    if (spec.endsWith(':')) return 'right';
    if (spec.startsWith(':')) return 'left';
    const values = rows.map((r) => String(r[c] ?? '').replace(/[*_`]/g, '').trim()).filter((v) => v !== '' && v !== '—' && v !== '-');
    return values.length > 0 && values.every((v) => NUMERIC.test(v)) ? 'right' : 'left';
  });
}

// Split the text into {type:'md'|'table'} blocks.
export function splitBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let md = [];
  const flush = () => {
    if (md.length) blocks.push({ type: 'md', text: md.join('\n') });
    md = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1]) && !isSeparator(lines[i])) {
      const header = splitCells(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && isRow(lines[j]) && lines[j].trim() !== '') {
        rows.push(splitCells(lines[j]));
        j += 1;
      }
      flush();
      blocks.push({ type: 'table', header, rows, aligns: columnAligns(lines[i + 1], rows, header.length) });
      i = j - 1;
    } else {
      md.push(lines[i]);
    }
  }
  flush();
  return blocks;
}

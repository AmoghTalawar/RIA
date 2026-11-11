// Run: node --test src/lib/chatTable.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBlocks, columnAligns } from './chatTable.js';

const table = (sep) => `| Measure | Hubballi | Belagavi | Note |
${sep}
| Papers | 5,870 | 1,020 | big |
| Q1 share | 40.2% | 34.4% | — |
| Delta | -3.5 | +2 | low |`;

test('numeric columns are right-aligned, text columns left, with no explicit alignment', () => {
  const [t] = splitBlocks(table('| --- | --- | --- | --- |'));
  assert.deepEqual(t.aligns, ['left', 'right', 'right', 'left']);
});

test('the separator row wins: ---: right, :--- left, :---: center', () => {
  const [t] = splitBlocks(table('| :--- | :---: | ---: | --- |'));
  assert.deepEqual(t.aligns, ['left', 'center', 'right', 'left']);
});

test('a column with any text value stays left', () => {
  const [t] = splitBlocks('| A | B |\n| --- | --- |\n| x | 12 |\n| y | n/a |');
  assert.deepEqual(t.aligns, ['left', 'left']);
});

test('currency, percent and multiples count as numbers; empty and dash cells are ignored', () => {
  assert.deepEqual(columnAligns('| --- |', [['₹1,20,000'], ['45%'], ['3.2x'], ['—'], ['']], 1), ['right']);
});

test('text around a table is kept and the table is still found', () => {
  const blocks = splitBlocks('Lead sentence.\n\n' + table('| --- | --- | --- | --- |') + '\n\nAfter.');
  assert.deepEqual(blocks.map((b) => b.type), ['md', 'table', 'md']);
});

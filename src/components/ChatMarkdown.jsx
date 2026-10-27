import React from 'react';
import ReactMarkdown from 'react-markdown';

// react-markdown alone does not render GitHub-style tables (that needs remark-gfm), and the
// `prose` classes are inactive (no typography plugin), so lists/tables came out as raw text.
// This component renders pipe tables itself and styles the rest of the Markdown.

const isRow = (line) => /^\s*\|?.*\|.*$/.test(line) && line.includes('|');
const isSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

const splitCells = (line) => {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
};

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
      blocks.push({ type: 'table', header, rows });
      i = j - 1;
    } else {
      md.push(lines[i]);
    }
  }
  flush();
  return blocks;
}

const mdComponents = {
  p: (props) => <p className="my-1.5 leading-relaxed" {...props} />,
  ul: (props) => <ul className="my-1.5 list-disc pl-5 space-y-0.5" {...props} />,
  ol: (props) => <ol className="my-1.5 list-decimal pl-5 space-y-0.5" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  h1: (props) => <h3 className="mt-3 mb-1 text-base font-semibold" {...props} />,
  h2: (props) => <h3 className="mt-3 mb-1 text-base font-semibold" {...props} />,
  h3: (props) => <h4 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
  h4: (props) => <h4 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
  code: (props) => <code className="rounded bg-gray-100 px-1 py-0.5 text-xs" {...props} />,
  hr: () => <hr className="my-2 border-gray-200" />,
};

const Cell = ({ children }) => (
  <ReactMarkdown components={{ ...mdComponents, p: ({ children }) => <>{children}</> }}>{children}</ReactMarkdown>
);

export default function ChatMarkdown({ text }) {
  const blocks = splitBlocks(text);
  return (
    <div className="text-sm text-graphite">
      {blocks.map((b, idx) => {
        if (b.type === 'md') {
          return b.text.trim() === '' ? null : (
            <ReactMarkdown key={idx} components={mdComponents}>{b.text}</ReactMarkdown>
          );
        }
        return (
          <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {b.header.map((h, k) => (
                    <th key={k} className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
                      <Cell>{h}</Cell>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className={ri % 2 ? 'bg-gray-50/60' : ''}>
                    {b.header.map((_, ci) => (
                      <td key={ci} className="border-b border-gray-100 px-3 py-1.5 align-top">
                        <Cell>{r[ci] ?? ''}</Cell>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

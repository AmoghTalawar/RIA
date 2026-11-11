import React from 'react';
import ReactMarkdown from 'react-markdown';
import { splitBlocks } from '../lib/chatTable';

// react-markdown alone does not render GitHub-style tables (that needs remark-gfm), and the
// `prose` classes are inactive (no typography plugin), so lists/tables came out as raw text.
// This component renders pipe tables itself and styles the rest of the Markdown.

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
    <div className="min-w-0 max-w-full break-words text-sm text-graphite">
      {blocks.map((b, idx) => {
        if (b.type === 'md') {
          return b.text.trim() === '' ? null : (
            <ReactMarkdown key={idx} components={mdComponents}>{b.text}</ReactMarkdown>
          );
        }
        return (
          <div key={idx} className="my-2 max-w-full overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {b.header.map((h, k) => (
                    <th key={k} style={{ textAlign: b.aligns[k] }} className={`border-b border-gray-200 px-2 py-2 font-semibold text-gray-700 ${k === 0 ? 'sticky left-0 z-10 bg-gray-50 min-w-[96px]' : 'whitespace-nowrap'}`}>
                      <Cell>{h}</Cell>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className={ri % 2 ? 'bg-gray-50/60' : ''}>
                    {b.header.map((_, ci) => (
                      <td key={ci} style={{ textAlign: b.aligns[ci] }} className={`border-b border-gray-100 px-2 py-1.5 align-top ${ci === 0 ? `sticky left-0 z-10 min-w-[96px] font-medium ${ri % 2 ? 'bg-gray-50' : 'bg-white'}` : ''}`}>
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

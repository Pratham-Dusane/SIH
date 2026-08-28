'use client';

/**
 * Minimal markdown renderer for model-authored answers.
 *
 * The hosted VLM replies in markdown — bold, inline code, bullet and numbered
 * lists — which previously reached the user as literal `**` and backticks.
 *
 * This covers exactly that subset rather than pulling in a full markdown
 * dependency, and it builds React elements throughout: no
 * `dangerouslySetInnerHTML`, so model output can never inject markup.
 */

import { Fragment, type ReactNode } from 'react';

/** Inline spans: `code`, **bold**, *italic* / _italic_. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Code first — its content must not be re-parsed for emphasis.
  const tokens = text.split(/(`[^`]+`)/g);

  return tokens.flatMap((token, i) => {
    const key = `${keyPrefix}-${i}`;
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return [
        <code
          key={key}
          className="px-1 py-0.5 rounded bg-secondary/70 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      ];
    }

    // **bold** before *italic*, otherwise the single-asterisk rule eats it.
    return token
      .split(/(\*\*[^*]+\*\*)/g)
      .flatMap((boldPart, j) => {
        const bKey = `${key}-${j}`;
        if (boldPart.startsWith('**') && boldPart.endsWith('**') && boldPart.length > 4) {
          return [
            <strong key={bKey} className="font-semibold text-foreground">
              {boldPart.slice(2, -2)}
            </strong>,
          ];
        }
        return boldPart
          .split(/(\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g)
          .map((italPart, k) => {
            const iKey = `${bKey}-${k}`;
            const isItalic =
              (italPart.startsWith('*') && italPart.endsWith('*') && italPart.length > 2) ||
              (italPart.startsWith('_') && italPart.endsWith('_') && italPart.length > 2);
            if (isItalic) {
              return <em key={iKey}>{italPart.slice(1, -1)}</em>;
            }
            return <Fragment key={iKey}>{italPart}</Fragment>;
          });
      });
  });
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;

export default function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let listItems: string[] = [];
  let listOrdered = false;
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => (
      <li key={i} className="ml-4 list-outside">
        {renderInline(item, `li-${blocks.length}-${i}`)}
      </li>
    ));
    blocks.push(
      listOrdered
        ? <ol key={`b${blocks.length}`} className="list-decimal space-y-0.5 my-1.5">{items}</ol>
        : <ul key={`b${blocks.length}`} className="list-disc space-y-0.5 my-1.5">{items}</ul>,
    );
    listItems = [];
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(' ');
    blocks.push(
      <p key={`b${blocks.length}`} className="my-1 first:mt-0 last:mb-0">
        {renderInline(joined, `p-${blocks.length}`)}
      </p>,
    );
    paragraph = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p key={`b${blocks.length}`} className="font-semibold text-foreground mt-2 first:mt-0">
          {renderInline(heading[2], `h-${blocks.length}`)}
        </p>,
      );
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      flushParagraph();
      if (!listOrdered) flushList();
      listOrdered = true;
      listItems.push(numbered[2]);
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      flushParagraph();
      if (listOrdered) flushList();
      listOrdered = false;
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <div className={className}>{blocks}</div>;
}

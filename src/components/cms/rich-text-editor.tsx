'use client';

import * as React from 'react';
import { Bold, Italic, List, ListOrdered, Link2, Heading2, Heading3, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inputClasses } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

const TOOLS = [
  { label: 'Heading 2', Icon: Heading2, before: '<h2>', after: '</h2>' },
  { label: 'Heading 3', Icon: Heading3, before: '<h3>', after: '</h3>' },
  { label: 'Bold', Icon: Bold, before: '<strong>', after: '</strong>' },
  { label: 'Italic', Icon: Italic, before: '<em>', after: '</em>' },
  { label: 'Link', Icon: Link2, before: '<a href="https://">', after: '</a>' },
  { label: 'Bullet list', Icon: List, before: '<ul>\n  <li>', after: '</li>\n</ul>' },
  { label: 'Numbered list', Icon: ListOrdered, before: '<ol>\n  <li>', after: '</li>\n</ol>' },
  { label: 'Code', Icon: Code, before: '<code>', after: '</code>' },
] as const;

/**
 * HTML editor with formatting shortcuts.
 *
 * Deliberately not a WYSIWYG: everything written here is sanitised server-side
 * before it reaches the public site, and a plain HTML surface keeps that
 * contract obvious rather than hiding it behind a rich editor's output.
 */
export function RichTextEditor({
  value,
  onChange,
  id,
  rows = 10,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = React.useState(false);

  function wrap(before: string, after: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    // Restore a sensible caret position after React re-renders.
    window.requestAnimationFrame(() => {
      el.focus();
      const caret = start + before.length + selected.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="rounded-lg border border-hairline">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline bg-muted/[0.03] p-1.5">
        {TOOLS.map(({ label, Icon, before, after }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => wrap(before, after)}
            className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setPreview((v) => !v)}
          aria-pressed={preview}
        >
          {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>

      {preview ? (
        <div
          className="prose-cms max-h-96 min-h-[8rem] overflow-y-auto p-4"
          // Preview only — the server sanitises before anything is stored or published.
          dangerouslySetInnerHTML={{ __html: value }}
        />
      ) : (
        <textarea
          id={id}
          ref={ref}
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '<p>Write your content…</p>'}
          spellCheck
          className={cn(inputClasses, 'rounded-none border-0 font-mono text-[0.8125rem] shadow-none focus:ring-0')}
        />
      )}
    </div>
  );
}

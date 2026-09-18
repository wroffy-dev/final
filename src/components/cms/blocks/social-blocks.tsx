import Image from 'next/image';
import type { FaqContent, TestimonialsContent } from '@/lib/cms/blocks';
import { getMediaByIds } from '@/lib/services/media';
import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/format';
import { SectionHeading, RichText, type BlockContext, columnVars } from './shared';

export function FaqBlock({ content, ctx }: { content: FaqContent; ctx: BlockContext }) {
  const inverted = ctx.inverted;
  const items = content.items.filter((i) => i.question.trim());
  if (items.length === 0) return null;

  const list = (
    <div className={cn('divide-y', inverted ? 'divide-white/15' : 'divide-hairline')}>
      {items.map((item, index) => (
        <details key={index} className="group py-4" name={`faq-${content.heading || 'group'}`}>
          <summary
            className={cn(
              'flex cursor-pointer list-none items-start justify-between gap-4 text-left font-medium marker:content-none',
              inverted ? 'text-white' : 'text-content',
            )}
          >
            <span>{item.question}</span>
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-lg leading-none transition-transform group-open:rotate-45',
                inverted ? 'bg-white/15 text-white' : 'bg-muted/10 text-muted',
              )}
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <RichText html={item.answer} className={cn('mt-3 pr-10', inverted && 'text-white/75')} />
        </details>
      ))}
    </div>
  );

  if (content.layout === 'split') {
    return (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-16">
        <SectionHeading
          heading={content.heading}
          description={content.description}
          align="left"
          inverted={inverted}
        />
        {list}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-10"
      />
      {list}
    </div>
  );
}

export async function TestimonialsBlock({
  content,
  ctx,
}: {
  content: TestimonialsContent;
  ctx: BlockContext;
}) {
  const inverted = ctx.inverted;
  const items = content.items.filter((i) => i.quote.trim());
  if (items.length === 0) return null;

  const media = await getMediaByIds(items.map((i) => i.imageId).filter((id): id is string => Boolean(id)));

  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />
      <ul className="cms-grid" style={columnVars(ctx.design, content.columns)}>
        {items.map((item, index) => {
          const image = item.imageId ? media.get(item.imageId) : null;
          return (
            <li key={index}>
              <figure
                className={cn(
                  'flex h-full flex-col rounded-xl p-6',
                  inverted ? 'bg-white/10 backdrop-blur' : 'border border-hairline bg-surface shadow-sm',
                )}
              >
                <blockquote
                  className={cn('flex-1 text-sm leading-relaxed', inverted ? 'text-white/85' : 'text-content')}
                >
                  <p>“{item.quote}”</p>
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  {image ? (
                    <Image
                      src={image.url}
                      alt={image.altText || item.name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold',
                        inverted ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand',
                      )}
                      aria-hidden="true"
                    >
                      {initials(item.name || '?')}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span
                      className={cn('block text-sm font-semibold', inverted ? 'text-white' : 'text-content')}
                    >
                      {item.name}
                    </span>
                    <span className={cn('block text-xs', inverted ? 'text-white/65' : 'text-muted')}>
                      {[item.role, item.company].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </>
  );
}

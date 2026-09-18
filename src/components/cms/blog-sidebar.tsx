import * as React from 'react';
import { parseBlockContent } from '@/lib/cms/blocks';
import { parseSectionDesign, buildSectionStyles } from '@/lib/cms/design';
import type { BlogRenderContext } from '@/lib/cms/blog-render';
import type { CountryContext } from '@/lib/country/types';
import { localiseContent } from '@/lib/country/routing';
import type {
  WidgetPostListContent,
  WidgetSearchContent,
  WidgetTocContent,
  WidgetCategoriesContent,
  WidgetTagsContent,
  WidgetFormContent,
  WidgetCtaContent,
  WidgetAuthorContent,
  WidgetProductsContent,
  WidgetImageContent,
  WidgetTextContent,
  WidgetHeadingContent,
  WidgetButtonContent,
  WidgetSocialContent,
} from '@/lib/cms/blog-blocks';
import {
  WidgetSearch,
  WidgetToc,
  WidgetPosts,
  WidgetCategories,
  WidgetTags,
  WidgetForm,
  WidgetCta,
  WidgetAuthor,
  WidgetProducts,
  WidgetImage,
  WidgetText,
  WidgetHeading,
  WidgetButton,
  WidgetSocial,
} from './blocks/blog-widgets';
import type { RenderableSection } from './section-renderer';

/**
 * The article sidebar.
 *
 * A widget is dispatched here exactly the way a section is dispatched in the
 * section renderer, and it carries the same universal design record — so the
 * responsive visibility, spacing and alignment controls an admin already knows
 * from the page builder work on a sidebar widget too.
 */
async function WidgetBody({
  section,
  ctx,
}: {
  section: RenderableSection;
  ctx: { country: CountryContext; blog?: BlogRenderContext };
}) {
  const { blockType } = section;
  // Internal links stored in a widget's payload resolve inside the market being
  // rendered, the same way a page section's do.
  const content = localiseContent(section.content, ctx.country);
  const parse = <T,>() => parseBlockContent<T>(blockType, content);
  const id = `widget-${section.id}`;

  switch (blockType) {
    case 'widgetSearch':
      return <WidgetSearch content={parse<WidgetSearchContent>()} ctx={ctx} id={id} />;
    case 'widgetToc':
      return <WidgetToc content={parse<WidgetTocContent>()} ctx={ctx} id={id} />;
    case 'widgetPosts':
      return <WidgetPosts content={parse<WidgetPostListContent>()} ctx={ctx} id={id} />;
    case 'widgetCategories':
      return <WidgetCategories content={parse<WidgetCategoriesContent>()} ctx={ctx} id={id} />;
    case 'widgetTags':
      return <WidgetTags content={parse<WidgetTagsContent>()} ctx={ctx} id={id} />;
    case 'widgetForm':
    case 'widgetNewsletter':
      return <WidgetForm content={parse<WidgetFormContent>()} ctx={ctx} id={id} />;
    case 'widgetCta':
      return <WidgetCta content={parse<WidgetCtaContent>()} ctx={ctx} id={id} />;
    case 'widgetAuthor':
      return <WidgetAuthor content={parse<WidgetAuthorContent>()} ctx={ctx} id={id} />;
    case 'widgetProducts':
      return <WidgetProducts content={parse<WidgetProductsContent>()} ctx={ctx} id={id} />;
    case 'widgetImage':
      return <WidgetImage content={parse<WidgetImageContent>()} ctx={ctx} id={id} />;
    case 'widgetText':
      return <WidgetText content={parse<WidgetTextContent>()} ctx={ctx} id={id} />;
    case 'widgetHeading':
      return <WidgetHeading content={parse<WidgetHeadingContent>()} ctx={ctx} id={id} />;
    case 'widgetButton':
      return <WidgetButton content={parse<WidgetButtonContent>()} ctx={ctx} id={id} />;
    case 'widgetSocial':
      return <WidgetSocial content={parse<WidgetSocialContent>()} ctx={ctx} id={id} />;
    default:
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[blog] no renderer registered for widget "${blockType}"`);
      }
      return null;
  }
}

export async function BlogSidebar({
  widgets,
  blog,
  className,
}: {
  widgets: RenderableSection[];
  blog: BlogRenderContext;
  className?: string;
}) {
  const visible = widgets
    .filter((widget) => widget.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (visible.length === 0) return null;

  return (
    <aside className={className}>
      {visible.map((widget) => {
        const design = parseSectionDesign(widget.settings);
        const styles = buildSectionStyles(design, widget.id);
        return (
          // A fragment, not a wrapper element: each slot has to be a sibling of
          // the next one for the spacing between widgets — and the rule that
          // drops it after the last one — to apply at all.
          <React.Fragment key={widget.id}>
            {styles.css ? <style dangerouslySetInnerHTML={{ __html: styles.css }} /> : null}
            <div
              id={design.anchorId || undefined}
              data-widget={widget.blockType}
              className={`cms-slot ${styles.className}`}
              style={styles.style as React.CSSProperties}
            >
              <WidgetBody section={widget} ctx={{ country: blog.country, blog }} />
            </div>
          </React.Fragment>
        );
      })}
    </aside>
  );
}

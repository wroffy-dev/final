import type { ResolvedBlogSettings } from '@/lib/cms/blog-settings';
import { typographyVars, cardVars } from '@/lib/cms/blog-settings';

/**
 * The wrapper that turns the blog's design settings into CSS.
 *
 * Everything an admin sets under Blog → Design becomes a custom property here
 * and is consumed by the blog's stylesheet rules. Anything left blank emits no
 * property at all, so the blog inherits the website's own palette, container
 * width and type scale until it is deliberately overridden.
 */
export function BlogRoot({
  settings,
  children,
  className,
}: {
  settings: ResolvedBlogSettings;
  children: React.ReactNode;
  className?: string;
}) {
  const { layout } = settings;

  const style: Record<string, string> = {
    ...typographyVars(settings.typography),
    ...cardVars(settings.card),
  };

  if (layout.containerWidth) style['--layout-container'] = layout.containerWidth;
  if (layout.sectionGap) style['--layout-section-spacing'] = layout.sectionGap;
  if (layout.gridGap && !settings.card.gridGap) style['--blog-grid-gap'] = layout.gridGap;
  if (layout.primaryColor) style['--blog-primary'] = layout.primaryColor;
  if (layout.secondaryColor) style['--blog-secondary'] = layout.secondaryColor;
  if (layout.backgroundColor) style['--blog-bg'] = layout.backgroundColor;
  if (layout.headingColor) style['--blog-heading'] = layout.headingColor;
  if (layout.textColor) style['--blog-text'] = layout.textColor;
  if (layout.linkColor) style['--widget-link'] = layout.linkColor;
  if (layout.sidebarWidth) style['--blog-sidebar-width'] = layout.sidebarWidth;
  if (layout.sidebarGap) style['--blog-sidebar-gap'] = layout.sidebarGap;
  if (layout.stickyOffset) style['--blog-sticky-offset'] = layout.stickyOffset;

  return (
    <div className={`blog-root ${className ?? ''}`} style={style as React.CSSProperties}>
      {children}
    </div>
  );
}

import type { BlogSurface } from '@prisma/client';
import { blockDefaults } from './blocks';

/**
 * The section set a surface falls back to before an administrator has arranged
 * one of their own.
 *
 * These are starting points, not hardcoded layouts: the moment anyone saves a
 * change to a surface the real rows take over completely, and every value here
 * is editable from that point on. Keeping the fallback in code (rather than
 * requiring a seed step) means a fresh install has a working blog, and an
 * existing install gets the new blog without a data migration.
 */

export type SectionSeed = {
  blockType: string;
  /** Content overrides layered on the block's own defaults. */
  content?: Record<string, unknown>;
  /**
   * Design overrides. Only presets and palette tokens are used here — never a
   * colour literal — so the starting arrangement follows the website's own
   * brand rather than freezing one.
   */
  settings?: Record<string, unknown>;
  name?: string;
  isVisible?: boolean;
};

export const DEFAULT_LISTING_SECTIONS: SectionSeed[] = [
  {
    blockType: 'blogHero',
    content: {
      heading: 'Insights',
      subtitle: 'Guides, playbooks and product notes',
      description:
        'Migration playbooks, plan comparisons and administration tips from the team that deploys Dropbox for a living.',
      showBreadcrumb: true,
    },
  },
  {
    blockType: 'blogCategoryFilter',
    content: { showAll: true, allLabel: 'All', showSearch: true, showCounts: false },
  },
  {
    blockType: 'blogFeatured',
    content: { heading: 'Featured', selection: 'auto', layout: 'imageLeft' },
  },
  {
    blockType: 'blogGrid',
    content: { heading: 'Latest articles', source: 'latest', paginate: true, columns: 3, limit: 9 },
  },
  { blockType: 'blogPagination' },
  {
    blockType: 'cta',
    content: {
      heading: 'Planning a Dropbox rollout?',
      description: 'Talk to a specialist about licensing, migration and onboarding for your team.',
      variant: 'simple',
      alignment: 'center',
      primaryCtaLabel: 'Talk to an expert',
      primaryCtaUrl: '/contact',
      showPrimaryCta: true,
      ctaLocation: 'blog_archive_cta',
    },
    settings: { preset: 'dark' },
  },
  {
    blockType: 'formBlock',
    content: {
      heading: 'Get pricing and a rollout plan',
      description: 'Tell us about your team and we will come back with options.',
      ctaLocation: 'blog_archive_form',
    },
    settings: { preset: 'muted' },
  },
];

export const DEFAULT_ARTICLE_SECTIONS: SectionSeed[] = [
  { blockType: 'articleBreadcrumb' },
  { blockType: 'articleHeader' },
  { blockType: 'articleImage' },
  { blockType: 'articleToc' },
  { blockType: 'articleContent' },
  { blockType: 'articleTags' },
  { blockType: 'articleShare' },
  { blockType: 'articleAuthor' },
  {
    blockType: 'articleRelated',
    // Two columns, not three: the article column is narrower than the archive,
    // and three cards in it wrap every title onto four lines.
    content: { heading: 'Related articles', source: 'related', limit: 2, columns: 2 },
  },
  { blockType: 'articlePrevNext' },
  {
    blockType: 'cta',
    content: {
      heading: 'Talk to a Dropbox expert',
      description: 'Licensing, migration and onboarding, handled by people who do it every day.',
      variant: 'simple',
      alignment: 'center',
      primaryCtaLabel: 'Book a call',
      primaryCtaUrl: '/contact',
      showPrimaryCta: true,
      ctaLocation: 'blog_article_cta',
    },
    settings: { preset: 'dark' },
  },
];

export const DEFAULT_SIDEBAR_WIDGETS: SectionSeed[] = [
  { blockType: 'widgetSearch', content: { title: 'Search', placeholder: 'Search articles' } },
  { blockType: 'widgetToc', content: { title: 'On this page' } },
  {
    blockType: 'widgetPosts',
    content: { title: 'Recent articles', source: 'latest', limit: 4, layout: 'compact' },
  },
  { blockType: 'widgetCategories', content: { title: 'Categories', showCounts: true } },
  {
    blockType: 'widgetForm',
    content: {
      title: 'Talk to us',
      ctaLocation: 'blog_sidebar_form',
      preferPostForm: true,
      // A bordered card, drawn from the palette rather than a colour literal,
      // so the form reads as a distinct block in the column.
      panel: {
        borderEnabled: true,
        radius: '12px',
        padding: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      },
    },
  },
];

export const DEFAULT_SECTIONS: Record<BlogSurface, SectionSeed[]> = {
  LISTING: DEFAULT_LISTING_SECTIONS,
  ARTICLE: DEFAULT_ARTICLE_SECTIONS,
  SIDEBAR: DEFAULT_SIDEBAR_WIDGETS,
};

/** Materialises a seed list into rows shaped like `BlogSection`. */
export function synthesiseSections(
  surface: BlogSurface,
): Array<{
  id: string;
  surface: BlogSurface;
  postId: string | null;
  blockType: string;
  name: string | null;
  sortOrder: number;
  isVisible: boolean;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
}> {
  return DEFAULT_SECTIONS[surface].map((seed, index) => ({
    // Prefixed so a synthesised id can never be mistaken for a database row.
    id: `default-${surface.toLowerCase()}-${index}`,
    surface,
    postId: null,
    blockType: seed.blockType,
    name: seed.name ?? null,
    sortOrder: (index + 1) * 10,
    isVisible: seed.isVisible ?? true,
    content: { ...blockDefaults(seed.blockType), ...(seed.content ?? {}) },
    settings: seed.settings ?? {},
  }));
}

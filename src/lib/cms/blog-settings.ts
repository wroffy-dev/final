import { z } from 'zod';
import { normaliseLength } from './design';

/**
 * Blog-wide presentation settings.
 *
 * These describe the parts of the blog that are *not* a section: how a blog
 * card looks everywhere it appears, how the article and its sidebar share the
 * page, which sharing networks are offered, and the blog's own typography
 * overrides. They live in `BlogSettings`'s JSON columns and are parsed through
 * the schemas below, which never throw — an unknown or half-written value
 * falls back to the default, so a bad save can never take the blog down.
 *
 * Everything here is an *override*: an empty string means "inherit", either
 * from the website's global design settings or from the component's own
 * sensible default. That is what keeps the blog looking like the rest of the
 * site until an admin deliberately changes something.
 */

const length = z.preprocess(normaliseLength, z.string());

const hex = z
  .string()
  .trim()
  .transform((v) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : ''))
  .catch('')
  .default('');

const bool = (fallback: boolean) => z.coerce.boolean().catch(fallback).default(fallback);

export const SHADOWS = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export type ShadowSize = (typeof SHADOWS)[number];

export const SHADOW_CSS: Record<ShadowSize, string> = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.05)',
  md: '0 4px 12px rgb(0 0 0 / 0.08)',
  lg: '0 10px 30px rgb(0 0 0 / 0.12)',
  xl: '0 20px 50px rgb(0 0 0 / 0.18)',
};

export const IMAGE_RATIOS = ['16/9', '4/3', '3/2', '1/1', '21/9', 'auto'] as const;

export const RATIO_CSS: Record<string, string | undefined> = {
  '16/9': '16 / 9',
  '4/3': '4 / 3',
  '3/2': '3 / 2',
  '1/1': '1 / 1',
  '21/9': '21 / 9',
  auto: undefined,
};

// ---------------------------------------------------------------------------
// Blog card
// ---------------------------------------------------------------------------

/**
 * One definition of a blog card, used by every grid, the featured section and
 * the sidebar post lists. Visibility toggles and styling sit together because
 * an admin thinks about them together.
 */
export const blogCardSchema = z.object({
  // --- what the card shows ---
  showImage: bool(true),
  showCategory: bool(true),
  showExcerpt: bool(true),
  showAuthor: bool(true),
  showAuthorImage: bool(true),
  showDate: bool(true),
  showUpdatedDate: bool(false),
  showReadTime: bool(true),
  showTags: bool(false),
  showCta: bool(false),
  ctaLabel: z.string().max(60).catch('').default('Read article'),
  excerptLines: z.coerce.number().int().min(1).max(8).catch(3).default(3),

  // --- card box ---
  background: hex,
  borderEnabled: bool(true),
  borderColor: hex,
  borderWidth: length.default(''),
  radius: length.default(''),
  shadow: z.enum(SHADOWS).catch('sm').default('sm'),
  padding: length.default(''),
  hoverEffect: z.enum(['none', 'lift', 'shadow', 'zoom']).catch('shadow').default('shadow'),

  // --- image ---
  imageRatio: z.enum(IMAGE_RATIOS).catch('16/9').default('16/9'),
  imageHeight: length.default(''),
  imageRadius: length.default(''),

  // --- type ---
  titleSize: length.default(''),
  titleWeight: z.enum(['400', '500', '600', '700', '800']).catch('700').default('700'),
  titleColor: hex,
  excerptColor: hex,
  metaColor: hex,
  categoryColor: hex,
  categoryBackground: hex,
  ctaColor: hex,

  // --- grid ---
  gridGap: length.default(''),
  rowGap: length.default(''),
});

export type BlogCardSettings = z.infer<typeof blogCardSchema>;
export const DEFAULT_BLOG_CARD: BlogCardSettings = blogCardSchema.parse({});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const SIDEBAR_WIDTHS = ['20%', '25%', '30%', '35%'] as const;
export const MOBILE_SIDEBAR = ['below', 'aboveRelated', 'hidden'] as const;

export const blogLayoutSchema = z.object({
  // --- archive ---
  containerWidth: length.default(''),
  sectionGap: length.default(''),
  gridGap: length.default(''),

  // --- article ---
  articleWidth: length.default(''),
  sidebarEnabled: bool(true),
  sidebarPosition: z.enum(['right', 'left']).catch('right').default('right'),
  /** Any CSS length; the admin picker offers 20/25/30/35% as shortcuts. */
  sidebarWidth: length.default('30%'),
  sidebarGap: length.default(''),
  sidebarSticky: bool(true),
  stickyOffset: length.default('96px'),
  mobileSidebar: z.enum(MOBILE_SIDEBAR).catch('below').default('below'),

  // --- article parts that are settings rather than sections ---
  tocEnabled: bool(true),
  tocPosition: z.enum(['article', 'sidebar']).catch('article').default('article'),
  tocHeading: z.string().max(120).catch('').default('On this page'),
  tocCollapsible: bool(true),
  tocOpenByDefault: bool(true),
  authorBoxEnabled: bool(true),
  relatedEnabled: bool(true),
  relatedHeading: z.string().max(160).catch('').default('Related articles'),
  relatedCount: z.coerce.number().int().min(1).max(12).catch(3).default(3),
  relatedColumns: z.coerce.number().int().min(1).max(4).catch(3).default(3),
  prevNextEnabled: bool(true),

  // --- colours (blank inherits the website palette) ---
  primaryColor: hex,
  secondaryColor: hex,
  backgroundColor: hex,
  headingColor: hex,
  textColor: hex,
  linkColor: hex,
});

export type BlogLayoutSettings = z.infer<typeof blogLayoutSchema>;
export const DEFAULT_BLOG_LAYOUT: BlogLayoutSettings = blogLayoutSchema.parse({});

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export const SHARE_NETWORKS = ['linkedin', 'facebook', 'x', 'whatsapp', 'copy'] as const;
export type ShareNetwork = (typeof SHARE_NETWORKS)[number];

export const SHARE_NETWORK_LABELS: Record<ShareNetwork, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
  whatsapp: 'WhatsApp',
  copy: 'Copy link',
};

export const blogShareSchema = z.object({
  enabled: bool(true),
  heading: z.string().max(80).catch('').default('Share'),
  /** Floating is desktop-only and collapses into the inline row on mobile. */
  position: z.enum(['top', 'bottom', 'both', 'floating']).catch('bottom').default('bottom'),
  linkedin: bool(true),
  facebook: bool(true),
  x: bool(true),
  whatsapp: bool(true),
  copy: bool(true),
});

export type BlogShareSettings = z.infer<typeof blogShareSchema>;
export const DEFAULT_BLOG_SHARE: BlogShareSettings = blogShareSchema.parse({});

export function enabledNetworks(share: BlogShareSettings): ShareNetwork[] {
  return SHARE_NETWORKS.filter((network) => share[network]);
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/** One type role. Every value is an override — blank inherits the global font. */
const typeRoleSchema = z.object({
  size: length.default(''),
  weight: z.enum(['', '300', '400', '500', '600', '700', '800', '900']).catch('').default(''),
  lineHeight: z.string().max(8).catch('').default(''),
  letterSpacing: z.string().max(12).catch('').default(''),
});

export type TypeRole = z.infer<typeof typeRoleSchema>;

export const TYPE_ROLES = [
  'heroHeading',
  'cardTitle',
  'articleTitle',
  'h2',
  'h3',
  'h4',
  'body',
  'meta',
  'sidebarHeading',
] as const;

export type TypeRoleKey = (typeof TYPE_ROLES)[number];

export const TYPE_ROLE_LABELS: Record<TypeRoleKey, string> = {
  heroHeading: 'Hero heading',
  cardTitle: 'Blog card title',
  articleTitle: 'Article title',
  h2: 'Article H2',
  h3: 'Article H3',
  h4: 'Article H4',
  body: 'Article body',
  meta: 'Meta text',
  sidebarHeading: 'Sidebar heading',
};

/** CSS custom property each role writes. Read by the blog stylesheet rules. */
const TYPE_ROLE_VARS: Record<TypeRoleKey, string> = {
  heroHeading: '--blog-hero-heading',
  cardTitle: '--blog-card-title',
  articleTitle: '--blog-article-title',
  h2: '--blog-h2',
  h3: '--blog-h3',
  h4: '--blog-h4',
  body: '--blog-body',
  meta: '--blog-meta',
  sidebarHeading: '--blog-sidebar-heading',
};

export const blogTypographySchema = z.object(
  Object.fromEntries(TYPE_ROLES.map((role) => [role, typeRoleSchema.default(typeRoleSchema.parse({}))])) as {
    [K in TypeRoleKey]: z.ZodDefault<typeof typeRoleSchema>;
  },
);

export type BlogTypography = z.infer<typeof blogTypographySchema>;
export const DEFAULT_BLOG_TYPOGRAPHY: BlogTypography = blogTypographySchema.parse({});

/** Turns the typography overrides into CSS variables for the blog wrapper. */
export function typographyVars(typography: BlogTypography): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of TYPE_ROLES) {
    const value = typography[role];
    const base = TYPE_ROLE_VARS[role];
    if (value.size) vars[`${base}-size`] = value.size;
    if (value.weight) vars[`${base}-weight`] = value.weight;
    if (value.lineHeight) vars[`${base}-lh`] = value.lineHeight;
    if (value.letterSpacing) vars[`${base}-ls`] = value.letterSpacing;
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Per-post overrides
// ---------------------------------------------------------------------------

/**
 * A three-state toggle: inherit the blog default, force on, or force off.
 *
 * Every existing post stores `{}`, which parses to all-default — so adding
 * these controls changed nothing about how any published article renders.
 */
export const OVERRIDES = ['default', 'show', 'hide'] as const;
export type Override = (typeof OVERRIDES)[number];

const override = z.enum(OVERRIDES).catch('default').default('default');

export const POST_TOGGLES = [
  'showBreadcrumb',
  'showCategory',
  'showAuthor',
  'showAuthorBox',
  'showDate',
  'showUpdatedDate',
  'showReadTime',
  'showTags',
  'showShare',
  'showToc',
  'showRelated',
  'showPrevNext',
] as const;

export type PostToggle = (typeof POST_TOGGLES)[number];

export const POST_TOGGLE_LABELS: Record<PostToggle, string> = {
  showBreadcrumb: 'Breadcrumb',
  showCategory: 'Category',
  showAuthor: 'Author byline',
  showAuthorBox: 'Author box',
  showDate: 'Publish date',
  showUpdatedDate: 'Updated date',
  showReadTime: 'Read time',
  showTags: 'Tags',
  showShare: 'Social sharing',
  showToc: 'Table of contents',
  showRelated: 'Related articles',
  showPrevNext: 'Previous / next',
};

export const blogPostOptionsSchema = z.object({
  ...(Object.fromEntries(POST_TOGGLES.map((key) => [key, override])) as {
    [K in PostToggle]: typeof override;
  }),
  /** Forms chosen from Form management — never a hardcoded form. */
  ctaFormSlug: z.string().max(120).catch('').default(''),
  sidebarFormSlug: z.string().max(120).catch('').default(''),
  bottomFormSlug: z.string().max(120).catch('').default(''),
});

export type BlogPostOptions = z.infer<typeof blogPostOptionsSchema>;
export const DEFAULT_POST_OPTIONS: BlogPostOptions = blogPostOptionsSchema.parse({});

/** Resolves one three-state toggle against the blog-wide default. */
export function resolveToggle(value: Override, fallback: boolean): boolean {
  if (value === 'show') return true;
  if (value === 'hide') return false;
  return fallback;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function safeParse<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  const result = schema.safeParse(raw);
  return result.success ? result.data : fallback;
}

export const parseBlogCard = (raw: unknown) => safeParse(blogCardSchema, raw, DEFAULT_BLOG_CARD);
export const parseBlogLayout = (raw: unknown) =>
  safeParse(blogLayoutSchema, raw, DEFAULT_BLOG_LAYOUT);
export const parseBlogShare = (raw: unknown) => safeParse(blogShareSchema, raw, DEFAULT_BLOG_SHARE);
export const parseBlogTypography = (raw: unknown) =>
  safeParse(blogTypographySchema, raw, DEFAULT_BLOG_TYPOGRAPHY);
export const parsePostOptions = (raw: unknown) =>
  safeParse(blogPostOptionsSchema, raw, DEFAULT_POST_OPTIONS);

export type ResolvedBlogSettings = {
  postsPerPage: number;
  card: BlogCardSettings;
  layout: BlogLayoutSettings;
  share: BlogShareSettings;
  typography: BlogTypography;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  noIndex: boolean;
  noFollow: boolean;
};

export const DEFAULT_BLOG_SETTINGS: ResolvedBlogSettings = {
  postsPerPage: 9,
  card: DEFAULT_BLOG_CARD,
  layout: DEFAULT_BLOG_LAYOUT,
  share: DEFAULT_BLOG_SHARE,
  typography: DEFAULT_BLOG_TYPOGRAPHY,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  noIndex: false,
  noFollow: false,
};

// ---------------------------------------------------------------------------
// Card CSS
// ---------------------------------------------------------------------------

/** CSS custom properties one card settings record contributes. */
export function cardVars(card: BlogCardSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  if (card.background) vars['--card-bg'] = card.background;
  if (card.borderEnabled) {
    vars['--card-border-width'] = card.borderWidth || '1px';
    vars['--card-border-color'] = card.borderColor || 'rgb(var(--brand-border))';
  } else {
    vars['--card-border-width'] = '0px';
  }
  if (card.radius) vars['--card-radius'] = card.radius;
  if (card.padding) vars['--card-padding'] = card.padding;
  vars['--card-shadow'] = SHADOW_CSS[card.shadow];
  if (card.imageHeight) vars['--card-image-height'] = card.imageHeight;
  if (card.titleSize) vars['--card-title-size'] = card.titleSize;
  vars['--card-title-weight'] = card.titleWeight;
  if (card.titleColor) vars['--card-title-color'] = card.titleColor;
  if (card.excerptColor) vars['--card-excerpt-color'] = card.excerptColor;
  if (card.metaColor) vars['--card-meta-color'] = card.metaColor;
  if (card.categoryColor) vars['--card-category-color'] = card.categoryColor;
  if (card.categoryBackground) vars['--card-category-bg'] = card.categoryBackground;
  if (card.ctaColor) vars['--card-cta-color'] = card.ctaColor;
  if (card.imageRadius) vars['--card-image-radius'] = card.imageRadius;
  if (card.gridGap) vars['--blog-grid-gap'] = card.gridGap;
  if (card.rowGap) vars['--blog-grid-row-gap'] = card.rowGap;
  return vars;
}

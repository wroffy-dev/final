'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { saveBlogSettings } from '@/lib/actions/blog-layout';
import {
  DEFAULT_BLOG_SETTINGS,
  SHADOWS,
  IMAGE_RATIOS,
  SIDEBAR_WIDTHS,
  MOBILE_SIDEBAR,
  SHARE_NETWORKS,
  SHARE_NETWORK_LABELS,
  TYPE_ROLES,
  TYPE_ROLE_LABELS,
  type ResolvedBlogSettings,
  type BlogCardSettings,
  type BlogLayoutSettings,
  type BlogShareSettings,
  type BlogTypography,
  type TypeRoleKey,
} from '@/lib/cms/blog-settings';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { SettingsSection, SettingsDivider } from '@/components/admin/settings-section';
import { SaveStateIndicator, type SaveState } from '@/components/admin/save-state';
import { ColorInput, UnitInput } from '@/components/cms/design-controls';
import { MediaPicker } from '@/components/admin/media-picker';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Blog design.
 *
 * The parts of the blog that are settings rather than sections: how a card
 * looks everywhere, how the article and sidebar share the page, which sharing
 * networks are offered, the blog's own type scale, and the archive's SEO.
 * Everything is an override — blank inherits the website's own design — so an
 * untouched blog matches the rest of the site.
 */

type FormState = ResolvedBlogSettings & { ogImageId: string | null };

const TABS = [
  { id: 'layout', label: 'Layout' },
  { id: 'cards', label: 'Blog cards' },
  { id: 'article', label: 'Article & sidebar' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'typography', label: 'Typography' },
  { id: 'seo', label: 'Archive SEO' },
];

export function BlogDesignForm({
  initial,
  canEdit,
}: {
  initial: FormState;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState('layout');
  const [values, setValues] = React.useState<FormState>(initial);
  const [state, setState] = React.useState<SaveState>('idle');

  const dirty = state === 'dirty' || state === 'error';

  const setLayout = <K extends keyof BlogLayoutSettings>(key: K, value: BlogLayoutSettings[K]) => {
    setValues((current) => ({ ...current, layout: { ...current.layout, [key]: value } }));
    setState('dirty');
  };
  const setCard = <K extends keyof BlogCardSettings>(key: K, value: BlogCardSettings[K]) => {
    setValues((current) => ({ ...current, card: { ...current.card, [key]: value } }));
    setState('dirty');
  };
  const setShare = <K extends keyof BlogShareSettings>(key: K, value: BlogShareSettings[K]) => {
    setValues((current) => ({ ...current, share: { ...current.share, [key]: value } }));
    setState('dirty');
  };
  const setType = (role: TypeRoleKey, key: keyof BlogTypography[TypeRoleKey], value: string) => {
    setValues((current) => ({
      ...current,
      typography: {
        ...current.typography,
        [role]: { ...current.typography[role], [key]: value },
      },
    }));
    setState('dirty');
  };
  const setTop = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setState('dirty');
  };

  async function save() {
    setState('saving');
    const result = await saveBlogSettings({
      postsPerPage: values.postsPerPage,
      card: values.card,
      layout: values.layout,
      share: values.share,
      typography: values.typography,
      seoTitle: values.seoTitle,
      seoDescription: values.seoDescription,
      canonicalUrl: values.canonicalUrl,
      ogTitle: values.ogTitle,
      ogDescription: values.ogDescription,
      ogImageId: values.ogImageId,
      noIndex: values.noIndex,
      noFollow: values.noFollow,
    });

    if (!result.ok) {
      setState('error');
      toast(result.error, 'error');
      return;
    }
    setState('saved');
    toast(result.message ?? 'Saved.');
    router.refresh();
    window.setTimeout(() => setState((c) => (c === 'saved' ? 'idle' : c)), 2500);
  }

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} onChange={setTab} />

      <Card>
        <CardBody>
          <fieldset disabled={!canEdit || state === 'saving'}>
            <TabPanel id="layout" active={tab}>
              <SettingsSection
                title="Archive layout"
                description="Widths and spacing for /blog and the category and tag archives. Blank inherits the website's own layout."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Container width" hint="Blank uses the site container.">
                    <UnitInput
                      value={values.layout.containerWidth}
                      aria-label="Container width"
                      onChange={(v) => setLayout('containerWidth', v)}
                    />
                  </Field>
                  <Field label="Space between sections">
                    <UnitInput
                      value={values.layout.sectionGap}
                      aria-label="Space between sections"
                      onChange={(v) => setLayout('sectionGap', v)}
                    />
                  </Field>
                  <Field label="Grid gap" hint="Between the cards in an article grid.">
                    <UnitInput
                      value={values.layout.gridGap}
                      aria-label="Grid gap"
                      onChange={(v) => setLayout('gridGap', v)}
                    />
                  </Field>
                  <Field
                    label="Posts per page"
                    htmlFor="posts-per-page"
                    hint="Used by the archive's main grid."
                  >
                    <Select
                      id="posts-per-page"
                      value={String(values.postsPerPage)}
                      onChange={(e) => setTop('postsPerPage', Number(e.target.value))}
                    >
                      {[6, 9, 12, 15, 18, 24].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      {[6, 9, 12, 15, 18, 24].includes(values.postsPerPage) ? null : (
                        <option value={values.postsPerPage}>{values.postsPerPage} (custom)</option>
                      )}
                    </Select>
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Colours"
                description="Blog-wide overrides. Leave a colour blank to inherit the website palette."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorInput
                    id="blog-color-primary-color"
                    label="Primary"
                    value={values.layout.primaryColor}
                    onChange={(v) => setLayout('primaryColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-secondary-color"
                    label="Secondary"
                    value={values.layout.secondaryColor}
                    onChange={(v) => setLayout('secondaryColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-background-color"
                    label="Background"
                    value={values.layout.backgroundColor}
                    onChange={(v) => setLayout('backgroundColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-heading-color"
                    label="Headings"
                    value={values.layout.headingColor}
                    onChange={(v) => setLayout('headingColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-text-color"
                    label="Body text"
                    value={values.layout.textColor}
                    onChange={(v) => setLayout('textColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-link-color"
                    label="Links"
                    value={values.layout.linkColor}
                    onChange={(v) => setLayout('linkColor', v as string)}
                  />
                </div>
              </SettingsSection>
            </TabPanel>

            <TabPanel id="cards" active={tab}>
              <SettingsSection
                title="What a card shows"
                description="Applies to every article grid, the sidebar lists and related articles. A section can override any of these for itself."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['showImage', 'Image'],
                      ['showCategory', 'Category'],
                      ['showExcerpt', 'Excerpt'],
                      ['showAuthor', 'Author'],
                      ['showAuthorImage', 'Author photo'],
                      ['showDate', 'Publish date'],
                      ['showUpdatedDate', 'Updated date'],
                      ['showReadTime', 'Read time'],
                      ['showTags', 'Tags'],
                      ['showCta', 'Read-more button'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="rounded-lg border border-hairline p-3">
                      <Switch
                        checked={values.card[key]}
                        onChange={(next) => setCard(key, next)}
                        label={label}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Button label" htmlFor="card-cta-label">
                    <Input
                      id="card-cta-label"
                      value={values.card.ctaLabel}
                      onChange={(e) => setCard('ctaLabel', e.target.value)}
                    />
                  </Field>
                  <Field label="Excerpt lines" htmlFor="card-excerpt-lines">
                    <Input
                      id="card-excerpt-lines"
                      type="number"
                      min={1}
                      max={8}
                      value={values.card.excerptLines}
                      onChange={(e) => setCard('excerptLines', Number(e.target.value) || 3)}
                    />
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection title="Card box" description="Border, corners, shadow and spacing.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorInput
                    id="blog-color-background"
                    label="Background"
                    value={values.card.background}
                    onChange={(v) => setCard('background', v as string)}
                  />
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.card.borderEnabled}
                      onChange={(next) => setCard('borderEnabled', next)}
                      label="Border"
                    />
                  </div>
                  <ColorInput
                    id="blog-color-border-color"
                    label="Border colour"
                    value={values.card.borderColor}
                    onChange={(v) => setCard('borderColor', v as string)}
                  />
                  <Field label="Border width">
                    <UnitInput
                      value={values.card.borderWidth}
                      aria-label="Border width"
                      onChange={(v) => setCard('borderWidth', v)}
                    />
                  </Field>
                  <Field label="Corner radius">
                    <UnitInput
                      value={values.card.radius}
                      aria-label="Corner radius"
                      onChange={(v) => setCard('radius', v)}
                    />
                  </Field>
                  <Field label="Padding">
                    <UnitInput
                      value={values.card.padding}
                      aria-label="Padding"
                      onChange={(v) => setCard('padding', v)}
                    />
                  </Field>
                  <Field label="Shadow" htmlFor="card-shadow">
                    <Select
                      id="card-shadow"
                      value={values.card.shadow}
                      onChange={(e) => setCard('shadow', e.target.value as BlogCardSettings['shadow'])}
                    >
                      {SHADOWS.map((shadow) => (
                        <option key={shadow} value={shadow}>
                          {shadow === 'none' ? 'None' : shadow.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Hover effect" htmlFor="card-hover">
                    <Select
                      id="card-hover"
                      value={values.card.hoverEffect}
                      onChange={(e) =>
                        setCard('hoverEffect', e.target.value as BlogCardSettings['hoverEffect'])
                      }
                    >
                      <option value="none">None</option>
                      <option value="shadow">Deepen the shadow</option>
                      <option value="lift">Lift the card</option>
                      <option value="zoom">Zoom the image</option>
                    </Select>
                  </Field>
                  <Field label="Grid gap">
                    <UnitInput
                      value={values.card.gridGap}
                      aria-label="Grid gap"
                      onChange={(v) => setCard('gridGap', v)}
                    />
                  </Field>
                  <Field label="Row gap">
                    <UnitInput
                      value={values.card.rowGap}
                      aria-label="Row gap"
                      onChange={(v) => setCard('rowGap', v)}
                    />
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection title="Card image" description="Shape and size of the thumbnail.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ratio" htmlFor="card-ratio">
                    <Select
                      id="card-ratio"
                      value={values.card.imageRatio}
                      onChange={(e) =>
                        setCard('imageRatio', e.target.value as BlogCardSettings['imageRatio'])
                      }
                    >
                      {IMAGE_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio === 'auto' ? 'Original' : ratio.replace('/', ':')}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Fixed height" hint="Optional. Overrides the ratio.">
                    <UnitInput
                      value={values.card.imageHeight}
                      aria-label="Image height"
                      onChange={(v) => setCard('imageHeight', v)}
                    />
                  </Field>
                  <Field label="Image corner radius">
                    <UnitInput
                      value={values.card.imageRadius}
                      aria-label="Image corner radius"
                      onChange={(v) => setCard('imageRadius', v)}
                    />
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection title="Card type" description="Sizes and colours inside the card.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title size">
                    <UnitInput
                      value={values.card.titleSize}
                      aria-label="Title size"
                      onChange={(v) => setCard('titleSize', v)}
                    />
                  </Field>
                  <Field label="Title weight" htmlFor="card-title-weight">
                    <Select
                      id="card-title-weight"
                      value={values.card.titleWeight}
                      onChange={(e) =>
                        setCard('titleWeight', e.target.value as BlogCardSettings['titleWeight'])
                      }
                    >
                      {(['400', '500', '600', '700', '800'] as const).map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ColorInput
                    id="blog-color-title-color"
                    label="Title colour"
                    value={values.card.titleColor}
                    onChange={(v) => setCard('titleColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-excerpt-color"
                    label="Excerpt colour"
                    value={values.card.excerptColor}
                    onChange={(v) => setCard('excerptColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-meta-color"
                    label="Meta colour"
                    value={values.card.metaColor}
                    onChange={(v) => setCard('metaColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-category-color"
                    label="Category colour"
                    value={values.card.categoryColor}
                    onChange={(v) => setCard('categoryColor', v as string)}
                  />
                  <ColorInput
                    id="blog-color-category-background"
                    label="Category background"
                    value={values.card.categoryBackground}
                    onChange={(v) => setCard('categoryBackground', v as string)}
                  />
                  <ColorInput
                    id="blog-color-cta-color"
                    label="Button colour"
                    value={values.card.ctaColor}
                    onChange={(v) => setCard('ctaColor', v as string)}
                  />
                </div>
              </SettingsSection>
            </TabPanel>

            <TabPanel id="article" active={tab}>
              <SettingsSection
                title="Article and sidebar"
                description="How the article column and its sidebar share the page. The article width adjusts automatically."
              >
                <div className="rounded-lg border border-hairline p-3">
                  <Switch
                    checked={values.layout.sidebarEnabled}
                    onChange={(next) => setLayout('sidebarEnabled', next)}
                    label="Show a sidebar"
                    hint="Off gives every article the full column width."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Sidebar position" htmlFor="sidebar-position">
                    <Select
                      id="sidebar-position"
                      value={values.layout.sidebarPosition}
                      onChange={(e) =>
                        setLayout('sidebarPosition', e.target.value as 'left' | 'right')
                      }
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </Select>
                  </Field>
                  <Field label="Sidebar width" htmlFor="sidebar-width">
                    <Select
                      id="sidebar-width"
                      value={
                        SIDEBAR_WIDTHS.includes(
                          values.layout.sidebarWidth as (typeof SIDEBAR_WIDTHS)[number],
                        )
                          ? values.layout.sidebarWidth
                          : 'custom'
                      }
                      onChange={(e) => {
                        if (e.target.value !== 'custom') setLayout('sidebarWidth', e.target.value);
                      }}
                    >
                      {SIDEBAR_WIDTHS.map((width) => (
                        <option key={width} value={width}>
                          {width}
                        </option>
                      ))}
                      <option value="custom">Custom…</option>
                    </Select>
                  </Field>
                  <Field label="Custom sidebar width" hint="Any CSS length, e.g. 320px or 28%.">
                    <UnitInput
                      value={values.layout.sidebarWidth}
                      aria-label="Custom sidebar width"
                      onChange={(v) => setLayout('sidebarWidth', v)}
                    />
                  </Field>
                  <Field label="Gap between them">
                    <UnitInput
                      value={values.layout.sidebarGap}
                      aria-label="Gap between article and sidebar"
                      onChange={(v) => setLayout('sidebarGap', v)}
                    />
                  </Field>
                  <Field label="Maximum article width" hint="Blank fills the remaining column.">
                    <UnitInput
                      value={values.layout.articleWidth}
                      aria-label="Maximum article width"
                      onChange={(v) => setLayout('articleWidth', v)}
                    />
                  </Field>
                  <Field label="Sticky offset" hint="Distance from the top when the sidebar sticks.">
                    <UnitInput
                      value={values.layout.stickyOffset}
                      aria-label="Sticky offset"
                      onChange={(v) => setLayout('stickyOffset', v)}
                    />
                  </Field>
                  <Field label="On mobile, the sidebar" htmlFor="mobile-sidebar">
                    <Select
                      id="mobile-sidebar"
                      value={values.layout.mobileSidebar}
                      onChange={(e) =>
                        setLayout(
                          'mobileSidebar',
                          e.target.value as (typeof MOBILE_SIDEBAR)[number],
                        )
                      }
                    >
                      <option value="below">Sits below everything</option>
                      <option value="aboveRelated">Sits above the related articles</option>
                      <option value="hidden">Is hidden</option>
                    </Select>
                  </Field>
                </div>

                <div className="rounded-lg border border-hairline p-3">
                  <Switch
                    checked={values.layout.sidebarSticky}
                    onChange={(next) => setLayout('sidebarSticky', next)}
                    label="Sticky sidebar"
                    hint="The sidebar follows the reader down long articles."
                  />
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Table of contents"
                description="Generated from the article's H2 and H3 headings."
              >
                <div className="rounded-lg border border-hairline p-3">
                  <Switch
                    checked={values.layout.tocEnabled}
                    onChange={(next) => setLayout('tocEnabled', next)}
                    label="Show a table of contents"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Position" htmlFor="toc-position">
                    <Select
                      id="toc-position"
                      value={values.layout.tocPosition}
                      onChange={(e) =>
                        setLayout('tocPosition', e.target.value as 'article' | 'sidebar')
                      }
                    >
                      <option value="article">Top of the article</option>
                      <option value="sidebar">In the sidebar</option>
                    </Select>
                  </Field>
                  <Field label="Heading" htmlFor="toc-heading">
                    <Input
                      id="toc-heading"
                      value={values.layout.tocHeading}
                      onChange={(e) => setLayout('tocHeading', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.layout.tocCollapsible}
                      onChange={(next) => setLayout('tocCollapsible', next)}
                      label="Collapsible"
                    />
                  </div>
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.layout.tocOpenByDefault}
                      onChange={(next) => setLayout('tocOpenByDefault', next)}
                      label="Open by default"
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Around the article"
                description="Defaults for every article. Each post can override them individually."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.layout.authorBoxEnabled}
                      onChange={(next) => setLayout('authorBoxEnabled', next)}
                      label="Author box"
                    />
                  </div>
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.layout.relatedEnabled}
                      onChange={(next) => setLayout('relatedEnabled', next)}
                      label="Related articles"
                    />
                  </div>
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.layout.prevNextEnabled}
                      onChange={(next) => setLayout('prevNextEnabled', next)}
                      label="Previous / next links"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Related heading" htmlFor="related-heading">
                    <Input
                      id="related-heading"
                      value={values.layout.relatedHeading}
                      onChange={(e) => setLayout('relatedHeading', e.target.value)}
                    />
                  </Field>
                  <Field label="How many related articles" htmlFor="related-count">
                    <Input
                      id="related-count"
                      type="number"
                      min={1}
                      max={12}
                      value={values.layout.relatedCount}
                      onChange={(e) => setLayout('relatedCount', Number(e.target.value) || 3)}
                    />
                  </Field>
                  <Field label="Related columns" htmlFor="related-columns">
                    <Input
                      id="related-columns"
                      type="number"
                      min={1}
                      max={4}
                      value={values.layout.relatedColumns}
                      onChange={(e) => setLayout('relatedColumns', Number(e.target.value) || 3)}
                    />
                  </Field>
                </div>
              </SettingsSection>
            </TabPanel>

            <TabPanel id="sharing" active={tab}>
              <SettingsSection
                title="Social sharing"
                description="Plain share links — no third-party scripts are loaded onto the article."
              >
                <div className="rounded-lg border border-hairline p-3">
                  <Switch
                    checked={values.share.enabled}
                    onChange={(next) => setShare('enabled', next)}
                    label="Offer sharing on articles"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Heading" htmlFor="share-heading">
                    <Input
                      id="share-heading"
                      value={values.share.heading}
                      onChange={(e) => setShare('heading', e.target.value)}
                    />
                  </Field>
                  <Field label="Position" htmlFor="share-position">
                    <Select
                      id="share-position"
                      value={values.share.position}
                      onChange={(e) =>
                        setShare('position', e.target.value as BlogShareSettings['position'])
                      }
                    >
                      <option value="top">Above the article</option>
                      <option value="bottom">Below the article</option>
                      <option value="both">Both</option>
                      <option value="floating">Floating beside the article</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SHARE_NETWORKS.map((network) => (
                    <div key={network} className="rounded-lg border border-hairline p-3">
                      <Switch
                        checked={values.share[network]}
                        onChange={(next) => setShare(network, next)}
                        label={SHARE_NETWORK_LABELS[network]}
                      />
                    </div>
                  ))}
                </div>
              </SettingsSection>
            </TabPanel>

            <TabPanel id="typography" active={tab}>
              <SettingsSection
                title="Blog typography"
                description="Overrides layered on the website's global fonts. Blank inherits — the font families themselves stay under Settings → Website design."
              >
                <div className="space-y-3">
                  {TYPE_ROLES.map((role) => (
                    <details key={role} className="rounded-lg border border-hairline">
                      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-content marker:content-['']">
                        {TYPE_ROLE_LABELS[role]}
                      </summary>
                      <div className="grid gap-4 border-t border-hairline p-3 sm:grid-cols-2">
                        <Field label="Font size">
                          <UnitInput
                            value={values.typography[role].size}
                            aria-label={`${TYPE_ROLE_LABELS[role]} size`}
                            onChange={(v) => setType(role, 'size', v)}
                          />
                        </Field>
                        <Field label="Weight" htmlFor={`type-${role}-weight`}>
                          <Select
                            id={`type-${role}-weight`}
                            value={values.typography[role].weight}
                            onChange={(e) => setType(role, 'weight', e.target.value)}
                          >
                            <option value="">Inherit</option>
                            {(['300', '400', '500', '600', '700', '800', '900'] as const).map(
                              (weight) => (
                                <option key={weight} value={weight}>
                                  {weight}
                                </option>
                              ),
                            )}
                          </Select>
                        </Field>
                        <Field label="Line height" htmlFor={`type-${role}-lh`} hint="e.g. 1.4">
                          <Input
                            id={`type-${role}-lh`}
                            value={values.typography[role].lineHeight}
                            onChange={(e) => setType(role, 'lineHeight', e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Letter spacing"
                          htmlFor={`type-${role}-ls`}
                          hint="e.g. -0.02em"
                        >
                          <Input
                            id={`type-${role}-ls`}
                            value={values.typography[role].letterSpacing}
                            onChange={(e) => setType(role, 'letterSpacing', e.target.value)}
                          />
                        </Field>
                      </div>
                    </details>
                  ))}
                </div>
              </SettingsSection>
            </TabPanel>

            <TabPanel id="seo" active={tab}>
              <SettingsSection
                title="Blog archive SEO"
                description="Metadata for /blog itself. Individual articles keep their own SEO fields."
              >
                <Field label="SEO title" htmlFor="blog-seo-title">
                  <Input
                    id="blog-seo-title"
                    value={values.seoTitle ?? ''}
                    placeholder="Blog"
                    onChange={(e) => setTop('seoTitle', e.target.value)}
                  />
                </Field>
                <Field label="Meta description" htmlFor="blog-seo-description">
                  <Textarea
                    id="blog-seo-description"
                    rows={3}
                    value={values.seoDescription ?? ''}
                    onChange={(e) => setTop('seoDescription', e.target.value)}
                  />
                </Field>
                <Field label="Canonical URL" htmlFor="blog-canonical">
                  <Input
                    id="blog-canonical"
                    value={values.canonicalUrl ?? ''}
                    onChange={(e) => setTop('canonicalUrl', e.target.value)}
                  />
                </Field>
                <Field label="Open Graph title" htmlFor="blog-og-title">
                  <Input
                    id="blog-og-title"
                    value={values.ogTitle ?? ''}
                    onChange={(e) => setTop('ogTitle', e.target.value)}
                  />
                </Field>
                <Field label="Open Graph description" htmlFor="blog-og-description">
                  <Textarea
                    id="blog-og-description"
                    rows={2}
                    value={values.ogDescription ?? ''}
                    onChange={(e) => setTop('ogDescription', e.target.value)}
                  />
                </Field>
                <Field label="Social share image">
                  <MediaPicker
                    value={values.ogImageId}
                    onChange={(id) => setTop('ogImageId', id)}
                    label="Blog OG image"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.noIndex}
                      onChange={(next) => setTop('noIndex', next)}
                      label="Hide the blog archive from search engines"
                    />
                  </div>
                  <div className="rounded-lg border border-hairline p-3">
                    <Switch
                      checked={values.noFollow}
                      onChange={(next) => setTop('noFollow', next)}
                      label="Do not follow links from the archive"
                    />
                  </div>
                </div>
              </SettingsSection>
            </TabPanel>
          </fieldset>
        </CardBody>

        {canEdit ? (
          <div className="flex items-center justify-between gap-2 border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
            <SaveStateIndicator state={state} />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setValues({ ...DEFAULT_BLOG_SETTINGS, ogImageId: null });
                  setState('dirty');
                }}
              >
                Reset to defaults
              </Button>
              <Button onClick={save} disabled={!dirty}>
                {state === 'saving' ? 'Saving…' : 'Save blog design'}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

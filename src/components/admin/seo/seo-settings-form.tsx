'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { saveSeoSettings } from '@/lib/actions/seo';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Textarea, Select, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';

export type SeoSettingsValues = {
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  defaultOgImageUrl: string;
  twitterHandle: string;
  organizationName: string;
  organizationLogoUrl: string;
  organizationType: string;
  googleSiteVerification: string;
  bingSiteVerification: string;
  robotsTxtExtra: string;
  sitemapEnabled: boolean;
  noIndexSite: boolean;
};

const ORGANIZATION_TYPES = [
  'Organization',
  'Corporation',
  'LocalBusiness',
  'ProfessionalService',
  'OnlineBusiness',
];

export function SeoSettingsForm({
  initial,
  canEdit,
}: {
  initial: SeoSettingsValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);

  const set = <K extends keyof SeoSettingsValues>(key: K, value: SeoSettingsValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));

    const result = await saveSeoSettings(data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  const preview = values.titleTemplate.includes('%s')
    ? values.titleTemplate.replace('%s', 'Pricing')
    : values.titleTemplate;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {values.noIndexSite ? (
        <Alert tone="danger" title="The whole site is hidden from search engines">
          robots.txt currently disallows everything and every page carries a noindex tag. Turn this off
          before launch.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Defaults"
          description="Used whenever a page, product or post has no SEO values of its own."
        />
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <Field label="Default title" htmlFor="seo-title" required error={errors.defaultTitle}>
              <Input
                id="seo-title"
                value={values.defaultTitle}
                onChange={(e) => set('defaultTitle', e.target.value)}
              />
            </Field>

            <Field
              label="Title template"
              htmlFor="seo-template"
              required
              error={errors.titleTemplate}
              hint={`%s is replaced by the page title. Preview: “${preview}”`}
            >
              <Input
                id="seo-template"
                value={values.titleTemplate}
                onChange={(e) => set('titleTemplate', e.target.value)}
                placeholder="%s | Acme"
              />
            </Field>

            <Field
              label="Default meta description"
              htmlFor="seo-description"
              hint={`${values.defaultDescription.length} characters. Aim for 140–160.`}
            >
              <Textarea
                id="seo-description"
                rows={3}
                value={values.defaultDescription}
                onChange={(e) => set('defaultDescription', e.target.value)}
              />
            </Field>

            <Field
              label="Default social share image URL"
              htmlFor="seo-og"
              hint="Recommended 1200×630. Upload it in Media and paste the URL here."
            >
              <Input
                id="seo-og"
                value={values.defaultOgImageUrl}
                onChange={(e) => set('defaultOgImageUrl', e.target.value)}
              />
            </Field>

            <Field label="X / Twitter handle" htmlFor="seo-twitter" hint="Including the @.">
              <Input
                id="seo-twitter"
                value={values.twitterHandle}
                placeholder="@acme"
                onChange={(e) => set('twitterHandle', e.target.value)}
              />
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Organisation"
          description="Emitted as Organization structured data on every page."
        />
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation name" htmlFor="seo-org" required error={errors.organizationName}>
                <Input
                  id="seo-org"
                  value={values.organizationName}
                  onChange={(e) => set('organizationName', e.target.value)}
                />
              </Field>
              <Field label="Schema type" htmlFor="seo-org-type">
                <Select
                  id="seo-org-type"
                  value={values.organizationType}
                  onChange={(e) => set('organizationType', e.target.value)}
                >
                  {ORGANIZATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Logo URL" htmlFor="seo-org-logo">
              <Input
                id="seo-org-logo"
                value={values.organizationLogoUrl}
                onChange={(e) => set('organizationLogoUrl', e.target.value)}
              />
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Search engines" description="Verification and crawl control." />
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Google verification code"
                htmlFor="seo-google"
                hint="The content value from the meta tag Search Console gives you."
              >
                <Input
                  id="seo-google"
                  value={values.googleSiteVerification}
                  onChange={(e) => set('googleSiteVerification', e.target.value)}
                />
              </Field>
              <Field label="Bing verification code" htmlFor="seo-bing">
                <Input
                  id="seo-bing"
                  value={values.bingSiteVerification}
                  onChange={(e) => set('bingSiteVerification', e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Extra paths to block from crawlers"
              htmlFor="seo-robots"
              hint="One path per line, each starting with /. They are added to robots.txt alongside the built-in rules."
            >
              <Textarea
                id="seo-robots"
                rows={4}
                value={values.robotsTxtExtra}
                onChange={(e) => set('robotsTxtExtra', e.target.value)}
                placeholder={'/internal/\n/staging-preview/'}
                className="font-mono text-xs"
              />
            </Field>

            <div className="space-y-3 rounded-lg border border-hairline p-4">
              <Switch
                checked={values.sitemapEnabled}
                onChange={(next) => set('sitemapEnabled', next)}
                label="Publish sitemap.xml"
                hint="Lists every published page, product, post and category."
              />
              <Switch
                checked={values.noIndexSite}
                onChange={(next) => set('noIndexSite', next)}
                label="Hide the entire site from search engines"
                hint="Use while the site is being built. Overrides every per-page setting."
              />
            </div>
          </fieldset>
        </CardBody>

        {canEdit ? (
          <div className="flex justify-end border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save SEO settings'
              )}
            </Button>
          </div>
        ) : null}
      </Card>
    </form>
  );
}

'use client';

import * as React from 'react';
import { Copy, Check, RotateCcw, ExternalLink, Link2 } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  buildCampaignUrl,
  normaliseUtmValue,
  EMPTY_UTM,
  UTM_PRESETS,
  type UtmValues,
} from '@/lib/marketing/utm';
import { cn } from '@/lib/utils/cn';

export type DestinationOption = { group: string; label: string; url: string };

/**
 * Campaign URL generator.
 *
 * Everything happens in the browser — there is nothing to save, so there is no
 * server action and no new model. The link it produces is read by the
 * attribution middleware that already exists, which is why the field names are
 * fixed rather than configurable.
 */
export function CampaignBuilder({
  destinations,
  origin,
}: {
  destinations: DestinationOption[];
  origin: string;
}) {
  const { toast } = useToast();
  const [destination, setDestination] = React.useState(destinations[0]?.url ?? origin);
  const [customDestination, setCustomDestination] = React.useState('');
  const [useCustom, setUseCustom] = React.useState(false);
  const [values, setValues] = React.useState<UtmValues>({ ...EMPTY_UTM });
  const [copied, setCopied] = React.useState(false);

  const set = (key: keyof UtmValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const target = useCustom ? customDestination : destination;
  const result = buildCampaignUrl(target, values);

  const applyPreset = (id: string) => {
    const preset = UTM_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    setValues((current) => ({ ...current, ...preset.values }));
  };

  const reset = () => {
    setValues({ ...EMPTY_UTM });
    setUseCustom(false);
    setCustomDestination('');
    setDestination(destinations[0]?.url ?? origin);
    setCopied(false);
  };

  const copy = async () => {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast('Campaign URL copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy — select the URL and copy it manually.', 'error');
    }
  };

  const groups = Array.from(new Set(destinations.map((option) => option.group)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Start from a channel"
          description="Fills in the source and medium. You can change anything afterwards."
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {UTM_PRESETS.map((preset) => {
              const active =
                normaliseUtmValue(values.source) === preset.values.source &&
                normaliseUtmValue(values.medium) === preset.values.medium;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  aria-pressed={active}
                  title={preset.hint}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
                    active
                      ? 'border-brand bg-brand/[0.06] font-medium text-brand'
                      : 'border-hairline text-content hover:bg-muted/[0.06]',
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            Not listed? Type your own source and medium below — presets are a shortcut, not a limit.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Campaign details" />
        <CardBody className="space-y-4">
          <Field
            label="Destination page"
            htmlFor="utm-destination"
            hint="Where the link should land."
            required
          >
            {useCustom ? (
              <Input
                id="utm-destination"
                type="url"
                value={customDestination}
                placeholder={`${origin}/any-page`}
                onChange={(event) => setCustomDestination(event.target.value)}
              />
            ) : (
              <Select
                id="utm-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                {groups.map((group) => (
                  <optgroup key={group} label={group}>
                    {destinations
                      .filter((option) => option.group === group)
                      .map((option) => (
                        <option key={option.url} value={option.url}>
                          {option.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(event) => setUseCustom(event.target.checked)}
              className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand"
            />
            Use a different URL
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Source"
              htmlFor="utm-source"
              hint="Where the visit comes from — google, linkedin, newsletter."
              required
            >
              <Input
                id="utm-source"
                value={values.source}
                placeholder="google"
                onChange={(event) => set('source', event.target.value)}
              />
            </Field>

            <Field
              label="Medium"
              htmlFor="utm-medium"
              hint="What kind of link it is — cpc, email, paid_social."
              required
            >
              <Input
                id="utm-medium"
                value={values.medium}
                placeholder="cpc"
                onChange={(event) => set('medium', event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Campaign name"
            htmlFor="utm-campaign"
            hint="How this campaign will be grouped in your reports."
            required
          >
            <Input
              id="utm-campaign"
              value={values.campaign}
              placeholder="dropbox_business"
              onChange={(event) => set('campaign', event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Term" htmlFor="utm-term" hint="Optional. Keyword or ad group.">
              <Input
                id="utm-term"
                value={values.term}
                placeholder="cloud_storage"
                onChange={(event) => set('term', event.target.value)}
              />
            </Field>

            <Field
              label="Content"
              htmlFor="utm-content"
              hint="Optional. Which creative or placement, e.g. hero_cta."
            >
              <Input
                id="utm-content"
                value={values.content}
                placeholder="hero_cta"
                onChange={(event) => set('content', event.target.value)}
              />
            </Field>
          </div>

          <p className="text-xs text-muted">
            Values are lowercased and spaces become underscores, so “Summer Sale” and “summer sale”
            are reported as one campaign rather than two.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Generated URL" description="Paste this into your ad, email or post." />
        <CardBody className="space-y-3">
          {result.ok ? (
            <>
              <div className="scroll-x rounded-lg border border-hairline bg-muted/[0.04] p-3">
                <code className="whitespace-pre-wrap break-all font-mono text-sm text-content">
                  {result.url}
                </code>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={copy}>
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? 'Copied' : 'Copy URL'}
                </Button>
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset
                </Button>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-muted/[0.07] hover:text-content"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Test link
                </a>
              </div>

              <Alert tone="info">
                <span className="flex items-start gap-2">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    A visitor arriving on this link is recorded as their <strong>last touch</strong>
                    , and as their <strong>first touch</strong> if it is their first visit. The
                    attribution follows them through the site and is attached to whichever form they
                    eventually submit.
                  </span>
                </span>
              </Alert>
            </>
          ) : (
            <Alert tone="warning">{result.error}</Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

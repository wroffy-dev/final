import { AlertTriangle, Info } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import type { RobotsWarning } from '@/lib/seo/robots';
import { cn } from '@/lib/utils/cn';

/**
 * The robots.txt as it will actually be served.
 *
 * Produced by the same `compileRobots` the route handler calls, so this is not
 * an approximation of the file — it is the file. A preview built a second way
 * would eventually disagree with what crawlers get, which is the hardest kind
 * of SEO problem to notice.
 */
export function RobotsPreview({
  body,
  warnings,
  countryRules,
}: {
  body: string;
  warnings: RobotsWarning[];
  countryRules: Array<{ name: string; slug: string; lines: number; noIndex: boolean }>;
}) {
  const errors = warnings.filter((warning) => warning.level === 'error');

  return (
    <Card className="mt-5">
      <CardHeader
        title="robots.txt"
        description="One file, at the host root. Every market's rules are compiled into it — a market does not get a robots.txt of its own, because crawlers never fetch one."
      />
      <CardBody className="space-y-4">
        {errors.length > 0 ? (
          <div className="rounded-lg border border-red-500/30 bg-red-50 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {errors.length === 1 ? 'A rule was refused' : `${errors.length} rules were refused`}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-red-800">
              {errors.map((warning, index) => (
                <li key={index}>{warning.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings
          .filter((warning) => warning.level === 'warning')
          .map((warning, index) => (
            <p
              key={index}
              className="flex items-start gap-2 rounded-lg bg-muted/10 p-3 text-sm leading-relaxed text-muted"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {warning.message}
            </p>
          ))}

        {countryRules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <caption className="sr-only">Per-market crawler rules</caption>
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Market</th>
                  <th className="py-1.5 pr-3 font-medium">Prefix</th>
                  <th className="py-1.5 pr-3 font-medium">Rules</th>
                  <th className="py-1.5 font-medium">Indexing</th>
                </tr>
              </thead>
              <tbody>
                {countryRules.map((row) => (
                  <tr key={row.slug || 'root'} className="border-b border-hairline last:border-0">
                    <td className="py-1.5 pr-3 text-content">{row.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-muted">
                      /{row.slug || ''}
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{row.lines || '—'}</td>
                    <td className={cn('py-1.5', row.noIndex ? 'text-amber-700' : 'text-muted')}>
                      {row.noIndex ? 'noindex' : 'indexable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Rules are edited per market under Settings → Countries → a market → Crawler rules.
            </p>
          </div>
        ) : null}

        <pre className="overflow-x-auto rounded-lg border border-hairline bg-muted/[0.04] p-3 text-xs leading-relaxed text-content">
          <code>{body}</code>
        </pre>
      </CardBody>
    </Card>
  );
}

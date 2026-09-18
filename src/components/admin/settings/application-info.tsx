import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { appVersion, formatReleaseDate } from '@/lib/app-version';

/**
 * Read-only. What is actually running, and nothing an administrator can type.
 *
 * Every value is compiled into the build from `package.json`, so this panel
 * cannot disagree with the deployed artefact — which is the only property that
 * makes a version display worth having. There is deliberately no edit control:
 * a version someone can set by hand answers "what did somebody type?" rather
 * than "what is running?".
 */
export function ApplicationInfo({ siteName }: { siteName: string }) {
  const { version, releaseDate, buildCommit } = appVersion();

  return (
    <Card className="mt-6">
      <CardHeader
        title="Application information"
        description="The build currently running. These values come from the release itself and cannot be edited here."
      />
      <CardBody>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Row label="Application" value={siteName} />
          <Row
            label="Version"
            value={version === 'unknown' ? 'Not recorded in this build' : version}
            mono={version !== 'unknown'}
          />
          <Row label="Release date" value={formatReleaseDate(releaseDate)} />
          <Row
            label="Build"
            value={buildCommit ?? 'Not supplied by the builder'}
            mono={Boolean(buildCommit)}
          />
        </dl>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          This is the application version. It moves only when a new release is built and deployed —
          never when content, settings or a consent notice is edited, and never on a restart. The{' '}
          <strong className="font-medium text-content">consent notice version</strong> shown against
          a lead is a separate number that counts published wording. See VERSION_README.md.
        </p>
      </CardBody>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-1 text-sm text-content${mono ? ' font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

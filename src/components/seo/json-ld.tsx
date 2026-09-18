/**
 * Renders JSON-LD. The payload is built server-side from typed helpers, so it
 * never contains user-supplied markup — but "<" is still escaped defensively.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

import { serveStoredFile } from '@/lib/media/serve-file';

/** Public media. The handler and its traversal guard live in one place. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  return serveStoredFile(segments);
}

import 'server-only';
import { headers } from 'next/headers';
import { resolveClientIp, ipRetentionDays, type IpResolution } from '@/lib/privacy/client-ip';

/**
 * The client address, with the reason attached when there isn't one.
 *
 * The rule itself lives in lib/privacy/client-ip so it can be tested against
 * crafted header chains without a request. See that file for why a forwarded
 * header is only believed as far as the configured proxy count.
 */
export async function clientIpResolution(): Promise<IpResolution> {
  const h = await headers();
  return resolveClientIp((name) => h.get(name));
}

/**
 * Best-effort client IP.
 *
 * Returns null unless the address came from a hop the deployment trusts, so a
 * caller that only wants "an address or nothing" — rate limiting, an audit
 * line — cannot accidentally act on a spoofed one.
 */
export async function clientIp(): Promise<string | null> {
  return (await clientIpResolution()).ip;
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get('user-agent');
}

export async function requestContext(): Promise<{
  ip: string | null;
  ipStatus: IpResolution['status'];
  userAgent: string | null;
}> {
  const [resolution, ua] = await Promise.all([clientIpResolution(), userAgent()]);
  return { ip: resolution.ip, ipStatus: resolution.status, userAgent: ua };
}

export { ipRetentionDays };

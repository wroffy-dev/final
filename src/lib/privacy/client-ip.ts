import 'server-only';

/**
 * The visitor's IP address, or an honest reason there isn't one.
 *
 * `x-forwarded-for` is a request header, which means anybody can send it. When
 * a deployment sits behind a proxy the header is genuine, but only for the hops
 * the proxy itself appended — everything to the left of those was supplied by
 * the client and can say anything. Reading `split(',')[0]` therefore reads
 * whatever the visitor typed, which is the opposite of evidence.
 *
 * So the number of proxies in front of the app is configuration, not a guess:
 * `TRUSTED_PROXY_COUNT` says how many hops append to the chain, and the address
 * is taken that many places from the right. With none configured the forwarded
 * chain is not trusted at all and the status says so, rather than recording a
 * value that only looks like a fact.
 */

/** Why an address is, or is not, usable as evidence. */
export type IpResolution =
  | { status: 'RECORDED'; ip: string }
  | { status: 'UNTRUSTED'; ip: null }
  | { status: 'UNAVAILABLE'; ip: null };

const UNTRUSTED: IpResolution = { status: 'UNTRUSTED', ip: null };
const UNAVAILABLE: IpResolution = { status: 'UNAVAILABLE', ip: null };

/**
 * How many proxies append to `x-forwarded-for` before the app sees it.
 *
 * 0 (the default) means the app is reached directly and no forwarded header is
 * believed. Behind one reverse proxy — Traefik, Nginx, an Azure Container Apps
 * ingress — this is 1. Behind a CDN in front of that proxy it is 2.
 */
export function trustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXY_COUNT?.trim();
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  // A deployment is never behind ten proxies; a larger number is a typo, and
  // honouring it would reach past the start of the chain into client input.
  return Math.min(value, 10);
}

/**
 * A single header name whose value is the client address and cannot be spoofed
 * because the edge overwrites it — `cf-connecting-ip` on Cloudflare,
 * `true-client-ip` on Akamai. Set only when that edge is actually in front of
 * the app, because the header is otherwise just another thing a client can send.
 */
export function trustedIpHeader(): string | null {
  const raw = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  return raw || null;
}

/** IPv4 dotted quad, or IPv6 in any of its accepted spellings. */
export function isIpAddress(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;

  // IPv4, rejecting octets above 255 and leading zeros (which some resolvers
  // read as octal).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) {
    return candidate.split('.').every((octet) => {
      if (octet.length > 1 && octet.startsWith('0')) return false;
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }

  // IPv6, including the IPv4-mapped form and "::" compression.
  if (!/^[0-9a-f:.]+$/i.test(candidate)) return false;
  if (!candidate.includes(':')) return false;
  const doubleColons = candidate.match(/::/g);
  if (doubleColons && doubleColons.length > 1) return false;

  const mapped = /^(.*):(\d{1,3}(?:\.\d{1,3}){3})$/.exec(candidate);
  const head = mapped ? mapped[1] : candidate;
  if (mapped && !isIpAddress(mapped[2])) return false;

  const groups = head.split(':').filter((group, index, all) => {
    // "::1" and "1::" leave empty strings at the ends of the split; they are
    // the compression marker, not groups.
    if (group !== '') return true;
    return index !== 0 && index !== all.length - 1;
  });
  if (groups.some((group) => group !== '' && !/^[0-9a-f]{1,4}$/i.test(group))) return false;

  const filled = groups.filter((group) => group !== '').length;
  const limit = mapped ? 6 : 8;
  return candidate.includes('::') ? filled <= limit : filled === limit;
}

/**
 * Strips the port an IPv4 address sometimes arrives with, and the brackets an
 * IPv6 address wears when it does.
 */
function normalise(value: string): string {
  const candidate = value.trim();
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) return bracketed[1];
  // "1.2.3.4:5678" — but not "::1", which is all colons and no dots.
  if (candidate.includes('.') && candidate.includes(':')) return candidate.split(':')[0];
  return candidate;
}

/**
 * Resolves the client address from request headers under the configured trust.
 *
 * Takes a plain getter rather than `next/headers` so the rule can be tested
 * directly, which is the only way to be sure a spoofed chain is rejected.
 */
export function resolveClientIp(get: (name: string) => string | null | undefined): IpResolution {
  const trustedHeader = trustedIpHeader();
  if (trustedHeader) {
    const direct = get(trustedHeader);
    if (direct) {
      const value = normalise(direct.split(',')[0] ?? '');
      if (isIpAddress(value)) return { status: 'RECORDED', ip: value };
    }
    // Configured to read one header and it was absent or malformed: fall
    // through rather than quietly believing a different, unverified one.
  }

  const hops = trustedProxyCount();
  const forwarded = get('x-forwarded-for');

  if (hops === 0) {
    // Nothing in front of the app is trusted to have written the chain, so a
    // forwarded header present at all is client-supplied.
    return forwarded ? UNTRUSTED : UNAVAILABLE;
  }

  if (!forwarded) {
    // Configured for a proxy that did not forward anything. `x-real-ip` is set
    // by the same class of proxy and is a single value, so it cannot carry a
    // client-supplied prefix the way the chain can.
    const real = get('x-real-ip');
    if (real) {
      const value = normalise(real);
      if (isIpAddress(value)) return { status: 'RECORDED', ip: value };
    }
    return UNAVAILABLE;
  }

  const chain = forwarded
    .split(',')
    .map((entry) => normalise(entry))
    .filter(Boolean);

  // The right-most entry was appended by the proxy nearest the app; each hop
  // to the left was appended by the one before it. With `hops` trusted
  // proxies, the last address one of them wrote sits `hops` from the end.
  const index = chain.length - hops;
  if (index < 0) {
    // Fewer entries than configured hops: the request did not come through the
    // expected path, so nothing in the chain is the visitor.
    return UNTRUSTED;
  }

  const candidate = chain[index];
  if (!candidate || !isIpAddress(candidate)) return UNTRUSTED;
  return { status: 'RECORDED', ip: candidate };
}

/** How long an address may be kept, in days. Zero means "do not store one". */
export function ipRetentionDays(): number {
  const raw = process.env.IP_RETENTION_DAYS?.trim();
  if (!raw) return 365;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return 365;
  return value;
}

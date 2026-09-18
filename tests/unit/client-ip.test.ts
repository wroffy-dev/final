import { describe, it, expect, afterEach } from 'vitest';
import { resolveClientIp, isIpAddress } from '@/lib/privacy/client-ip';

/** Builds a header getter from a plain object. */
const headers = (map: Record<string, string>) => (name: string) => map[name.toLowerCase()] ?? null;

const original = { ...process.env };
afterEach(() => {
  process.env.TRUSTED_PROXY_COUNT = original.TRUSTED_PROXY_COUNT;
  process.env.TRUSTED_IP_HEADER = original.TRUSTED_IP_HEADER;
  delete process.env.TRUSTED_PROXY_COUNT;
  delete process.env.TRUSTED_IP_HEADER;
});

describe('isIpAddress', () => {
  it('accepts IPv4 and IPv6 in the forms a proxy actually sends', () => {
    for (const value of [
      '203.0.113.7',
      '10.0.0.1',
      '255.255.255.255',
      '2001:db8::1',
      '::1',
      'fe80::1ff:fe23:4567:890a',
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '::ffff:192.0.2.128',
    ]) {
      expect(isIpAddress(value), value).toBe(true);
    }
  });

  it('rejects things that only look like addresses', () => {
    for (const value of [
      '',
      'localhost',
      '999.1.1.1',
      '1.2.3',
      '1.2.3.4.5',
      '01.2.3.4', // leading zero reads as octal to some resolvers
      '2001:db8::1::2', // two compressions
      'not an ip',
      '<script>',
    ]) {
      expect(isIpAddress(value), value).toBe(false);
    }
  });
});

describe('resolveClientIp', () => {
  it('refuses a forwarded chain when no proxy is trusted', () => {
    // Nothing in front of the app is configured, so the header is something
    // the client sent and cannot be recorded as the visitor's address.
    delete process.env.TRUSTED_PROXY_COUNT;
    expect(resolveClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }))).toEqual({
      status: 'UNTRUSTED',
      ip: null,
    });
  });

  it('reports UNAVAILABLE rather than UNTRUSTED when no header arrived at all', () => {
    expect(resolveClientIp(headers({}))).toEqual({ status: 'UNAVAILABLE', ip: null });
  });

  it('takes the hop the configured proxy appended, not the left-most entry', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    // The client sent "1.1.1.1" itself; the single trusted proxy appended the
    // address it actually saw. Reading [0] would record the spoof.
    const result = resolveClientIp(
      headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }),
    );
    expect(result).toEqual({ status: 'RECORDED', ip: '203.0.113.7' });
  });

  it('walks back one more hop behind a CDN plus a proxy', () => {
    process.env.TRUSTED_PROXY_COUNT = '2';
    const result = resolveClientIp(
      headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7, 198.51.100.9' }),
    );
    expect(result).toEqual({ status: 'RECORDED', ip: '203.0.113.7' });
  });

  it('rejects a chain shorter than the configured hops', () => {
    process.env.TRUSTED_PROXY_COUNT = '2';
    // Only one entry where two trusted hops were expected: the request did not
    // arrive the configured way, so nothing in it is the visitor.
    expect(resolveClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }))).toEqual({
      status: 'UNTRUSTED',
      ip: null,
    });
  });

  it('rejects a hop that is not an address', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    expect(
      resolveClientIp(headers({ 'x-forwarded-for': '1.1.1.1, <script>alert(1)</script>' })),
    ).toEqual({ status: 'UNTRUSTED', ip: null });
  });

  it('falls back to x-real-ip only when a proxy is trusted', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    expect(resolveClientIp(headers({ 'x-real-ip': '203.0.113.7' }))).toEqual({
      status: 'RECORDED',
      ip: '203.0.113.7',
    });

    delete process.env.TRUSTED_PROXY_COUNT;
    expect(resolveClientIp(headers({ 'x-real-ip': '203.0.113.7' }))).toEqual({
      status: 'UNAVAILABLE',
      ip: null,
    });
  });

  it('reads an edge header when the deployment names one', () => {
    process.env.TRUSTED_IP_HEADER = 'cf-connecting-ip';
    expect(
      resolveClientIp(
        headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1' }),
      ),
    ).toEqual({ status: 'RECORDED', ip: '203.0.113.7' });
  });

  it('does not fall back to an untrusted chain when the named edge header is missing', () => {
    process.env.TRUSTED_IP_HEADER = 'cf-connecting-ip';
    expect(resolveClientIp(headers({ 'x-forwarded-for': '1.1.1.1' }))).toEqual({
      status: 'UNTRUSTED',
      ip: null,
    });
  });

  it('strips a port from IPv4 and brackets from IPv6', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    expect(resolveClientIp(headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7:51234' }))).toEqual({
      status: 'RECORDED',
      ip: '203.0.113.7',
    });
    expect(resolveClientIp(headers({ 'x-forwarded-for': '1.1.1.1, [2001:db8::1]:443' }))).toEqual({
      status: 'RECORDED',
      ip: '2001:db8::1',
    });
  });

  it('ignores a browser-supplied ip field entirely — there is no such input', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    // Whatever a page puts in a body field, the resolver only ever reads
    // headers, and only the trusted hop of those.
    expect(resolveClientIp(headers({ ip: '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toEqual(
      { status: 'RECORDED', ip: '203.0.113.7' },
    );
  });
});

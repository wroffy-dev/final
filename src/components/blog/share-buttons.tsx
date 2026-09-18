'use client';

import * as React from 'react';
import { Link2, Check, MessageCircle } from 'lucide-react';
import { LinkedInIcon, XIcon, FacebookIcon } from '@/components/ui/icons';
import type { ShareNetwork } from '@/lib/cms/blog-settings';
import { SHARE_NETWORK_LABELS } from '@/lib/cms/blog-settings';
import { cn } from '@/lib/utils/cn';

/**
 * Social sharing.
 *
 * Plain share links — no third-party script, no tracking pixel, nothing loaded
 * from another origin. "Copy link" is the only one that needs JavaScript, and
 * it falls back to selecting the URL when the clipboard API is unavailable.
 */

const ICONS: Record<ShareNetwork, React.ComponentType<{ className?: string }>> = {
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  x: XIcon,
  whatsapp: MessageCircle,
  copy: Link2,
};

function shareHref(network: ShareNetwork, url: string, title: string): string | null {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (network) {
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case 'whatsapp':
      return `https://wa.me/?text=${t}%20${u}`;
    default:
      return null;
  }
}

export function ShareButtons({
  url,
  title,
  networks,
  heading,
  style = 'icon',
  align = 'left',
  orientation = 'horizontal',
  className,
}: {
  url: string;
  title: string;
  networks: ShareNetwork[];
  heading?: string;
  style?: 'icon' | 'label' | 'button';
  align?: 'left' | 'center' | 'right';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, permission denied) — show the URL
      // so the visitor can copy it by hand rather than nothing happening.
      window.prompt('Copy this link', url);
    }
  }

  if (networks.length === 0) return null;

  return (
    <div
      className={cn(
        'blog-share flex flex-wrap items-center gap-2',
        orientation === 'vertical' && 'flex-col items-stretch',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
        className,
      )}
    >
      {heading ? <span className="blog-share__heading mr-1">{heading}</span> : null}

      {networks.map((network) => {
        const Icon = ICONS[network];
        const label = SHARE_NETWORK_LABELS[network];
        const shared = shareHref(network, url, title);
        const classes = cn(
          'blog-share__button inline-flex items-center justify-center gap-2',
          style === 'icon' && 'blog-share__button--icon',
          style === 'button' && 'blog-share__button--solid',
        );

        if (network === 'copy') {
          return (
            <button key={network} type="button" onClick={copy} className={classes} aria-label={label}>
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Icon className="h-4 w-4" aria-hidden="true" />
              )}
              {style !== 'icon' ? <span>{copied ? 'Copied' : label}</span> : null}
              <span className="sr-only" role="status">
                {copied ? 'Link copied' : ''}
              </span>
            </button>
          );
        }

        if (!shared) return null;

        return (
          <a
            key={network}
            href={shared}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={classes}
            aria-label={`Share on ${label}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {style !== 'icon' ? <span>{label}</span> : null}
          </a>
        );
      })}
    </div>
  );
}

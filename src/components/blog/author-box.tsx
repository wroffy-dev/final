import Image from 'next/image';
import { Globe } from 'lucide-react';
import { LinkedInIcon, XIcon } from '@/components/ui/icons';
import { initials } from '@/lib/utils/format';
import { safeUrl } from '@/lib/utils/sanitize';
import { cn } from '@/lib/utils/cn';

export type BlogAuthor = {
  name: string;
  image: string | null;
  jobTitle: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
};

/**
 * The author box.
 *
 * Reads the author's existing staff profile — photo, job title, bio and the
 * links added under My Profile — rather than duplicating employee details into
 * the blog. A staff member who updates their bio updates every article they
 * have written.
 */
export function AuthorBox({
  author,
  showImage = true,
  showJobTitle = true,
  showBio = true,
  showSocial = true,
  compact = false,
  className,
  style,
}: {
  author: BlogAuthor;
  showImage?: boolean;
  showJobTitle?: boolean;
  showBio?: boolean;
  showSocial?: boolean;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const socials = (
    [
      ['LinkedIn', author.linkedinUrl, LinkedInIcon],
      ['X', author.twitterUrl, XIcon],
      ['Website', author.websiteUrl, Globe],
    ] as const
  )
    .map(([label, url, Icon]) => ({ label, href: safeUrl(url), Icon }))
    .filter((item) => Boolean(item.href));

  const avatarSize = compact ? 44 : 64;

  return (
    <div
      className={cn('blog-author flex gap-4', compact && 'gap-3', className)}
      style={style}
    >
      {showImage ? (
        author.image ? (
          <Image
            src={author.image}
            alt=""
            width={avatarSize}
            height={avatarSize}
            className="shrink-0 rounded-full object-cover"
            style={{ width: avatarSize, height: avatarSize }}
          />
        ) : (
          <span
            className="flex shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand"
            style={{ width: avatarSize, height: avatarSize }}
            aria-hidden="true"
          >
            {initials(author.name)}
          </span>
        )
      ) : null}

      <div className="min-w-0">
        <p className="blog-author__name">{author.name}</p>
        {showJobTitle && author.jobTitle ? (
          <p className="blog-author__role">{author.jobTitle}</p>
        ) : null}
        {showBio && author.bio ? <p className="blog-author__bio mt-2">{author.bio}</p> : null}

        {showSocial && socials.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {socials.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  href={href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${author.name} on ${label}`}
                  className="blog-author__social inline-flex h-8 w-8 items-center justify-center rounded-full"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

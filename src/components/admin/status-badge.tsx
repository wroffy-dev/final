import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Star, Circle } from 'lucide-react';
import { LEAD_STATUS_LABELS } from '@/lib/crm/constants';

/**
 * One vocabulary for status across the whole admin.
 *
 * Every list, detail screen and card resolves its badge here, so "Published"
 * looks identical on pages, products and posts. Only statuses the models
 * actually store appear.
 */
const CONTENT: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  ARCHIVED: { label: 'Archived', tone: 'warning' },
};

const LEAD_TONES: Record<string, BadgeTone> = {
  NEW: 'brand',
  CONTACTED: 'info',
  QUALIFIED: 'purple',
  PROPOSAL: 'warning',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'danger',
  SPAM: 'neutral',
};

const CUSTOMER: Record<string, { label: string; tone: BadgeTone }> = {
  PROSPECT: { label: 'Prospect', tone: 'info' },
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  FORMER: { label: 'Former', tone: 'warning' },
};

const USER: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Invited', tone: 'info' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
};

/** Draft / Published / Scheduled / Archived — pages, products, posts. */
export function ContentStatusBadge({ status }: { status: string }) {
  const entry = CONTENT[status];
  return <Badge tone={entry?.tone ?? 'neutral'}>{entry?.label ?? status}</Badge>;
}

/** New / Contacted / Qualified / … — leads only. */
export function LeadStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={LEAD_TONES[status] ?? 'neutral'}>
      {LEAD_STATUS_LABELS[status as never] ?? status}
    </Badge>
  );
}

export function CustomerStatusBadge({ status }: { status: string }) {
  const entry = CUSTOMER[status];
  return <Badge tone={entry?.tone ?? 'neutral'}>{entry?.label ?? status}</Badge>;
}

export function UserStatusBadge({ status }: { status: string }) {
  const entry = USER[status];
  return <Badge tone={entry?.tone ?? 'neutral'}>{entry?.label ?? status}</Badge>;
}

/** Active / Inactive — forms, popups, redirects, lead magnets. */
export function ActiveBadge({
  active,
  activeLabel = 'Active',
  inactiveLabel = 'Inactive',
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <Badge tone={active ? 'success' : 'neutral'}>
      <Circle
        className={
          active
            ? 'h-2 w-2 fill-emerald-500 text-emerald-500'
            : 'h-2 w-2 fill-muted/50 text-muted/50'
        }
        aria-hidden="true"
      />
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

export function FeaturedBadge() {
  return (
    <Badge tone="brand">
      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
      Featured
    </Badge>
  );
}

import type { ComponentType, SVGProps } from 'react';
import {
  ArrowRight,
  Check,
  CalendarDays,
  Download,
  Mail,
  MessageSquare,
  Phone,
  Send,
  ShoppingCart,
  Sparkles,
  Ticket,
} from 'lucide-react';

/**
 * Icons a form's submit button may carry.
 *
 * A small, deliberately closed set rather than the whole Lucide library: the
 * admin picks from a dropdown, the key is validated on save, and only these
 * components ever reach the public bundle. Sharing the admin navigation's icon
 * map instead would both couple the public site to admin code and offer an
 * admin a list of icons ("kanban", "dashboard") that mean nothing on a button.
 */
const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  send: Send,
  'arrow-right': ArrowRight,
  check: Check,
  mail: Mail,
  phone: Phone,
  message: MessageSquare,
  calendar: CalendarDays,
  download: Download,
  cart: ShoppingCart,
  ticket: Ticket,
  sparkles: Sparkles,
};

/** Keys the admin picker offers, in the order it shows them. */
export const FORM_BUTTON_ICONS = Object.keys(ICONS);

export const FORM_BUTTON_ICON_LABELS: Record<string, string> = {
  send: 'Paper plane',
  'arrow-right': 'Arrow',
  check: 'Tick',
  mail: 'Envelope',
  phone: 'Phone',
  message: 'Speech bubble',
  calendar: 'Calendar',
  download: 'Download',
  cart: 'Shopping cart',
  ticket: 'Ticket',
  sparkles: 'Sparkles',
};

export function FormButtonIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden="true" />;
}

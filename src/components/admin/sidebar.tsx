'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { X, ChevronDown, PanelLeftClose, PanelLeftOpen, ExternalLink } from 'lucide-react';
import {
  visibleModules,
  isItemActive,
  type AdminNavItem,
  type AdminNavModule,
} from '@/lib/admin/nav';
import type { PermissionKey } from '@/lib/auth/permissions';
import { NavIcon } from './nav-icon';
import { cn } from '@/lib/utils/cn';

export type SidebarProps = {
  permissions: string[];
  isSuperAdmin: boolean;
  siteName: string;
  logoUrl: string | null;
  /** Preferred on the dark rail; falls back to the light logo. */
  logoDarkUrl?: string | null;
  /** Mobile drawer state. */
  open: boolean;
  onClose: () => void;
  /** Desktop icon-only state, owned by AdminShell so the topbar can offset. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/**
 * Admin navigation.
 *
 * Modules collapse and expand, the group owning the current route opens
 * automatically, and on desktop the whole rail can shrink to icons. Expanded
 * and collapsed state persist in localStorage so the admin's layout survives a
 * refresh.
 */
export function AdminSidebar({
  permissions,
  isSuperAdmin,
  siteName,
  logoUrl,
  logoDarkUrl,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const can = React.useCallback(
    (permission: PermissionKey) => isSuperAdmin || permissions.includes(permission),
    [isSuperAdmin, permissions],
  );

  const modules = React.useMemo(() => visibleModules(can), [can]);

  // The rail is dark, so the dark-surface logo from Website settings is the
  // right one here — the same preference the public footer already makes.
  const brandLogo = logoDarkUrl || logoUrl;

  const activeModuleId = React.useMemo(() => {
    for (const group of modules) {
      if (group.href && isItemActive(group, pathname, search)) return group.id;
      if (group.items.some((item) => isItemActive(item, pathname, search))) return group.id;
      // Detail routes (/admin/pages/abc) keep their group open too.
      if (group.items.some((item) => pathname.startsWith(`${item.href.split('?')[0]}/`)))
        return group.id;
    }
    return null;
  }, [modules, pathname, search]);

  const [manuallyClosed, setManuallyClosed] = React.useState<string[]>([]);
  const [extraOpen, setExtraOpen] = React.useState<string[]>([]);

  // Restore the admin's own expand/collapse choices.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem('admin:nav');
      if (!raw) return;
      const saved = JSON.parse(raw) as { closed?: string[]; open?: string[] };
      if (Array.isArray(saved.closed)) setManuallyClosed(saved.closed);
      if (Array.isArray(saved.open)) setExtraOpen(saved.open);
    } catch {
      // A corrupt or unavailable store simply means default expansion.
    }
  }, []);

  const persist = React.useCallback((closed: string[], opened: string[]) => {
    try {
      window.localStorage.setItem('admin:nav', JSON.stringify({ closed, open: opened }));
    } catch {
      // Private mode — the nav still works, it just will not remember.
    }
  }, []);

  const asideRef = React.useRef<HTMLElement | null>(null);

  /**
   * Drawer behaviour on small screens: Escape closes it, the page behind stops
   * scrolling, and focus moves into the drawer and returns to the trigger on
   * close. None of this applies to the docked desktop sidebar, which is part of
   * the page rather than an overlay.
   */
  React.useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Trap Tab inside the drawer while it covers the page.
      const focusable = asideRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    asideRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus?.();
    };
    // `onClose` is read through a ref rather than listed here. It arrives as an
    // inline arrow, so it changes identity on every render of the shell, and
    // with it in the dependencies this effect tore down and set up again on
    // each one — restoring focus to the trigger and then moving it to the
    // drawer's first link, while the drawer just sat there open. It belongs to
    // opening and closing, and now runs only for those.
  }, [open]);

  const isExpanded = (moduleId: string) =>
    moduleId === activeModuleId ? !manuallyClosed.includes(moduleId) : extraOpen.includes(moduleId);

  const toggleModule = (moduleId: string) => {
    if (moduleId === activeModuleId) {
      const next = manuallyClosed.includes(moduleId)
        ? manuallyClosed.filter((id) => id !== moduleId)
        : [...manuallyClosed, moduleId];
      setManuallyClosed(next);
      persist(next, extraOpen);
      return;
    }
    const next = extraOpen.includes(moduleId)
      ? extraOpen.filter((id) => id !== moduleId)
      : [...extraOpen, moduleId];
    setExtraOpen(next);
    persist(manuallyClosed, next);
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-backdrop bg-[rgb(var(--admin-header-bg))]/60 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        ref={asideRef}
        id="admin-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 flex flex-col border-r border-admin-nav/10 bg-admin-sidebar',
          'transition-[transform,width] duration-200 ease-out lg:translate-x-0',
          collapsed ? 'w-64 lg:w-[4.5rem]' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full',
          // One element, two roles: an off-canvas drawer on small screens (so
          // it must clear the backdrop and the top bar) and a docked column on
          // large ones (where it sits below the top bar).
          'z-drawer lg:z-sidebar',
        )}
        aria-label="Admin navigation"
        aria-modal={open ? true : undefined}
        role={open ? 'dialog' : undefined}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center gap-2 border-b border-admin-nav/10 px-4',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <Link
            href="/admin"
            className="admin-focus flex min-w-0 items-center gap-2.5 rounded-lg"
            aria-label={siteName}
          >
            {brandLogo && !collapsed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandLogo}
                alt={siteName}
                className="h-7 w-auto max-w-[9rem] object-contain"
              />
            ) : (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                  {siteName.charAt(0).toUpperCase()}
                </span>
                <span
                  className={cn(
                    'truncate font-heading text-sm font-bold text-admin-nav',
                    collapsed && 'lg:hidden',
                  )}
                >
                  {siteName}
                </span>
              </>
            )}
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="admin-focus ml-auto rounded-lg p-1.5 text-admin-nav/70 transition-colors hover:bg-admin-nav/[0.06] hover:text-admin-nav lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav
          className={cn(
            'admin-scroll flex-1 overflow-y-auto overflow-x-hidden py-3',
            collapsed ? 'lg:px-2 px-3' : 'px-3',
          )}
        >
          <ul className="space-y-1">
            {modules.map((group) => (
              <li key={group.id}>
                {group.href ? (
                  <SidebarLink
                    href={group.href}
                    label={group.label}
                    icon={group.icon}
                    active={isItemActive(group, pathname, search)}
                    collapsed={collapsed}
                    onNavigate={onClose}
                  />
                ) : (
                  <SidebarModule
                    group={group}
                    expanded={isExpanded(group.id)}
                    isActiveModule={group.id === activeModuleId}
                    collapsed={collapsed}
                    pathname={pathname}
                    search={search}
                    onToggle={() => toggleModule(group.id)}
                    onNavigate={onClose}
                  />
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className={cn('space-y-1 border-t border-admin-nav/10 p-3', collapsed && 'lg:px-2')}>
          <SidebarLink
            href="/"
            label="View website"
            icon="globe"
            collapsed={collapsed}
            external
            onNavigate={onClose}
          />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            className={cn(
              'admin-focus hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
              'text-admin-nav/70 transition-colors hover:bg-admin-nav/[0.06] hover:text-admin-nav lg:flex',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarModule({
  group,
  expanded,
  isActiveModule,
  collapsed,
  pathname,
  search,
  onToggle,
  onNavigate,
}: {
  group: AdminNavModule & { items: AdminNavItem[] };
  expanded: boolean;
  isActiveModule: boolean;
  collapsed: boolean;
  pathname: string;
  search: string;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const panelId = `nav-group-${group.id}`;

  /**
   * Where the icon-only fly-out is painted.
   *
   * The nav is a vertical scroller, and a scroll container clips on both axes —
   * so a fly-out positioned `absolute left-full` inside it is invisible, however
   * high its z-index. Taking it out of flow with `fixed` and measuring the row
   * is what lets it escape. Offsets are measured against the rail rather than
   * the viewport so the result is the same whether the containing block is the
   * transformed <aside> or the viewport itself.
   */
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = React.useState<{ top: number; left: number } | null>(null);

  const placeFlyout = React.useCallback(() => {
    const row = rowRef.current?.getBoundingClientRect();
    const rail = rowRef.current?.closest('aside')?.getBoundingClientRect();
    if (!row || !rail) return;
    setFlyout({ top: row.top - rail.top, left: rail.right - rail.left });
  }, []);

  // Icon-only mode has no room for a sub-list, so the group becomes a single
  // button that flies its children out on hover or focus.
  if (collapsed) {
    return (
      <div
        ref={rowRef}
        onMouseEnter={placeFlyout}
        onFocus={placeFlyout}
        className="group/group relative hidden lg:block"
      >
        <Link
          href={group.items[0]!.href}
          onClick={onNavigate}
          aria-label={group.label}
          title={group.label}
          className={cn(
            'admin-focus relative flex h-10 w-full items-center justify-center rounded-lg transition-colors',
            isActiveModule
              ? 'bg-admin-nav/[0.08] text-admin-nav'
              : 'text-admin-nav/70 hover:bg-admin-nav/[0.06] hover:text-admin-nav',
          )}
        >
          {/* The rail has no room for a label, so the active module is marked
              by the same brand bar the expanded nav uses. */}
          {isActiveModule ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
            />
          ) : null}
          <NavIcon name={group.icon} className="h-[1.15rem] w-[1.15rem]" />
        </Link>

        {/* The fly-out is navigation, not a popup — it stays on the rail's own
            surface so it reads as an extension of the sidebar. */}
        <div
          style={flyout ? { top: flyout.top, left: flyout.left } : undefined}
          className={cn(
            'pointer-events-none fixed z-tooltip ml-2 w-56 origin-left scale-95 opacity-0',
            'rounded-xl border border-admin-nav/10 bg-admin-sidebar p-1.5 shadow-xl ring-1 ring-black/20 transition',
            // Nothing to anchor to until the row has been measured.
            flyout ? 'block' : 'hidden',
            'group-hover/group:pointer-events-auto group-hover/group:scale-100 group-hover/group:opacity-100',
            'group-focus-within/group:pointer-events-auto group-focus-within/group:scale-100 group-focus-within/group:opacity-100',
          )}
        >
          <p className="px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-admin-nav/55">
            {group.label}
          </p>
          <ul>
            {group.items.map((item) => {
              const active = isItemActive(item, pathname, search);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'admin-focus block truncate rounded-lg px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-admin-nav/[0.08] font-medium text-admin-nav'
                        : 'text-admin-nav/70 hover:bg-admin-nav/[0.06] hover:text-admin-nav',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={cn(
          'admin-focus flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
          isActiveModule
            ? 'font-medium text-admin-nav'
            : 'text-admin-nav/80 hover:bg-admin-nav/[0.06] hover:text-admin-nav',
        )}
      >
        <NavIcon
          name={group.icon}
          className={cn(
            'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors',
            isActiveModule ? 'text-admin-nav' : 'text-admin-nav/55',
          )}
        />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-admin-nav/55 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        // Animating grid-template-rows keeps the transition smooth without
        // measuring the panel's height.
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <ul className="ml-[1.4rem] space-y-0.5 overflow-hidden border-l border-admin-nav/[0.12] pl-2.5">
          {group.items.map((item) => {
            const active = isItemActive(item, pathname, search);
            return (
              <li key={item.href} className={cn(!expanded && 'invisible')}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  tabIndex={expanded ? undefined : -1}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'admin-focus block truncate rounded-lg px-2.5 py-1.5 text-[0.8125rem] transition-colors',
                    active
                      ? 'bg-admin-nav/[0.08] font-medium text-admin-nav'
                      : 'text-admin-nav/70 hover:bg-admin-nav/[0.06] hover:text-admin-nav',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  collapsed,
  external,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
  collapsed: boolean;
  external?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={cn(
        'admin-focus relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-admin-nav/[0.08] font-medium text-admin-nav'
          : 'text-admin-nav/80 hover:bg-admin-nav/[0.06] hover:text-admin-nav',
        collapsed && 'lg:justify-center lg:px-0 lg:py-2.5',
      )}
    >
      {/* A brand bar as well as the lift in background, so "active" is not
          carried by colour alone. */}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
        />
      ) : null}
      <NavIcon
        name={icon}
        className={cn(
          'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors',
          active ? 'text-admin-nav' : 'text-admin-nav/55',
        )}
      />
      <span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span>
      {external && !collapsed ? (
        <ExternalLink
          className="ml-auto h-3.5 w-3.5 shrink-0 text-admin-nav/55"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash, Pencil } from 'lucide-react';
import { saveNavigation, deleteNavigation } from '@/lib/actions/navigation';
import { NavigationEditor, type EditorItem, type NavTargets } from './nav-editor';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export type MenuSummary = {
  id: string;
  name: string;
  slug: string;
  location: string;
  items: EditorItem[];
};

const LOCATION_LABELS: Record<string, string> = {
  HEADER: 'Header',
  FOOTER: 'Footer column',
  FOOTER_SECONDARY: 'Footer secondary',
  LEGAL: 'Legal links',
  MOBILE: 'Mobile only',
  SIDEBAR: 'Sidebar',
};

const BLANK = { id: '', name: '', location: 'HEADER' };

export function MenuManager({
  menus,
  targets,
  countryId,
  countryName,
  showCountry = false,
  canEdit,
}: {
  menus: MenuSummary[];
  targets: NavTargets;
  /** The market new menus are created in — the one selected in the topbar. */
  countryId: string;
  countryName: string;
  /** Names the market in the dialog. Hidden on a single-market installation. */
  showCountry?: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeId, setActiveId] = React.useState(menus[0]?.id ?? '');
  const [editing, setEditing] = React.useState<typeof BLANK | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<MenuSummary | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    if (!menus.some((m) => m.id === activeId)) setActiveId(menus[0]?.id ?? '');
  }, [menus, activeId]);

  const active = menus.find((m) => m.id === activeId) ?? null;

  async function saveMenu() {
    if (!editing) return;
    setPending(true);
    setErrors({});

    const data = new FormData();
    data.set('name', editing.name);
    data.set('location', editing.location);
    // Only read when creating: the action never moves an existing menu between
    // markets, and validates this id against the user's access either way.
    data.set('countryId', countryId);

    const result = await saveNavigation(editing.id || null, data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    if (!editing.id && result.data) setActiveId(result.data.id);
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div>
        <nav aria-label="Menus" className="rounded-xl border border-hairline bg-surface p-2">
          <ul className="space-y-0.5">
            {menus.map((menu) => (
              <li key={menu.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(menu.id)}
                  aria-current={menu.id === activeId ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    menu.id === activeId
                      ? 'bg-brand/10 font-medium text-brand'
                      : 'text-content hover:bg-muted/[0.07]',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{menu.name}</span>
                    <span className="block text-xs text-muted">
                      {LOCATION_LABELS[menu.location] ?? menu.location} · {menu.items.length} item(s)
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {canEdit ? (
            <div className="mt-2 border-t border-hairline pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setEditing({ ...BLANK })}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New menu
              </Button>
            </div>
          ) : null}
        </nav>

        {active && canEdit ? (
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setEditing({ id: active.id, name: active.name, location: active.location })
              }
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Rename
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(active)}>
              <Trash className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        {active ? (
          <NavigationEditor
            key={active.id}
            navigationId={active.id}
            menuName={active.name}
            initialItems={active.items}
            targets={targets}
            canEdit={canEdit}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-hairline px-6 py-16 text-center">
            <p className="text-sm text-muted">Create a menu to start building your navigation.</p>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Rename menu' : 'New menu'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveMenu} disabled={pending || !editing?.name.trim()}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save menu'
              )}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            {showCountry && !editing.id ? (
              <p className="rounded-lg bg-muted/[0.06] px-3 py-2 text-xs text-muted">
                This menu will belong to <strong className="text-content">{countryName}</strong>.
                Switch country in the top bar to build another market&rsquo;s menus.
              </p>
            ) : null}
            <Field label="Menu name" htmlFor="menu-name" required error={errors.name}>
              <Input
                id="menu-name"
                value={editing.name}
                placeholder="Main menu"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field
              label="Where it appears"
              htmlFor="menu-location"
              hint="Footer menus render as a column with the menu name as its heading."
            >
              <Select
                id="menu-location"
                value={editing.location}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              >
                {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setPending(true);
          const result = await deleteNavigation(confirmDelete.id);
          setPending(false);
          setConfirmDelete(null);
          if (!result.ok) {
            toast(result.error, 'error');
            return;
          }
          toast(result.message ?? 'Deleted.');
          router.refresh();
        }}
        title="Delete this menu?"
        message={
          confirmDelete
            ? `“${confirmDelete.name}” and its ${confirmDelete.items.length} item(s) will be removed from the site.`
            : ''
        }
        pending={pending}
      />
    </div>
  );
}

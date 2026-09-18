'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash, ChevronDown, CornerDownRight } from 'lucide-react';
import { saveNavigationItems } from '@/lib/actions/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export type NavTargets = {
  pages: Array<{ id: string; title: string; slug: string }>;
  products: Array<{ id: string; name: string }>;
  posts: Array<{ id: string; title: string }>;
  categories: Array<{ id: string; name: string }>;
};

export type EditorItem = {
  key: string;
  id: string | null;
  label: string;
  linkType: 'INTERNAL' | 'EXTERNAL' | 'PAGE' | 'PRODUCT' | 'BLOG_POST' | 'BLOG_CATEGORY';
  url: string;
  pageId: string;
  productId: string;
  blogPostId: string;
  blogCategoryId: string;
  description: string;
  openInNewTab: boolean;
  isHighlighted: boolean;
  isVisible: boolean;
  children: EditorItem[];
};

const LINK_TYPE_LABELS: Record<EditorItem['linkType'], string> = {
  INTERNAL: 'Internal path',
  EXTERNAL: 'External URL',
  PAGE: 'Page',
  PRODUCT: 'Product',
  BLOG_POST: 'Blog post',
  BLOG_CATEGORY: 'Blog category',
};

let counter = 0;
const nextKey = () => `n${(counter += 1)}-${Date.now()}`;

export function blankItem(): EditorItem {
  return {
    key: nextKey(),
    id: null,
    label: 'New link',
    linkType: 'INTERNAL',
    url: '/',
    pageId: '',
    productId: '',
    blogPostId: '',
    blogCategoryId: '',
    description: '',
    openInNewTab: false,
    isHighlighted: false,
    isVisible: true,
    children: [],
  };
}

export function NavigationEditor({
  navigationId,
  menuName,
  initialItems,
  targets,
  canEdit,
}: {
  navigationId: string;
  menuName: string;
  initialItems: EditorItem[];
  targets: NavTargets;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = React.useState(initialItems);
  const [open, setOpen] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setItems(initialItems);
    setDirty(false);
  }, [initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(next: EditorItem[]) {
    setItems(next);
    setDirty(true);
  }

  function updateItem(key: string, patch: Partial<EditorItem>) {
    const walk = (list: EditorItem[]): EditorItem[] =>
      list.map((item) =>
        item.key === key ? { ...item, ...patch } : { ...item, children: walk(item.children) },
      );
    update(walk(items));
  }

  function removeItem(key: string) {
    const walk = (list: EditorItem[]): EditorItem[] =>
      list.filter((item) => item.key !== key).map((item) => ({ ...item, children: walk(item.children) }));
    update(walk(items));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.key === active.id);
    const newIndex = items.findIndex((i) => i.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    update(arrayMove(items, oldIndex, newIndex));
  }

  async function save() {
    setPending(true);
    const toPayload = (list: EditorItem[]): unknown[] =>
      list.map((item) => ({
        id: item.id,
        label: item.label,
        linkType: item.linkType,
        url: item.url || null,
        pageId: item.pageId || null,
        productId: item.productId || null,
        blogPostId: item.blogPostId || null,
        blogCategoryId: item.blogCategoryId || null,
        description: item.description || null,
        openInNewTab: item.openInNewTab,
        isHighlighted: item.isHighlighted,
        isVisible: item.isVisible,
        children: toPayload(item.children),
      }));

    const result = await saveNavigationItems({ navigationId, items: toPayload(items) });
    setPending(false);

    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    setDirty(false);
    toast(result.message ?? 'Menu saved.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title={menuName}
        description="Drag to reorder. Add sub-items to build a dropdown."
        actions={
          canEdit ? (
            <>
              {dirty ? <span className="text-xs text-amber-600">Unsaved changes</span> : null}
              <Button size="sm" onClick={save} disabled={pending || !dirty}>
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
          ) : null
        }
      />

      <CardBody>
        {items.length === 0 ? (
          <EmptyState
            title="This menu is empty"
            description="Add the first link to start building the navigation."
            action={
              canEdit ? (
                <Button onClick={() => update([...items, blankItem()])}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add link
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DndContext
            // A stable id: dnd-kit otherwise derives one from a module-level
            // counter that the server and the browser do not advance in step,
            // so the generated aria-describedby differs between the two renders
            // and React reports a hydration mismatch.
            id={`nav-editor-${navigationId}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {items.map((item) => (
                  <SortableItemRow
                    key={item.key}
                    item={item}
                    targets={targets}
                    canEdit={canEdit}
                    expanded={open === item.key}
                    onToggle={() => setOpen(open === item.key ? null : item.key)}
                    onChange={(patch) => updateItem(item.key, patch)}
                    onRemove={() => removeItem(item.key)}
                    onAddChild={() =>
                      updateItem(item.key, { children: [...item.children, blankItem()] })
                    }
                    onChildChange={(childKey, patch) => updateItem(childKey, patch)}
                    onChildRemove={(childKey) => removeItem(childKey)}
                    openKey={open}
                    onToggleChild={(childKey) => setOpen(open === childKey ? null : childKey)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {canEdit && items.length > 0 ? (
          <Button
            variant="outline"
            className="mt-4 w-full justify-center"
            onClick={() => update([...items, blankItem()])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add link
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}

function SortableItemRow(props: {
  item: EditorItem;
  targets: NavTargets;
  canEdit: boolean;
  expanded: boolean;
  openKey: string | null;
  onToggle: () => void;
  onToggleChild: (key: string) => void;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  onAddChild: () => void;
  onChildChange: (key: string, patch: Partial<EditorItem>) => void;
  onChildRemove: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.key,
    disabled: !props.canEdit,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border bg-surface',
        isDragging ? 'border-brand shadow-lg' : 'border-hairline',
        !props.item.isVisible && 'opacity-60',
      )}
    >
      <ItemHeader
        item={props.item}
        canEdit={props.canEdit}
        expanded={props.expanded}
        dragHandle={{ ...attributes, ...listeners }}
        onToggle={props.onToggle}
        onRemove={props.onRemove}
      />

      {props.expanded ? (
        <ItemFields item={props.item} targets={props.targets} canEdit={props.canEdit} onChange={props.onChange} />
      ) : null}

      {props.item.children.length > 0 ? (
        <ul className="space-y-2 border-t border-hairline bg-muted/[0.03] p-2 pl-8">
          {props.item.children.map((child) => (
            <li key={child.key} className="rounded-lg border border-hairline bg-surface">
              <ItemHeader
                item={child}
                canEdit={props.canEdit}
                expanded={props.openKey === child.key}
                onToggle={() => props.onToggleChild(child.key)}
                onRemove={() => props.onChildRemove(child.key)}
                isChild
              />
              {props.openKey === child.key ? (
                <ItemFields
                  item={child}
                  targets={props.targets}
                  canEdit={props.canEdit}
                  onChange={(patch) => props.onChildChange(child.key, patch)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {props.canEdit ? (
        <div className="border-t border-hairline px-3 py-2">
          <button
            type="button"
            onClick={props.onAddChild}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-brand"
          >
            <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            Add sub-item
          </button>
        </div>
      ) : null}
    </li>
  );
}

function ItemHeader({
  item,
  canEdit,
  expanded,
  dragHandle,
  onToggle,
  onRemove,
  isChild,
}: {
  item: EditorItem;
  canEdit: boolean;
  expanded: boolean;
  dragHandle?: Record<string, unknown>;
  onToggle: () => void;
  onRemove: () => void;
  isChild?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      {dragHandle ? (
        <button
          type="button"
          {...dragHandle}
          aria-label={`Reorder ${item.label}`}
          disabled={!canEdit}
          className="cursor-grab rounded p-1 text-muted hover:bg-muted/10 active:cursor-grabbing disabled:opacity-40"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <span className="w-6" aria-hidden="true" />
      )}

      <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-content">{item.label}</span>
        <span className="block truncate text-xs text-muted">{LINK_TYPE_LABELS[item.linkType]}</span>
      </button>

      {item.isHighlighted ? <Badge tone="brand">Highlighted</Badge> : null}
      {!item.isVisible ? <Badge tone="neutral">Hidden</Badge> : null}
      {isChild ? null : null}

      {canEdit ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.label}`}
          className="rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash className="h-4 w-4" />
        </button>
      ) : null}

      <ChevronDown
        className={cn('h-4 w-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')}
        aria-hidden="true"
      />
    </div>
  );
}

function ItemFields({
  item,
  targets,
  canEdit,
  onChange,
}: {
  item: EditorItem;
  targets: NavTargets;
  canEdit: boolean;
  onChange: (patch: Partial<EditorItem>) => void;
}) {
  return (
    <fieldset disabled={!canEdit} className="space-y-4 border-t border-hairline p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" htmlFor={`${item.key}-label`}>
          <Input
            id={`${item.key}-label`}
            value={item.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </Field>

        <Field label="Links to" htmlFor={`${item.key}-type`}>
          <Select
            id={`${item.key}-type`}
            value={item.linkType}
            onChange={(e) => onChange({ linkType: e.target.value as EditorItem['linkType'] })}
          >
            {Object.entries(LINK_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {item.linkType === 'INTERNAL' || item.linkType === 'EXTERNAL' ? (
          <Field
            label={item.linkType === 'EXTERNAL' ? 'URL' : 'Path'}
            htmlFor={`${item.key}-url`}
            className="sm:col-span-2"
          >
            <Input
              id={`${item.key}-url`}
              value={item.url}
              placeholder={item.linkType === 'EXTERNAL' ? 'https://example.com' : '/pricing'}
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </Field>
        ) : null}

        {item.linkType === 'PAGE' ? (
          <Field label="Page" htmlFor={`${item.key}-page`} className="sm:col-span-2">
            <Select
              id={`${item.key}-page`}
              value={item.pageId}
              onChange={(e) => onChange({ pageId: e.target.value })}
            >
              <option value="">Choose a page…</option>
              {targets.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title} (/{page.slug})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {item.linkType === 'PRODUCT' ? (
          <Field label="Product" htmlFor={`${item.key}-product`} className="sm:col-span-2">
            <Select
              id={`${item.key}-product`}
              value={item.productId}
              onChange={(e) => onChange({ productId: e.target.value })}
            >
              <option value="">Choose a product…</option>
              {targets.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {item.linkType === 'BLOG_POST' ? (
          <Field label="Blog post" htmlFor={`${item.key}-post`} className="sm:col-span-2">
            <Select
              id={`${item.key}-post`}
              value={item.blogPostId}
              onChange={(e) => onChange({ blogPostId: e.target.value })}
            >
              <option value="">Choose a post…</option>
              {targets.posts.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {item.linkType === 'BLOG_CATEGORY' ? (
          <Field label="Blog category" htmlFor={`${item.key}-category`} className="sm:col-span-2">
            <Select
              id={`${item.key}-category`}
              value={item.blogCategoryId}
              onChange={(e) => onChange({ blogCategoryId: e.target.value })}
            >
              <option value="">Choose a category…</option>
              {targets.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label="Description"
          htmlFor={`${item.key}-description`}
          hint="Shown under the label in dropdown menus."
          className="sm:col-span-2"
        >
          <Input
            id={`${item.key}-description`}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-3 rounded-lg border border-hairline p-3">
        <Switch
          checked={item.isVisible}
          onChange={(next) => onChange({ isVisible: next })}
          label="Visible"
        />
        <Switch
          checked={item.openInNewTab}
          onChange={(next) => onChange({ openInNewTab: next })}
          label="Open in a new tab"
        />
        <Switch
          checked={item.isHighlighted}
          onChange={(next) => onChange({ isHighlighted: next })}
          label="Highlight this item"
        />
      </div>
    </fieldset>
  );
}

import { cn } from '@/lib/utils/cn';

/**
 * A titled block inside a settings screen.
 *
 * The description column on the left and the controls on the right keep long
 * settings pages scannable — an admin can find "Buttons" without reading every
 * field on the way down.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn('grid gap-5 py-6 lg:grid-cols-[16rem_1fr] lg:gap-10', className)}>
      <div className="lg:pt-1">
        <h2 className="font-heading text-sm font-semibold text-content">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
        {actions ? <div className="mt-3">{actions}</div> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** Divides consecutive settings sections. */
export function SettingsDivider() {
  return <hr className="border-hairline" />;
}

import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { RedirectManager, type RedirectRow } from '@/components/admin/seo/redirect-manager';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Redirects' };
export const dynamic = 'force-dynamic';

export default async function RedirectsAdmin() {
  const user = await requirePermission('seo.manage');

  const rows = await prisma.redirect.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });

  const redirects: RedirectRow[] = rows.map((row) => ({
    id: row.id,
    source: row.source,
    destination: row.destination,
    type: row.type,
    isActive: row.isActive,
    hitCount: row.hitCount,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <AdminPageHeader
        title="Redirects"
        description="Applied when a request would otherwise 404. Loops are rejected when you save."
        crumbs={[{ label: 'SEO', href: '/admin/seo' }, { label: 'Redirects' }]}
      />
      <Card className="p-4 sm:p-5">
        <RedirectManager rows={redirects} canEdit={userCan(user, 'seo.manage')} />
      </Card>
    </div>
  );
}

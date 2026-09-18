import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { CustomerForm, type CustomerFormValues } from '@/components/admin/customers/customer-form';
import { CustomerSidebar } from '@/components/admin/customers/customer-sidebar';
import { LeadStatusBadge } from '@/components/admin/lead-status-badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils/format';
import { decimalToString } from '@/lib/utils/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
  return { title: customer ? customer.name : 'Customer' };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('customers.view');
  const { id } = await params;

  const [customer, staff, products] = await Promise.all([
    prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        leads: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, reference: true, name: true, status: true, createdAt: true, value: true },
        },
        products: { include: { product: { select: { id: true, name: true, currency: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  if (!customer) notFound();

  const initial: CustomerFormValues = {
    id: customer.id,
    name: customer.name,
    company: customer.company ?? '',
    email: customer.email,
    phone: customer.phone ?? '',
    website: customer.website ?? '',
    address: customer.address ?? '',
    gstin: customer.gstin ?? '',
    status: customer.status,
    assignedToId: customer.assignedToId ?? '',
  };

  const canEdit = userCan(user, 'customers.edit');

  return (
    <>
      <AdminPageHeader
        title={customer.name}
        description={[customer.company, customer.email].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Customers', href: '/admin/customers' }, { label: `#${customer.reference}` }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <CustomerForm initial={initial} staff={staff} canEdit={canEdit} mode="edit" />

          <Card>
            <CardHeader title="Lead history" description="Every enquiry linked to this account." />
            {customer.leads.length === 0 ? (
              <EmptyState title="No linked leads" description="Convert a won lead to link it here." />
            ) : (
              <ul className="divide-y divide-hairline">
                {customer.leads.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/[0.03] sm:px-5"
                    >
                      <span className="font-mono text-xs text-muted">#{lead.reference}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-content">{lead.name}</span>
                      <LeadStatusBadge status={lead.status} />
                      <span className="hidden shrink-0 text-xs text-muted sm:block">
                        {formatDate(lead.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <CustomerSidebar
          customerId={customer.id}
          canEdit={canEdit}
          products={products}
          linked={customer.products.map((link) => ({
            productId: link.productId,
            productName: link.product.name,
            quantity: link.quantity,
            seats: link.seats,
            unitPrice: decimalToString(link.unitPrice),
            currency: link.product.currency,
            renewsAt: link.renewsAt?.toISOString() ?? null,
          }))}
          notes={customer.notes.map((note) => ({
            id: note.id,
            body: note.body,
            authorName: note.author?.name ?? null,
            createdAt: note.createdAt.toISOString(),
          }))}
        />
      </div>
    </>
  );
}

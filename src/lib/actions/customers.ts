'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { customerInputSchema } from '@/lib/validation/lead';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

export async function saveCustomer(
  customerId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize(customerId ? 'customers.edit' : 'customers.create');
    const input = customerInputSchema.parse(Object.fromEntries(formData.entries()));

    const data = {
      name: sanitizeText(input.name),
      company: input.company ? sanitizeText(input.company) : null,
      email: input.email.toLowerCase(),
      phone: input.phone,
      website: input.website,
      address: input.address ? sanitizeText(input.address) : null,
      gstin: input.gstin,
      status: input.status,
      assignedToId: input.assignedToId,
    };

    const customer = customerId
      ? await prisma.customer.update({ where: { id: customerId }, data })
      : await prisma.customer.create({ data });

    await recordAudit({
      actor: user,
      action: customerId ? 'updated' : 'created',
      entity: 'Customer',
      entityId: customer.id,
      summary: `${customerId ? 'Updated' : 'Created'} customer “${customer.name}”`,
    });

    revalidatePath('/admin/customers');
    if (customerId) revalidatePath(`/admin/customers/${customerId}`);
    return success({ id: customer.id }, 'Customer saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const noteSchema = z.object({
  customerId: z.string().min(1),
  body: z.string().trim().min(1, 'Write something first').max(4000),
});

export async function addCustomerNote(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('customers.edit');
    const { customerId, body } = noteSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) return failure('That customer no longer exists.');

    await prisma.customerNote.create({
      data: { customerId, authorId: user.id, body: sanitizeText(body) },
    });

    revalidatePath(`/admin/customers/${customerId}`);
    return success(undefined, 'Note added.');
  } catch (error) {
    return toActionError(error);
  }
}

const productLinkSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(1_000_000).default(1),
  seats: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  renewsAt: z.string().optional().nullable(),
});

export async function linkCustomerProduct(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('customers.edit');
    const parsed = productLinkSchema.parse(input);

    const renewsAt = parsed.renewsAt ? new Date(parsed.renewsAt) : null;
    if (renewsAt && Number.isNaN(renewsAt.getTime())) return failure('Enter a valid renewal date.');

    await prisma.customerProduct.upsert({
      where: {
        customerId_productId: { customerId: parsed.customerId, productId: parsed.productId },
      },
      update: { quantity: parsed.quantity, seats: parsed.seats ?? null, renewsAt },
      create: {
        customerId: parsed.customerId,
        productId: parsed.productId,
        quantity: parsed.quantity,
        seats: parsed.seats ?? null,
        renewsAt,
      },
    });

    await recordAudit({
      actor: user,
      action: 'product.linked',
      entity: 'Customer',
      entityId: parsed.customerId,
      summary: 'Linked a product to the customer',
    });

    revalidatePath(`/admin/customers/${parsed.customerId}`);
    return success(undefined, 'Product linked.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkCustomerProduct(
  customerId: string,
  productId: string,
): Promise<ActionResult> {
  try {
    await authorize('customers.edit');
    await prisma.customerProduct.deleteMany({ where: { customerId, productId } });
    revalidatePath(`/admin/customers/${customerId}`);
    return success(undefined, 'Product unlinked.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  try {
    const user = await authorize('customers.delete');
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return failure('That customer no longer exists.');

    await prisma.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Customer',
      entityId: customerId,
      summary: `Deleted customer “${customer.name}”`,
    });

    revalidatePath('/admin/customers');
    return success(undefined, 'Customer deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

const customerBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['status', 'assign', 'unassign', 'delete']),
  /** Required by `status`; the target CustomerStatus. */
  status: z.string().max(40).optional(),
  /** Required by `assign`; the staff member to own these customers. */
  assignedToId: z.string().max(40).optional(),
});

/**
 * Applies one change to several customers at once.
 *
 * Each branch takes the same permission the single-record action does — a bulk
 * route must never be a way around a check. Deletes stay soft, exactly as
 * deleteCustomer does, so nothing is actually destroyed.
 */
export async function bulkCustomerAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action, status, assignedToId } = customerBulkSchema.parse(input);
    const user =
      action === 'delete' ? await authorize('customers.delete') : await authorize('customers.edit');

    const customers = await prisma.customer.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (customers.length === 0) return failure('Those customers no longer exist.');
    const targetIds = customers.map((customer) => customer.id);

    if (action === 'delete') {
      await prisma.customer.updateMany({
        where: { id: { in: targetIds } },
        data: { deletedAt: new Date() },
      });
    } else if (action === 'assign') {
      if (!assignedToId) return failure('Choose who should own these customers.');
      const owner = await prisma.user.findFirst({
        where: { id: assignedToId, deletedAt: null },
        select: { id: true },
      });
      if (!owner) return failure('That staff member no longer exists.');
      await prisma.customer.updateMany({
        where: { id: { in: targetIds } },
        data: { assignedToId: owner.id },
      });
    } else if (action === 'unassign') {
      await prisma.customer.updateMany({
        where: { id: { in: targetIds } },
        data: { assignedToId: null },
      });
    } else {
      if (!status) return failure('Choose a status to apply.');
      const allowed = ['PROSPECT', 'ACTIVE', 'INACTIVE', 'FORMER'];
      if (!allowed.includes(status)) return failure('That is not a customer status.');
      await prisma.customer.updateMany({
        where: { id: { in: targetIds } },
        data: { status: status as never },
      });
    }

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'Customer',
      summary: `${action} applied to ${targetIds.length} customer(s)`,
    });

    revalidatePath('/admin/customers');
    return success(undefined, `${targetIds.length} customer(s) updated.`);
  } catch (error) {
    return toActionError(error);
  }
}

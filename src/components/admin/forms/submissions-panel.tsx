'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Inbox } from 'lucide-react';
import { exportSubmissions } from '@/lib/actions/forms';
import { Card, CardHeader } from '@/components/ui/card';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { downloadCsv } from '@/lib/utils/download';
import { formatDate, truncate } from '@/lib/utils/format';

export type SubmissionRow = {
  id: string;
  data: Record<string, string>;
  createdAt: string;
  pageUrl: string | null;
  leadId: string | null;
};

export function SubmissionsPanel({
  formId,
  fieldNames,
  submissions,
}: {
  formId: string;
  fieldNames: Array<{ name: string; label: string }>;
  submissions: SubmissionRow[];
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  // Keep the table readable: the first four fields, then a link to the lead.
  const columns = fieldNames.slice(0, 4);

  async function onExport() {
    setBusy(true);
    const result = await exportSubmissions({ formId });
    setBusy(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    downloadCsv(result.data!.csv, result.data!.filename);
    toast('Export downloaded.');
  }

  return (
    <Card>
      <CardHeader
        title="Recent submissions"
        description="The 25 most recent. Export for the full history."
        actions={
          submissions.length > 0 ? (
            <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
          ) : null
        }
      />

      {submissions.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No submissions yet"
          description="Once this form is live on a page, submissions appear here."
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[44rem]">
            <caption className="sr-only">Recent form submissions</caption>
            <thead>
              <tr>
                <Th>Received</Th>
                {columns.map((column) => (
                  <Th key={column.name}>{column.label}</Th>
                ))}
                <Th>Page</Th>
                <Th align="right">Lead</Th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <Tr key={submission.id}>
                  <Td className="whitespace-nowrap text-sm text-muted">
                    {formatDate(submission.createdAt, true)}
                  </Td>
                  {columns.map((column) => (
                    <Td key={column.name} className="text-sm text-content">
                      {truncate(String(submission.data[column.name] ?? '—'), 40)}
                    </Td>
                  ))}
                  <Td className="text-sm text-muted">{submission.pageUrl ?? '—'}</Td>
                  <Td align="right">
                    {submission.leadId ? (
                      <Link
                        href={`/admin/leads/${submission.leadId}`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Open lead
                      </Link>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}

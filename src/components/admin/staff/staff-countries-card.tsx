'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { setUserCountries } from '@/lib/actions/countries';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';

/**
 * Which markets a staff account may work in.
 *
 * This narrows what a role already permits and never widens it: an India
 * content editor still needs `pages.edit` to edit a page, and this only decides
 * which country's pages they can reach. Selecting nothing means every market,
 * which is what every account has until somebody deliberately restricts one.
 */
export function StaffCountriesCard({
  userId,
  countries,
  selected,
  isSuperAdmin,
  canEdit,
}: {
  userId: string;
  countries: Array<{ id: string; name: string; code: string; isActive: boolean }>;
  selected: string[];
  isSuperAdmin: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [ids, setIds] = React.useState<string[]>(selected);
  const [pending, setPending] = React.useState(false);

  if (countries.length < 2) return null;

  const toggle = (id: string) =>
    setIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  async function save() {
    setPending(true);
    const result = await setUserCountries({ userId, countryIds: ids });
    setPending(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="Country access"
        description="Restrict this account to certain storefronts. Leave every box clear for access to all of them."
      />
      <CardBody className="space-y-3">
        {isSuperAdmin ? (
          <Alert tone="info">
            A super admin always has access to every country, so this cannot be restricted.
          </Alert>
        ) : (
          <>
            {countries.map((country) => (
              <Checkbox
                key={country.id}
                checked={ids.includes(country.id)}
                onChange={() => toggle(country.id)}
                disabled={!canEdit}
                label={country.isActive ? country.name : `${country.name} (inactive)`}
              />
            ))}
            <p className="text-xs text-muted">
              {ids.length === 0
                ? 'This account can work in every country.'
                : `This account is limited to ${ids.length} of ${countries.length} countries. Country access never grants a permission the role does not already have.`}
            </p>
          </>
        )}
      </CardBody>
      {canEdit && !isSuperAdmin ? (
        <CardFooter className="justify-end">
          <Button onClick={save} disabled={pending}>
            {pending ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save country access'
            )}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

import { describe, it, expect } from 'vitest';
import {
  collectEnvProblems,
  collectSeedProblems,
  assertProductionEnv,
  type EnvSource,
} from '@/lib/env';

/**
 * The production environment gate.
 *
 * These tests exist because the failure mode they prevent is expensive: a
 * container that boots with a missing key and then fails at the first sign-in,
 * or one that leaks a secret into a log line an operator pastes into a ticket.
 */

/** A configuration that should pass every required check. */
function validEnv(overrides: EnvSource = {}): EnvSource {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db.postgres.database.azure.com:5432/app?sslmode=require',
    AUTH_SECRET: 'a'.repeat(32),
    NEXTAUTH_URL: 'https://example.com',
    NEXT_PUBLIC_SITE_URL: 'https://example.com',
    ENCRYPTION_KEY: 'b'.repeat(32),
    MFA_ENCRYPTION_KEY: 'c'.repeat(32),
    ...overrides,
  };
}

function names(problems: ReturnType<typeof collectEnvProblems>): string[] {
  return problems.map((problem) => problem.variable);
}

describe('required production variables', () => {
  it('accepts a complete configuration', () => {
    expect(collectEnvProblems(validEnv())).toEqual([]);
  });

  it('reports every missing critical variable at once', () => {
    const problems = collectEnvProblems({ NODE_ENV: 'production' });

    expect(names(problems)).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'AUTH_SECRET',
        'NEXTAUTH_URL',
        'NEXT_PUBLIC_SITE_URL',
        'ENCRYPTION_KEY',
        'MFA_ENCRYPTION_KEY',
      ]),
    );
  });

  it('rejects a DATABASE_URL that is not a PostgreSQL URL', () => {
    const problems = collectEnvProblems(validEnv({ DATABASE_URL: 'mysql://user@host/db' }));
    expect(names(problems)).toContain('DATABASE_URL');
  });

  it('accepts the Azure Flexible Server connection shape', () => {
    const azure =
      'postgresql://admin:pw@srv.postgres.database.azure.com:5432/dropbox_reseller?schema=public&sslmode=require';
    expect(collectEnvProblems(validEnv({ DATABASE_URL: azure }))).toEqual([]);
  });

  it('rejects a short AUTH_SECRET and a short MFA key', () => {
    expect(names(collectEnvProblems(validEnv({ AUTH_SECRET: 'tooshort' })))).toContain(
      'AUTH_SECRET',
    );
    expect(names(collectEnvProblems(validEnv({ MFA_ENCRYPTION_KEY: 'short' })))).toContain(
      'MFA_ENCRYPTION_KEY',
    );
  });

  it('requires https for the public URLs', () => {
    expect(names(collectEnvProblems(validEnv({ NEXTAUTH_URL: 'http://example.com' })))).toContain(
      'NEXTAUTH_URL',
    );
    expect(
      names(collectEnvProblems(validEnv({ NEXT_PUBLIC_SITE_URL: 'not-a-url' }))),
    ).toContain('NEXT_PUBLIC_SITE_URL');
  });
});

describe('conditional variables', () => {
  it('ignores storage credentials while the provider is local', () => {
    expect(collectEnvProblems(validEnv({ STORAGE_PROVIDER: 'local' }))).toEqual([]);
  });

  it('requires them once the provider is r2', () => {
    const problems = collectEnvProblems(validEnv({ STORAGE_PROVIDER: 'r2' }));

    expect(names(problems)).toEqual(
      expect.arrayContaining([
        'S3_BUCKET',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
        'S3_PUBLIC_URL',
        'S3_ENDPOINT',
      ]),
    );
  });

  it('does not demand an endpoint for plain S3', () => {
    const problems = collectEnvProblems(
      validEnv({
        STORAGE_PROVIDER: 's3',
        S3_BUCKET: 'media',
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
        S3_PUBLIC_URL: 'https://cdn.example.com',
      }),
    );
    expect(problems).toEqual([]);
  });

  it('requires backup credentials only when the driver is s3', () => {
    expect(collectEnvProblems(validEnv({ BACKUP_STORAGE_DRIVER: 'local' }))).toEqual([]);

    const problems = collectEnvProblems(validEnv({ BACKUP_STORAGE_DRIVER: 's3' }));
    expect(names(problems)).toEqual(
      expect.arrayContaining([
        'BACKUP_S3_BUCKET',
        'BACKUP_S3_ACCESS_KEY_ID',
        'BACKUP_S3_SECRET_ACCESS_KEY',
      ]),
    );
  });

  it('requires a sender address only once SMTP is configured', () => {
    expect(collectEnvProblems(validEnv())).toEqual([]);
    expect(names(collectEnvProblems(validEnv({ SMTP_HOST: 'smtp.example.com' })))).toContain(
      'MAIL_FROM',
    );
  });

  it('rejects a nonsense SMTP port', () => {
    const problems = collectEnvProblems(
      validEnv({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'a@b.com', SMTP_PORT: '99999' }),
    );
    expect(names(problems)).toContain('SMTP_PORT');
  });

  it('rejects a CRON_SECRET too short to be worth having', () => {
    expect(names(collectEnvProblems(validEnv({ CRON_SECRET: 'short' })))).toContain('CRON_SECRET');
    expect(collectEnvProblems(validEnv({ CRON_SECRET: 'x'.repeat(32) }))).toEqual([]);
  });

  it('validates seed variables only when RUN_SEED is on', () => {
    const off = validEnv({ SEED_ADMIN_EMAIL: 'admin@example.com', SEED_ADMIN_PASSWORD: 'weak' });
    expect(collectEnvProblems(off)).toEqual([]);

    const on = collectEnvProblems({ ...off, RUN_SEED: 'true' });
    expect(names(on)).toContain('SEED_ADMIN_PASSWORD');
  });
});

describe('admin bootstrap password policy', () => {
  const base = { SEED_ADMIN_EMAIL: 'admin@example.com' };

  it('allows seeding without an admin at all', () => {
    expect(collectSeedProblems({})).toEqual([]);
  });

  it('requires both halves together', () => {
    expect(names(collectSeedProblems({ ...base }))).toContain('SEED_ADMIN_PASSWORD');
    expect(
      names(collectSeedProblems({ SEED_ADMIN_PASSWORD: 'Str0ng!Passphrase42' })),
    ).toContain('SEED_ADMIN_EMAIL');
  });

  it('rejects an invalid email', () => {
    const problems = collectSeedProblems({
      SEED_ADMIN_EMAIL: 'not-an-email',
      SEED_ADMIN_PASSWORD: 'Str0ng!Passphrase42',
    });
    expect(names(problems)).toContain('SEED_ADMIN_EMAIL');
  });

  it('accepts a genuinely strong password', () => {
    expect(
      collectSeedProblems({ ...base, SEED_ADMIN_PASSWORD: 'Str0ng!Passphrase42' }),
    ).toEqual([]);
  });

  it('rejects weak passwords for each reason', () => {
    const cases: Array<[string, string]> = [
      ['Sh0rt!Pass', 'too short'],
      ['alllowercase1!x', 'no uppercase'],
      ['ALLUPPERCASE1!X', 'no lowercase'],
      ['NoDigitsHere!!!x', 'no digit'],
      ['NoSymbolsHere123x', 'no symbol'],
    ];

    for (const [password, why] of cases) {
      const problems = collectSeedProblems({ ...base, SEED_ADMIN_PASSWORD: password });
      expect(names(problems), why).toContain('SEED_ADMIN_PASSWORD');
    }
  });

  /**
   * "ChangeMe123!" passes every character-class rule and is still a published
   * default — which is exactly how these accounts get taken over.
   */
  it('rejects a password containing a common placeholder word', () => {
    for (const password of ['ChangeMe123!Secure', 'MyPassword123!Long', 'Admin123!Superuser']) {
      const problems = collectSeedProblems({ ...base, SEED_ADMIN_PASSWORD: password });
      expect(names(problems), password).toContain('SEED_ADMIN_PASSWORD');
    }
  });

  it('never repeats the password back in the problem text', () => {
    // Deliberately not a word that appears in the advice text itself, so a pass
    // here means the value really was withheld.
    const password = 'hunter2';
    const problems = collectSeedProblems({ ...base, SEED_ADMIN_PASSWORD: password });

    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problem.problem).not.toContain(password);
    }
  });
});

describe('the boot gate', () => {
  it('does nothing outside production', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('throws in production when something critical is missing', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production' })).toThrow(
      /Environment is not ready for production/,
    );
  });

  it('names every problem so one restart fixes them all', () => {
    let message = '';
    try {
      assertProductionEnv({ NODE_ENV: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }

    for (const name of ['DATABASE_URL', 'AUTH_SECRET', 'MFA_ENCRYPTION_KEY']) {
      expect(message).toContain(name);
    }
  });

  /**
   * The build needs an escape hatch: `next build` runs with NODE_ENV=production
   * and placeholder values, and must not be blocked by a gate meant for runtime.
   */
  it('can be skipped explicitly for the build', () => {
    expect(() =>
      assertProductionEnv({ NODE_ENV: 'production', SKIP_ENV_VALIDATION: 'true' }),
    ).not.toThrow();
  });

  it('passes cleanly for a valid production configuration', () => {
    expect(() => assertProductionEnv(validEnv())).not.toThrow();
  });

  it('never includes a secret value in the failure message', () => {
    const secret = 'super-secret-value-that-must-not-leak';
    let message = '';
    try {
      assertProductionEnv(
        validEnv({ AUTH_SECRET: secret, NEXTAUTH_URL: 'http://insecure.example.com' }),
      );
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('NEXTAUTH_URL');
    expect(message).not.toContain(secret);
  });
});

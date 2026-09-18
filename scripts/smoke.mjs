/**
 * End-to-end smoke test.
 *
 * Boots nothing itself — point BASE_URL at a running server. Signs in with the
 * seeded admin credentials and asserts that public pages, auth and every admin
 * route respond correctly.
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
/** Mirrors LOGIN_PATH in src/lib/auth/routes.ts — a plain script cannot import it. */
const LOGIN_PATH = '/auth-control-panel/admin';
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!2024';

const jar = new Map();
let failures = 0;
let checks = 0;

function cookieHeader() {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...options,
    headers: { cookie: cookieHeader(), ...(options.headers ?? {}) },
  });
  storeCookies(response);
  return response;
}

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectStatus(path, expected, name = path) {
  const response = await request(path);
  const ok = Array.isArray(expected)
    ? expected.includes(response.status)
    : response.status === expected;
  check(name, ok, `got ${response.status}, expected ${expected}`);
  return response;
}

async function main() {
  console.log(`\nSmoke testing ${BASE}\n`);

  console.log('Public routes');
  await expectStatus('/', 200);
  await expectStatus('/pricing', 200);
  await expectStatus('/contact', 200);
  await expectStatus('/about', 200);
  await expectStatus('/blog', 200);
  await expectStatus('/blog/dropbox-admin-settings-day-one', 200);
  await expectStatus('/blog/category/guides', 200);
  await expectStatus('/products/dropbox-business-advanced', 200);
  await expectStatus('/sitemap.xml', 200);
  await expectStatus('/robots.txt', 200);
  await expectStatus('/this-page-does-not-exist', 404, '/this-page-does-not-exist returns 404');

  const home = await request('/');
  const html = await home.text();
  check('homepage returns 200', home.status === 200);
  check('homepage renders CMS hero', html.includes('Dropbox for business'));
  check('homepage renders product table', html.includes('Compare Dropbox plans'));
  check('homepage renders navigation', html.includes('Talk to Sales'));

  const sitemap = await (await request('/sitemap.xml')).text();
  check('sitemap lists products', sitemap.includes('/products/dropbox-business-advanced'));
  check('sitemap lists blog posts', sitemap.includes('/blog/dropbox-admin-settings-day-one'));

  console.log('\nAuthorisation');
  const guarded = await request('/admin');
  check('/admin is a 404 when signed out', guarded.status === 404, `got ${guarded.status}`);
  // The point of the 404: a redirect would put the sign-in screen's path in a
  // Location header, so probing /admin would reveal it.
  const guardedBody = await guarded.text();
  check(
    '/admin never names the sign-in screen',
    !guardedBody.includes(LOGIN_PATH) &&
      !(guarded.headers.get('location') ?? '').includes(LOGIN_PATH),
  );
  await expectStatus('/preview/any-id', 404, '/preview is a 404 when signed out');
  await expectStatus('/auth/verify-2fa', 404, '/auth/verify-2fa is a 404 when signed out');
  await expectStatus(LOGIN_PATH, 200, 'sign-in screen is served');
  await expectStatus('/login', 404, '/login is gone');

  console.log('\nSign in');
  const csrfResponse = await request('/api/auth/csrf');
  const { csrfToken } = await csrfResponse.json();
  check('csrf token issued', typeof csrfToken === 'string' && csrfToken.length > 10);

  const badLogin = await request('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: 'definitely-the-wrong-password',
      callbackUrl: `${BASE}/admin`,
    }).toString(),
  });
  check(
    'wrong password is rejected',
    (badLogin.headers.get('location') ?? '').includes('error'),
    badLogin.headers.get('location') ?? '',
  );

  const login = await request('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/admin`,
    }).toString(),
  });
  const sessionCookie = Array.from(jar.keys()).find((k) => k.includes('session-token'));
  check('credentials sign-in succeeds', Boolean(sessionCookie), login.headers.get('location') ?? '');

  const session = await (await request('/api/auth/session')).json();
  check('session carries the user', session?.user?.email === EMAIL);
  check('session carries permissions', Array.isArray(session?.user?.permissions) &&
    session.user.permissions.length > 0);

  console.log('\nAdmin routes');
  for (const path of ADMIN_ROUTES) {
    await expectStatus(path, 200);
  }

  const dashboard = await (await request('/admin')).text();
  check('dashboard renders the admin shell', dashboard.includes('admin-main'));
  check('dashboard shows lead metrics', dashboard.includes('Total leads'));
  check('dashboard shows the pipeline funnel', dashboard.includes('Open pipeline'));

  const pagesAdmin = await (await request('/admin/pages')).text();
  check('pages list renders seeded pages', pagesAdmin.includes('Pricing'));

  const productsAdmin = await (await request('/admin/products')).text();
  check('products list renders seeded products', productsAdmin.includes('Dropbox Business Advanced'));

  const leadsAdmin = await (await request('/admin/leads')).text();
  check('leads list renders seeded leads', leadsAdmin.includes('Meridian Labs'));

  const pipeline = await (await request('/admin/pipeline')).text();
  check('pipeline renders every stage', pipeline.includes('Negotiation') && pipeline.includes('Qualified'));

  const forms = await (await request('/admin/forms')).text();
  check('forms list renders seeded forms', forms.includes('Contact Sales'));

  const reports = await (await request('/admin/reports')).text();
  check('reports render attribution breakdowns', reports.includes('Leads by source'));

  const blogAdmin = await (await request('/admin/blog')).text();
  check('blog list renders seeded posts', blogAdmin.includes('Google Drive to Dropbox'));

  const seoAdmin = await (await request('/admin/seo')).text();
  check('SEO settings render the title template', seoAdmin.includes('Title template'));

  const navAdmin = await (await request('/admin/navigation')).text();
  check('navigation lists the seeded menus', navAdmin.includes('Main menu'));

  const settingsAdmin = await (await request('/admin/settings')).text();
  check('settings render the brand palette', settingsAdmin.includes('Colours'));

  const emailAdmin = await (await request('/admin/settings/email')).text();
  check('email settings render the SMTP form', emailAdmin.includes('SMTP server'));

  const marketingAdmin = await (await request('/admin/marketing')).text();
  check('marketing lists every vendor tag', marketingAdmin.includes('Google Analytics 4') &&
    marketingAdmin.includes('Meta Pixel'));

  const staffAdmin = await (await request('/admin/staff')).text();
  check('staff lists roles and permissions', staffAdmin.includes('Roles and permissions'));

  const auditAdmin = await (await request('/admin/audit')).text();
  check('audit log renders', auditAdmin.includes('Audit log'));

  console.log('\nInfrastructure');
  const health = await request('/api/health');
  const healthBody = await health.json();
  check('health endpoint reports the database', health.status === 200 &&
    healthBody.database === 'connected', JSON.stringify(healthBody));

  const headers = (await request('/')).headers;
  check('sets X-Frame-Options', headers.get('x-frame-options') === 'DENY');
  check('sets X-Content-Type-Options', headers.get('x-content-type-options') === 'nosniff');
  check('sets Referrer-Policy', Boolean(headers.get('referrer-policy')));
  check('sets Permissions-Policy', Boolean(headers.get('permissions-policy')));
  check('does not advertise the framework', !headers.get('x-powered-by'));

  const adminHeaders = (await request('/admin')).headers;
  check('admin is not indexable', (adminHeaders.get('x-robots-tag') ?? '').includes('noindex'));

  console.log(`\n${checks - failures}/${checks} checks passed\n`);
  if (failures > 0) process.exit(1);
}

const DEFAULT_ADMIN_ROUTES = [
  '/admin',
  '/admin/pages',
  '/admin/pages/new',
  '/admin/products',
  '/admin/products/new',
  '/admin/products/categories',
  '/admin/leads',
  '/admin/leads/new',
  '/admin/pipeline',
  '/admin/customers',
  '/admin/customers/new',
  '/admin/forms',
  '/admin/forms/new',
  '/admin/reports',
  '/admin/blog',
  '/admin/blog/new',
  '/admin/blog/categories',
  '/admin/media',
  '/admin/seo',
  '/admin/redirects',
  '/admin/navigation',
  '/admin/settings',
  '/admin/settings/email',
  '/admin/marketing',
  '/admin/popups',
  '/admin/lead-magnets',
  '/admin/staff',
  '/admin/staff/new',
  '/admin/audit',
];

const ADMIN_ROUTES = (process.env.ADMIN_ROUTES || DEFAULT_ADMIN_ROUTES.join(',')).split(',');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

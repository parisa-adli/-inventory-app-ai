import { expect, test, type Page } from '@playwright/test';

const user = (overrides: Record<string, unknown>) => ({
  id: 'u1',
  name: 'Ada Admin',
  email: 'admin@inventory.local',
  role: 'admin',
  status: 'active',
  emailVerified: true,
  ...overrides,
});

const admin = user({});
const staff = user({ id: 's1', name: 'Sam Staff', email: 'staff@inventory.local', role: 'staff' });
const pending = user({ id: 'p1', name: 'Pat Pending', role: 'staff', status: 'pending' });
const unverified = user({ id: 'v1', name: 'Uli Unverified', role: 'staff', status: 'pending', emailVerified: false });
const rejected = user({ id: 'r1', name: 'Rex Rejected', role: 'staff', status: 'rejected' });

const unauthorized = { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } } };
const emptyUsersPage = { items: [], page: 1, limit: 10, total: 0, totalPages: 1 };

/** No real API: anything not stubbed below is a 404. Later routes take precedence. */
const stubApi = async (page: Page, me: unknown) => {
  // Match on the path: a glob like **/api/** would also catch Vite's own src/**/api/*.ts modules
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ status: 404, json: {} })
  );
  await page.route('**/api/auth/refresh', (route) => route.fulfill(unauthorized));
  await page.route('**/api/auth/me', (route) => (me ? route.fulfill({ json: me }) : route.fulfill(unauthorized)));
  await page.route('**/api/users?*', (route) => route.fulfill({ json: emptyUsersPage }));
};

const appShell = (page: Page) => page.getByRole('button', { name: 'Account' });

test.describe('route guards (stubbed API)', () => {
  test.describe('guest', () => {
    test('app routes send a guest to /login, remembering the page', async ({ page }) => {
      await stubApi(page, null);

      await page.goto('/');
      await expect(page).toHaveURL('/login');

      await page.goto('/app/users?tab=active');
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/app/users?tab=active')}`);

      await page.goto('/app/no-such-page');
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/app/no-such-page')}`);

      // Outside /app an unknown URL is guarded the same way
      await page.goto('/no-such-page');
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/no-such-page')}`);
      await expect(appShell(page)).toHaveCount(0);
    });

    test('gate screens send a guest to /login', async ({ page }) => {
      await stubApi(page, null);
      for (const path of ['/verify-email', '/awaiting-approval', '/rejected']) {
        await page.goto(path);
        await expect(page).toHaveURL('/login');
      }
    });

    test('emailed links stay open to a guest', async ({ page }) => {
      await stubApi(page, null);

      await page.goto('/reset-password/some-token');
      await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
      await expect(page).toHaveURL('/reset-password/some-token');

      await page.route('**/api/auth/verify-email/*', (route) =>
        route.fulfill({ status: 400, json: { error: { code: 'INVALID_TOKEN', message: 'Link not valid' } } })
      );
      await page.goto('/verify-email/some-token');
      await expect(page).toHaveURL('/verify-email/some-token');
    });

    test('signing in returns to the remembered page', async ({ page }) => {
      await stubApi(page, null);
      await page.route('**/api/auth/login', (route) => route.fulfill({ json: { user: admin } }));

      await page.goto(`/login?next=${encodeURIComponent('/app/users')}`);
      await page.getByRole('textbox', { name: 'Email' }).fill('admin@inventory.local');
      await page.getByLabel('Password', { exact: true }).fill('Admin@1234');
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page).toHaveURL('/app/users');
      await expect(page.getByRole('heading', { name: 'All users' })).toBeVisible();
    });

    test('an off-site or auth-page ?next= is ignored', async ({ page }) => {
      await stubApi(page, admin);
      for (const next of ['//evil.example', '/\\evil.example', 'https://evil.example', '/login']) {
        await page.goto(`/login?next=${encodeURIComponent(next)}`);
        await expect(page).toHaveURL('/app/dashboard');
      }
    });

    test('a cold load shows a neutral skeleton, never the shell, while the session check runs', async ({ page }) => {
      await stubApi(page, null);
      let answerMe: () => void = () => {};
      const meAnswered = new Promise<void>((resolve) => (answerMe = resolve));
      await page.route('**/api/auth/me', async (route) => {
        await meAnswered;
        await route.fulfill(unauthorized);
      });

      await page.goto('/app/users');
      await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
      await expect(appShell(page)).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);

      answerMe();
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/app/users')}`);
    });

    test('a session check that fails for another reason shows an error page, not the app or /login', async ({ page }) => {
      await stubApi(page, null);
      await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, json: {} }));

      await page.goto('/app/users');
      await expect(page.getByText('Something went wrong')).toBeVisible();
      await expect(appShell(page)).toHaveCount(0);
    });

    test('a dead refresh cookie on /login shows the sign-in form without a reload loop', async ({ page }) => {
      await stubApi(page, null);
      let meCalls = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/api/auth/me')) meCalls += 1;
      });
      let loads = 0;
      page.on('load', () => (loads += 1));

      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await page.waitForTimeout(1000);

      expect(loads).toBe(1);
      expect(meCalls).toBeLessThanOrEqual(2);
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('signed in', () => {
    for (const [label, me, landing] of [
      ['active admin', admin, '/app/dashboard'],
      ['active staff', staff, '/app/dashboard'],
      ['unverified', unverified, '/verify-email'],
      ['pending', pending, '/awaiting-approval'],
      ['rejected', rejected, '/rejected'],
    ] as const) {
      test(`${label}: guest pages send them to ${landing}`, async ({ page }) => {
        await stubApi(page, me);
        for (const path of ['/login', '/register', '/forgot-password']) {
          await page.goto(path);
          await expect(page).toHaveURL(landing);
        }
      });
    }

    test('a gated user is sent to their gate screen, and ?next= is ignored for them', async ({ page }) => {
      await stubApi(page, pending);

      await page.goto('/app/users');
      await expect(page).toHaveURL('/awaiting-approval');
      await expect(page.getByRole('heading', { name: 'Awaiting approval' })).toBeVisible();

      await page.goto(`/login?next=${encodeURIComponent('/app/users')}`);
      await expect(page).toHaveURL('/awaiting-approval');

      // Another gate's screen is not theirs
      await page.goto('/rejected');
      await expect(page).toHaveURL('/awaiting-approval');
    });

    test('an active user has no gate screen', async ({ page }) => {
      await stubApi(page, staff);
      for (const path of ['/verify-email', '/awaiting-approval', '/rejected']) {
        await page.goto(path);
        await expect(page).toHaveURL('/app/dashboard');
      }
    });

    test('staff on an admin page see "no access" inside the shell, URL unchanged', async ({ page }) => {
      await stubApi(page, staff);
      let usersRequested = false;
      await page.route('**/api/users?*', (route) => {
        usersRequested = true;
        return route.fulfill({ json: emptyUsersPage });
      });

      await page.goto('/app/users');

      await expect(page.getByText("You don't have access to this page")).toBeVisible();
      await expect(appShell(page)).toBeVisible();
      await expect(page).toHaveURL('/app/users');
      expect(usersRequested).toBe(false);
    });

    test('an unknown URL shows "not found" inside the shell, never the dashboard', async ({ page }) => {
      await stubApi(page, admin);
      const notFound = page.getByText('Page not found');
      const dashboard = page.getByRole('heading', { level: 2, name: 'Dashboard' });

      for (const path of ['/app/dahboardd', '/app/users/extra', '/no-such-page']) {
        await page.goto(path);
        await expect(notFound).toBeVisible();
        await expect(appShell(page)).toBeVisible();
        await expect(page).toHaveURL(path);
        await expect(dashboard).toHaveCount(0);
      }

      await page.getByRole('link', { name: 'Go to the dashboard' }).click();
      await expect(page).toHaveURL('/app/dashboard');
    });

    test('staff on an unknown URL also see "not found"', async ({ page }) => {
      await stubApi(page, staff);
      await page.goto('/app/dahboardd');
      await expect(page.getByText('Page not found')).toBeVisible();
      await expect(page).toHaveURL('/app/dahboardd');
    });

    test('/ and /app still open the dashboard', async ({ page }) => {
      await stubApi(page, staff);
      for (const path of ['/', '/app']) {
        await page.goto(path);
        await expect(page).toHaveURL('/app/dashboard');
        await expect(page.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeVisible();
      }
    });

    test('a gated user on an unknown URL goes to their gate screen', async ({ page }) => {
      await stubApi(page, pending);
      for (const path of ['/app/dahboardd', '/no-such-page']) {
        await page.goto(path);
        await expect(page).toHaveURL('/awaiting-approval');
      }
    });

    test('admin opens the admin page', async ({ page }) => {
      await stubApi(page, admin);
      await page.goto('/app/users');
      await expect(page.getByRole('heading', { name: 'All users' })).toBeVisible();
    });

    test('signing out lands on a plain /login, and Back does not show the shell', async ({ page }) => {
      await stubApi(page, admin);
      await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));

      // Two shell pages in history, so Back after signing out has somewhere in the shell to go
      await page.goto('/');
      await page.getByRole('link', { name: 'Users' }).first().click();
      await expect(page.getByRole('heading', { name: 'All users' })).toBeVisible();
      await appShell(page).click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect(page).toHaveURL('/login');

      await page.goBack();
      await expect(page).toHaveURL(/\/login/);
      await expect(appShell(page)).toHaveCount(0);
    });

    test('a session that ends mid-use sends the user to /login, remembering the page', async ({ page }) => {
      await stubApi(page, admin);
      await page.goto('/');
      await expect(appShell(page)).toBeVisible();

      // The session dies: every call is now a 401, and the refresh fails
      await page.route('**/api/users?*', (route) => route.fulfill(unauthorized));
      await page.getByRole('link', { name: 'Users' }).first().click();

      await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/app/users')}`);
    });
  });
});

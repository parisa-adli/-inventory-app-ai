import { expect, test } from '@playwright/test';

const unauthorized = { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } };

test.describe('client smoke', () => {
  // These tests run without a backend: answer the session probe as "logged out" unless a test overrides it
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill(unauthorized));
    await page.route('**/api/auth/refresh', (route) => route.fulfill(unauthorized));
  });

  test('login page renders with Tailwind styles and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      // The stubbed 401 from the session probe is logged by the browser as a failed resource load
      if (msg.type() === 'error' && !/status of 401/.test(msg.text())) errors.push(msg.text());
    });

    await page.goto('/login');

    const title = page.getByRole('heading', { level: 1, name: 'Sign in' });
    await expect(title).toBeVisible();

    // text-lg font-semibold => Tailwind CSS is compiled and applied
    await expect(title).toHaveCSS('font-size', '18px');
    await expect(title).toHaveCSS('font-weight', '600');

    expect(errors).toEqual([]);
  });

  test('unauthenticated visit to a protected page ends on the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('sign in page matches the design: Email | Telegram tabs, password eye toggle, sign up link', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('tab', { name: 'Email' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register');

    const password = page.locator('input[name="password"]');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('telegram sign in shows a QR code, counts down and polls until the bot approves', async ({ page }) => {
    const user = { id: '1', name: 'Tele User', email: 'tele@x.com', role: 'staff', status: 'active', emailVerified: true };
    const deepLink = 'https://t.me/inventory_test_bot?start=login_abc';

    await page.route('**/api/auth/telegram/login', (route) =>
      route.fulfill({
        status: 201,
        json: { deepLink, pollToken: 'poll-secret', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() },
      })
    );
    let polls = 0;
    await page.route('**/api/auth/telegram/login/poll', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ pollToken: 'poll-secret' });
      polls += 1;
      if (polls < 2) return route.fulfill({ json: { status: 'pending' } });
      // From here on the session probe sees the logged-in user
      await page.route('**/api/auth/me', (r) => r.fulfill({ json: user }));
      return route.fulfill({ json: { status: 'approved', user } });
    });

    await page.goto('/login');
    await page.getByRole('tab', { name: 'Telegram' }).click();

    await expect(page.getByRole('img', { name: 'Telegram QR code' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Telegram' })).toHaveAttribute('href', deepLink);
    await expect(page.getByText(/Scan the QR code or open the link on your phone/)).toBeVisible();
    await expect(page.getByRole('timer')).toHaveText(/Expires in [0-4]:\d{2}/);
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();

    await expect(page).toHaveURL(/\/$/);
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  test('telegram sign in offers a fresh code when the QR code expired or is unlinked', async ({ page }) => {
    let starts = 0;
    await page.route('**/api/auth/telegram/login', (route) => {
      starts += 1;
      return route.fulfill({
        status: 201,
        json: {
          deepLink: `https://t.me/inventory_test_bot?start=login_${starts}`,
          pollToken: `poll-${starts}`,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      });
    });
    await page.route('**/api/auth/telegram/login/poll', (route) =>
      route.fulfill({ json: { status: 'unlinked' } })
    );

    await page.goto('/login');
    await page.getByRole('tab', { name: 'Telegram' }).click();
    await expect(page.getByText('This Telegram account is not linked to an account yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Start over' }).click();
    await expect.poll(() => starts).toBe(2);
  });

  test('sign up page has Email | Telegram tabs, a confirm password field and a sign in link', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Email' })).toHaveAttribute('data-state', 'active');
    // The tab panel is labelled "Email" too, so address the inputs by name
    for (const name of ['name', 'email', 'password', 'confirmPassword']) {
      await expect(page.locator(`input[name="${name}"]`)).toBeVisible();
    }
    await expect(page.getByText('At least 8 characters.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');

    await page.locator('input[name="name"]').fill('Ada');
    await page.locator('input[name="email"]').fill('ada@example.com');
    await page.locator('input[name="password"]').fill('longenough1');
    await page.locator('input[name="confirmPassword"]').fill('different11');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('sign up Telegram tab shows the bot link as a QR code when the bot handle is configured', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('tab', { name: 'Telegram' }).click();

    // Without VITE_TELEGRAM_BOT_USERNAME the panel falls back to plain instructions
    const open = page.getByRole('link', { name: 'Open Telegram' });
    if (await open.count()) {
      await expect(open).toHaveAttribute('href', /^https:\/\/t\.me\/\w+\?start=signup$/);
      await expect(page.getByRole('img', { name: 'Telegram QR code' })).toBeVisible();
    } else {
      await expect(page.getByText('send /start to sign up')).toBeVisible();
    }
  });

  test('the link-telegram confirmation shows the Telegram message', async ({ page }) => {
    await page.route('**/api/auth/verify-email/*', (route) =>
      route.fulfill({ json: { type: 'link-telegram', message: 'Telegram linked.' } })
    );
    await page.goto('/verify-email/some-token');
    await expect(page.getByText('Your Telegram account is linked.')).toBeVisible();
  });

  test('app shell routes and navigates client-side', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // No backend in this test: pretend an active user is logged in
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: { id: '1', name: 'Test Admin', email: 'a@x.com', role: 'admin', status: 'active', emailVerified: true },
      })
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeVisible();

    const nav = page.getByRole('navigation');
    for (const name of ['Dashboard', 'Products', 'Categories', 'Suppliers']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test('uses the shadcn theme variables', async ({ page }) => {
    await page.goto('/login');
    // body { @apply bg-background text-foreground } resolves the theme variables (Tailwind 4 emits oklch)
    await expect(page.locator('body')).toHaveCSS('background-color', 'oklch(1 0 0)');
  });
});

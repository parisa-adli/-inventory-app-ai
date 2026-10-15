import { expect, test, type Page } from '@playwright/test';

// Profile page (CONTRACT-CHANGES C13, docs/design/profile.png) against a mocked API: no backend runs here.

const unauthorized = { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } };

const baseUser = {
  id: '1',
  name: 'Parisa Adli',
  email: 'parisa@inventory.local',
  role: 'staff',
  status: 'active',
  emailVerified: true,
  mustChangePassword: false,
};
const telegramOnly = { ...baseUser, hasPassword: false, telegramLinked: true, telegramUsername: 'parisadev' };
const passwordOnly = { ...baseUser, hasPassword: true, telegramLinked: false, telegramUsername: null };
const both = { ...baseUser, hasPassword: true, telegramLinked: true, telegramUsername: 'parisadev' };

const now = new Date().toISOString();
const sessions = {
  items: [
    { id: 'a', device: 'Chrome on Windows', ip: '65.109.250.250', signedInAt: now, lastActiveAt: now, current: true },
    { id: 'b', device: 'Firefox on macOS', ip: '10.0.0.2', signedInAt: now, lastActiveAt: now, current: false },
  ],
};

/** Signed in as `user`; GET /me answers whatever `current()` returns, so a mutation can change it. */
const signedInAs = async (page: Page, user: object) => {
  let current = user;
  await page.route('**/api/auth/refresh', (route) => route.fulfill(unauthorized));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: current }));
  await page.route('**/api/auth/sessions', (route) => route.fulfill({ json: sessions }));
  return (next: object) => {
    current = next;
  };
};

test.describe('profile', () => {
  test('shows the account, sign-in methods and sessions from the design', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await signedInAs(page, telegramOnly);

    await page.goto('/app/profile');

    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.getByLabel('Display name')).toHaveValue('Parisa Adli');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(page.getByText('parisa@inventory.local')).toBeVisible();
    await expect(page.getByText('Verified', { exact: true })).toBeVisible();

    await expect(page.getByText('Not set')).toBeVisible();
    await expect(page.getByText('Linked as @parisadev')).toBeVisible();
    // Telegram is the only way in: it cannot be unlinked
    await expect(page.getByRole('button', { name: 'Unlink Telegram' })).toBeDisabled();
    await expect(page.getByText('Your only way to sign in — add another before removing it.')).toBeVisible();

    await expect(page.getByText('Chrome on Windows')).toBeVisible();
    await expect(page.getByText('This device')).toHaveCount(1);
    await expect(page.getByText('65.109.250.250 · Active just now · Signed in just now')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('renames the user', async ({ page }) => {
    await signedInAs(page, passwordOnly);
    let sent: unknown;
    await page.route('**/api/auth/me', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      sent = route.request().postDataJSON();
      return route.fulfill({ json: { user: { ...passwordOnly, name: 'New Name' } } });
    });

    await page.goto('/app/profile');
    await page.getByLabel('Display name').fill('New Name');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Display name saved').first()).toBeVisible();
    expect(sent).toEqual({ name: 'New Name' });
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('a Telegram-only user adds a password, after which Telegram can be unlinked', async ({ page }) => {
    await signedInAs(page, telegramOnly);
    let sent: unknown;
    await page.route('**/api/auth/password/set', (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ json: { user: both } });
    });

    await page.goto('/app/profile');
    await page.getByRole('button', { name: 'Add password' }).click();
    await expect(page.getByText('At least 10 characters, with a letter and a digit.')).toBeVisible();
    await page.getByLabel('New password').fill('N3w-password-here');
    await page.getByRole('button', { name: 'Add password' }).click();

    await expect(page.getByText('Password added').first()).toBeVisible();
    expect(sent).toEqual({ newPassword: 'N3w-password-here' });
    await expect(page.getByText('Set', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unlink Telegram' })).toBeEnabled();
  });

  test('removing the password asks first', async ({ page }) => {
    await signedInAs(page, both);
    let removed = false;
    await page.route('**/api/auth/password', (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      removed = true;
      return route.fulfill({ json: { user: telegramOnly } });
    });

    await page.goto('/app/profile');
    await page.getByRole('button', { name: 'Remove password' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Remove your password?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(removed).toBe(false);

    await page.getByRole('button', { name: 'Remove password' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove password' }).click();

    await expect(page.getByText('Password removed').first()).toBeVisible();
    expect(removed).toBe(true);
    await expect(page.getByText('Not set')).toBeVisible();
  });

  test('links Telegram through the QR code and the code from the bot', async ({ page }) => {
    const setUser = await signedInAs(page, passwordOnly);
    await page.route('**/api/auth/telegram/link', (route) =>
      route.fulfill({
        status: 201,
        json: { deepLink: 'https://t.me/inventory_test_bot?start=abc', expiresAt: new Date(Date.now() + 300_000).toISOString() },
      })
    );
    let polls = 0;
    await page.route('**/api/auth/telegram/status', (route) =>
      route.fulfill({
        json:
          ++polls < 2
            ? { status: 'PENDING' }
            : {
                status: 'AWAITING_OTP',
                otpExpiresAt: new Date(Date.now() + 120_000).toISOString(),
                resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
              },
      })
    );
    await page.route('**/api/auth/telegram/verify', (route) => {
      setUser(both);
      return route.fulfill({ json: { status: 'COMPLETED', user: both } });
    });

    await page.goto('/app/profile');
    await page.getByRole('button', { name: 'Link Telegram' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('img', { name: 'Telegram QR code' })).toBeVisible();
    await expect(dialog.getByText('Enter the code to link this Telegram account to your profile.')).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('6-digit verification code').fill('123456');

    await expect(page.getByText('Telegram linked').first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Linked as @parisadev')).toBeVisible();
  });

  test('sign out everywhere asks first, then lands on a plain /login', async ({ page }) => {
    await signedInAs(page, both);
    let signedOut = false;
    await page.route('**/api/auth/sessions', (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      signedOut = true;
      return route.fulfill({ status: 204 });
    });

    await page.goto('/app/profile');
    await page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out everywhere' }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(signedOut).toBe(true);
  });
});

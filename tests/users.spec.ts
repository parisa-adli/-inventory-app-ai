import { expect, test, type Page } from '@playwright/test';

const admin = {
  id: 'a1',
  name: 'Admin',
  email: 'admin@inventory.local',
  role: 'admin',
  status: 'active',
  emailVerified: true,
};
const staff = { ...admin, id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff' };

const pendingUser = (overrides: Record<string, unknown>) => ({
  role: 'staff',
  status: 'pending',
  telegramLinked: false,
  createdAt: '2026-03-01T10:00:00.000Z',
  ...overrides,
});

const verified = pendingUser({ id: 'u1', name: 'Vera Verified', email: 'vera@inventory.local', emailVerified: true });
const unverified = pendingUser({ id: 'u2', name: 'Uli Unverified', email: 'uli@inventory.local', emailVerified: false });

const page1 = (items: unknown[], totalPages = 1) => ({
  items,
  page: 1,
  limit: 10,
  total: items.length,
  totalPages,
});

const signInAs = async (page: Page, user: unknown) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
};

test.describe('admin users page (stubbed API)', () => {
  test('lists pending users; activate is disabled with a tooltip while the email is unverified', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([verified, unverified]) }));

    await page.goto('/users');

    await expect(page.getByRole('heading', { name: 'Pending users' })).toBeVisible();
    const verifiedRow = page.getByRole('row', { name: /Vera Verified/ });
    const unverifiedRow = page.getByRole('row', { name: /Uli Unverified/ });
    await expect(verifiedRow.getByRole('button', { name: 'Activate' })).toBeEnabled();
    await expect(unverifiedRow.getByRole('button', { name: /Activate/ })).toBeDisabled();

    await unverifiedRow.getByRole('button', { name: /Activate/ }).locator('..').hover();
    await expect(page.getByRole('tooltip').first()).toContainText('has not verified their email');
  });

  test('activating sends the PATCH, toasts and refreshes the list', async ({ page }) => {
    await signInAs(page, admin);
    let activated = false;
    await page.route('**/api/users?*', (route) =>
      route.fulfill({ json: page1(activated ? [unverified] : [verified, unverified]) })
    );
    await page.route('**/api/users/u1/activate', (route) => {
      activated = true;
      return route.fulfill({ json: { ...verified, status: 'active' } });
    });

    await page.goto('/users');
    await page.getByRole('row', { name: /Vera Verified/ }).getByRole('button', { name: 'Activate' }).click();

    await expect(page.getByText('Vera Verified was activated')).toBeVisible();
    await expect(page.getByRole('row', { name: /Vera Verified/ })).toHaveCount(0);
  });

  test('rejecting asks for confirmation first', async ({ page }) => {
    await signInAs(page, admin);
    let rejectCalls = 0;
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([unverified]) }));
    await page.route('**/api/users/u2/reject', (route) => {
      rejectCalls += 1;
      return route.fulfill({ json: { ...unverified, status: 'rejected' } });
    });

    await page.goto('/users');
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(rejectCalls).toBe(0);

    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Reject user' }).click();
    await expect(page.getByText('Uli Unverified was rejected')).toBeVisible();
    expect(rejectCalls).toBe(1);
  });

  test('shows the server error as a toast when activation is refused', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([verified]) }));
    await page.route('**/api/users/u1/activate', (route) =>
      route.fulfill({
        status: 400,
        json: { error: { code: 'EMAIL_NOT_VERIFIED', message: 'This user has not verified their email address yet.' } },
      })
    );

    await page.goto('/users');
    await page.getByRole('button', { name: 'Activate' }).click();

    await expect(page.getByText('This user has not verified their email address yet.')).toBeVisible();
  });

  test('shows an empty state', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([]) }));

    await page.goto('/users');

    await expect(page.getByText('No users are waiting for approval.')).toBeVisible();
  });

  test('staff do not see the Users link and are redirected away from /users', async ({ page }) => {
    await signInAs(page, staff);

    await page.goto('/users');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  });

  test('admins see the Users link in the nav', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([]) }));

    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
  });
});

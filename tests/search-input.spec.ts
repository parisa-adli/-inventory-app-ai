import { expect, test } from '@playwright/test';

// The shared debounced search box (components/SearchInput.tsx), on the Categories page with a stubbed API.

const admin = { id: 'a1', name: 'Admin', email: 'admin@inventory.local', role: 'admin', status: 'active', emailVerified: true };

test('back and forward restore the search box', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: admin }));
  // The admin nav's pending-users count
  await page.route('**/api/users?*', (route) =>
    route.fulfill({ json: { items: [], page: 1, limit: 1, total: 0, totalPages: 1 } }),
  );
  await page.route(/\/api\/categories(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], page: 1, limit: 12, total: 0, totalPages: 1 } }),
  );

  await page.goto('/app/categories');
  const box = page.getByLabel('Search');
  // A sort change pushes a history entry; typing then replaces it
  await page.getByRole('combobox', { name: 'Sort by' }).click();
  await page.getByRole('option', { name: 'Name A→Z' }).click();
  await expect(page).toHaveURL(/sort=name/);
  await box.fill('elec');
  await expect(page).toHaveURL(/search=elec/);

  await page.goBack();
  await expect(page).not.toHaveURL(/sort=name/);
  await expect(box).toHaveValue('');

  await page.goForward();
  await expect(box).toHaveValue('elec');
  await expect(page).toHaveURL(/search=elec/);
});

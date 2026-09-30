const {test, expect} = require('@playwright/test');

const username = process.env.FAMILY_VAULT_TEST_USERNAME;
const password = process.env.FAMILY_VAULT_TEST_PASSWORD;

test.beforeEach(async ({page}) => {
  test.skip(!username || !password, 'Set FAMILY_VAULT_TEST_USERNAME and FAMILY_VAULT_TEST_PASSWORD.');
  await page.goto('/');
  await page.getByRole('textbox', {name: 'Username'}).fill(username);
  await page.getByRole('textbox', {name: 'Password'}).fill(password);
  await page.getByRole('button', {name: 'Sign in'}).click();
  await expect(page.getByRole('region', {name: 'Interactive family knowledge graph'})).toBeVisible();
});

test('authenticated tree renders without runtime errors', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByText(/family members shown/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test('theme toggle updates theme and switch state', async ({page}) => {
  const toggle = page.getByRole('switch', {name: /theme/i});
  const before = await page.locator('html').getAttribute('data-theme');
  await toggle.click();
  const after = await page.locator('html').getAttribute('data-theme');
  expect(after).not.toBe(before);
  await expect(toggle).toHaveAttribute('aria-checked', String(after === 'light'));
});

test('search highlights a matching family member', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const search = page.getByRole('searchbox', {name: 'Search'});
  await search.fill('Asha');
  await expect(page.getByText(/match(?:es)? highlighted/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test('add member opens the proposal panel', async ({page}) => {
  await page.getByRole('button', {name: /Add family member/i}).click();
  await expect(page.getByRole('complementary', {name: 'Family member panel'})).toBeVisible();
  await expect(page.locator('#personForm')).toBeVisible();
  await expect(page.locator('#genderSelect')).toBeVisible();
});

test('admin profile exposes administration actions', async ({page}) => {
  await page.getByRole('button', {name: 'Open account profile'}).click();
  await expect(page.getByRole('menu')).toContainText('Manage Approvals');
  await expect(page.getByRole('menu')).toContainText('Manage Users');
});

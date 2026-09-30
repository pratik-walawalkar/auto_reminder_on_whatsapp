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

test('layout settings panel shows only the current view controls', async ({page}) => {
  const panel = page.getByRole('complementary', {name: 'Appearance and layout settings'});
  await page.getByRole('button', {name: 'Layout'}).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Classic Tree spacing')).toBeVisible();
  await expect(panel.getByText('Organic physics')).toBeHidden();
  await page.getByRole('button', {name: 'Classic Tree'}).click();
  await expect(panel.getByText('Classic Tree spacing')).toBeVisible();
  await expect(panel.getByText('Organic physics')).toBeHidden();
  await page.getByRole('button', {name: 'Layout'}).click();
  await page.getByRole('button', {name: 'Organic'}).click();
  await page.getByRole('button', {name: 'Layout'}).click();
  await expect(panel.getByText('Organic physics')).toBeVisible();
  await expect(panel.getByText('Classic Tree spacing')).toBeHidden();
});

test('Organic physics can be turned off while nodes remain movable', async ({page}) => {
  await page.getByRole('button', {name: 'Layout'}).click();
  await page.getByLabel('Behavior').selectOption('off');
  await expect(page.getByRole('region', {name: 'Interactive family knowledge graph'})).toBeVisible();
  await expect(page.getByText(/family members shown/i)).toBeVisible();
  await expect(page.locator('#treeCanvas canvas')).toHaveCount(1);
  const interactionContract = await page.evaluate(async () => {
    const source = await (await fetch('/static/app.js')).text();
    const checkbox = document.querySelector('#showEdgeLabelsInput');
    return {organicDragEnabled: source.includes("dragNodes: !classicTree"), capturesPositionsBeforeRerender: source.includes('captureCurrentOrganicPositions();'), checkboxSize: [checkbox.offsetWidth, checkbox.offsetHeight]};
  });
  expect(interactionContract.organicDragEnabled).toBeTruthy();
  expect(interactionContract.capturesPositionsBeforeRerender).toBeTruthy();
  expect(interactionContract.checkboxSize).toEqual([16, 16]);
  const hubDistances = await page.evaluate(() => network.body.data.nodes.get().filter(node => String(node.id).startsWith('hub_')).map(hub => {
    const parts = String(hub.id).slice(4).split('_');
    const parentPositions = parts.map(id => network.getPositions([id])[id]).filter(Boolean);
    return parentPositions.length === 2 ? Math.hypot(hub.x - (parentPositions[0].x + parentPositions[1].x) / 2, hub.y - (parentPositions[0].y + parentPositions[1].y) / 2) : 0;
  }));
  expect(Math.max(...hubDistances)).toBeLessThan(200);
  await page.getByLabel('Behavior').selectOption('gentle');
  await expect.poll(() => page.evaluate(() => network?.physics?.physicsEnabled)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await (await fetch('/static/app.js')).text()).includes("if (mode !== 'off')"))).toBeTruthy();
});

test('classic layout preset persists and can be reset', async ({page}) => {
  await page.getByRole('button', {name: 'Classic Tree'}).click();
  await page.getByRole('button', {name: 'Layout'}).click();
  const panel = page.getByRole('complementary', {name: 'Appearance and layout settings'});
  await panel.getByLabel('Preset').selectOption('spacious');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('familyVaultTreeSettings')).preset)).toBe('spacious');
  await page.getByRole('button', {name: 'Reset defaults'}).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('familyVaultTreeSettings')).preset)).toBe('balanced');
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

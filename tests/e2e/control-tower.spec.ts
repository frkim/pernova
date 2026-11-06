import { expect, test } from '@playwright/test';

test('executive control tower completes the human approval journey', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const launch = page.getByRole('button', { name: /Lancer l.*analyse/i });
  await expect(launch).toBeEnabled();
  const createdResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/workflows') && response.request().method() === 'POST',
  );
  await launch.click();
  const response = await createdResponse;
  expect(response.status()).toBe(202);
  const workflow = (await response.json()) as { id: string };
  await expect(page.getByLabel('Motif de la décision')).toBeEnabled();
  await page.getByLabel('Motif de la décision').fill('Validation du plan de mitigation synthétique par le responsable');
  await page.getByRole('button', { name: 'Approuver le plan' }).click();
  await expect(page.getByText('TRANSFERT SIMULÉ CRÉÉ', { exact: true })).toBeVisible();
  await expect(page.getByText('Décision enregistrée', { exact: true })).toBeVisible();
  const persisted = await request.get(`/api/workflows/${workflow.id}`);
  expect(((await persisted.json()) as { status: string }).status).toBe('completed');
  await page.reload();
  await expect(page.getByText('TRANSFERT SIMULÉ CRÉÉ', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile layout remains readable without viewport overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Lancer l.*analyse/i })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
});

test('built UI works behind the backend content security policy', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(testInfo.config.metadata.apiOrigin as string);
  await expect(page.getByRole('button', { name: /Lancer l.*analyse/i })).toBeEnabled();
  await page.getByRole('button', { name: 'Gouvernance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gouvernance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(errors).toEqual([]);
});

test('theme persists and knowledge search uses the governed API', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.getByLabel('Rechercher dans la base de connaissances').fill('stock');
  const search = page.waitForResponse(
    (response) => response.url().endsWith('/api/knowledge/search') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  const response = await search;
  expect(response.ok()).toBe(true);
  const results = (await response.json()) as { items: { title: string }[] };
  expect(results.items.length).toBeGreaterThan(0);
  await expect(page.getByText(results.items[0].title, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'FinOps', exact: true }).click();
  await expect(page.getByRole('button', { name: 'FinOps', exact: true })).toHaveAttribute('aria-current', 'page');
});

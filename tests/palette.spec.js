import { test, expect } from '@playwright/test';

test('actual page colours switch and persist across routes, reloads and tabs', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('./');
  const button = page.locator('#themeToggle');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(0, 0, 0)');
  await expect(button).toHaveAccessibleName('Включить белую тему');
  await button.click();
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('color','rgb(17, 17, 17)');
  await expect(page.locator('#contact')).toHaveCSS('background-color','rgb(21, 21, 21)');
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content','#ffffff');
  await expect(button.locator('.moon')).toBeVisible(); await expect(button.locator('.sun')).toBeHidden();
  await page.goto('./#/ladoga'); await page.reload();
  await expect(page.locator('.series-hero h1')).toHaveText('Ladoga');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');
  const other = await context.newPage(); await other.goto(page.url());
  await other.getByRole('button',{name:'Включить чёрную тему'}).click();
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(0, 0, 0)');
});
test('switch still works when storage is unavailable', async ({ page }) => {
  await page.emulateMedia({ colorScheme:'light', reducedMotion:'reduce' });
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await page.goto('./');
  await page.locator('#themeToggle').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');
});
test('every discussion button opens the contact section', async ({ page }) => {
  await page.setViewportSize({width:375,height:812}); await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  const links = page.getByRole('link', {name:'Обсудить съёмку',exact:true});
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) await expect(link).toHaveAttribute('href','#contact');
  await page.goto('./#/edinburgh'); await page.locator('.series-next .btn').click();
  await expect(page.locator('#contactTelegram')).toBeInViewport();
  await expect(page.locator('#contactInstagram')).toBeInViewport();
});

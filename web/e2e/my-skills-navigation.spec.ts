import { expect, test } from '@playwright/test'
import { setEnglishLocale } from './helpers/auth-fixtures'
import { registerSession } from './helpers/session'
import { E2eTestDataBuilder } from './helpers/test-data-builder'

test.describe('My Skills Navigation (Real API)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setEnglishLocale(page)
    await registerSession(page, testInfo)
  })

  test('shows a localized title while navigating with the original skill slug', async ({ page }, testInfo) => {
    const builder = new E2eTestDataBuilder(page, testInfo)
    await builder.init()

    try {
      const namespace = await builder.ensureWritableNamespace()
      const displayName = '纸鸢制作小助手'
      const skill = await builder.publishSkill(namespace.slug, { displayName })

      await page.goto('/dashboard/skills')
      await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible()

      await expect(page.getByRole('heading', { name: displayName, exact: true })).toBeVisible()
      await page.getByRole('heading', { name: displayName, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/space/${skill.namespace}/${skill.slug}\\?returnTo=%2Fdashboard%2Fskills$`))

      await expect(page.getByRole('heading', { name: displayName, exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page).toHaveURL('/dashboard/skills')
    } finally {
      await builder.cleanup()
    }
  })
})

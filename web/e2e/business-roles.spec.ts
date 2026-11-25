import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { setEnglishLocale } from './helpers/auth-fixtures'
import { createFreshSession, loginWithCredentials } from './helpers/session'
import { csrfHeaders } from './helpers/csrf'
import { E2eTestDataBuilder } from './helpers/test-data-builder'

// Explicitly opt in: fixture graphs and visibility are seeded only in a labeled disposable local database.
const container = process.env.SKILLHUB_ROLE_E2E_PG_CONTAINER
const captureDir = process.env.SKILLHUB_ROLE_E2E_SCREENSHOTS

test('business roles: real browser edit, clear, discovery, paging, favorites and source ACLs', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(!container, 'Requires the dedicated disposable business-role-ui PostgreSQL container')
  test.setTimeout(180_000)
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
  const label = execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "skillhub-task"}}', container!], { encoding: 'utf8' }).trim()
  expect(label).toBe('business-role-ui')
  await page.addInitScript(() => {
    if (!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng', 'en')
  })
  await page.setViewportSize({ width: 1440, height: 1080 })
  await loginWithCredentials(page, {
    username: process.env.E2E_ADMIN_USERNAME ?? 'admin',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe!2026',
  }, testInfo)
  const builder = new E2eTestDataBuilder(page, testInfo)
  await builder.init()
  const suffix = Date.now().toString(36)
  const skills: Array<{ skillId: number; slug: string; versionId: number }> = []
  const suites: Array<{ id: number; versionId: number; slug: string }> = []
  const rolePath = (type: string, slug: string) => `/api/web/${type}/global/${slug}/business-roles`
  const setRoles = async (type: string, slug: string, businessRoles: string[]) => {
    const response = await page.request.put(rolePath(type, slug), { data: { businessRoles }, headers: await csrfHeaders(page) })
    expect(response.ok(), await response.text()).toBeTruthy()
  }
  const sql = (text: string) => execFileSync('docker', ['exec', '-i', container!, 'psql', '-U', 'skillhub', '-d', 'skillhub', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q'], { input: text })
  const capture = async (name: string, target?: ReturnType<Page['locator']>) => {
    if (!captureDir) return
    mkdirSync(captureDir, { recursive: true })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined))))
    if (target) {
      await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
      await target.screenshot({ path: path.join(captureDir, name), animations: 'disabled' })
    } else await page.screenshot({ path: path.join(captureDir, name), fullPage: false, animations: 'disabled' })
  }
  try {
    // Use real package storage and private publication; clone its graph for pagination below.
    // This role E2E does not disable or bypass the production public security-scanning policy.
    for (const index of [0, 14]) {
      const slug = `role-ui-${suffix}-${index}`
      const file = builder.createSkillPackageFile({ name: slug,
        displayName: index === 0 ? 'Business Role Demo' : index === 14 ? 'Private Favorite' : `Sales Skill ${index}` })
      const response = await page.request.post('/api/web/skills/global/publish', { headers: await csrfHeaders(page),
        multipart: { file: { name: 'skill.zip', mimeType: 'application/zip', buffer: readFileSync(file) }, visibility: 'PRIVATE' } })
      expect(response.ok(), await response.text()).toBeTruthy()
      const result = (await response.json()).data as { skillId: number; slug: string }
      const detail = (await (await page.request.get(`/api/web/skills/global/${slug}`)).json()).data as { headlineVersion: { id: number } }
      skills[index] = { ...result, versionId: detail.headlineVersion.id }
    }
    // Clone the already-published fixture graph locally for pagination, rather than exhausting
    // the real upload rate limit. Role mutations and all user-visible checks still use HTTP.
    for (let index = 1; index < 14; index++) {
      const slug = `role-ui-${suffix}-${index}`
      const source = skills[0]!
      const rows = sql(`DO $fixture$ DECLARE sid BIGINT; vid BIGINT; BEGIN
        INSERT INTO skill(namespace_id,slug,display_name,summary,owner_id,visibility,status,created_by)
          SELECT namespace_id,'${slug}','Sales Skill ${index}',summary,owner_id,'PRIVATE',status,created_by
          FROM skill WHERE id=${Number(source.skillId)} RETURNING id INTO sid;
        INSERT INTO skill_version(skill_id,version,status,parsed_metadata_json,manifest_json,file_count,total_size,
          download_ready,bundle_ready,published_at,created_by)
          SELECT sid,version,status,parsed_metadata_json,manifest_json,file_count,total_size,download_ready,bundle_ready,
          published_at,created_by FROM skill_version WHERE id=${Number(source.versionId)} RETURNING id INTO vid;
        UPDATE skill SET latest_version_id=vid WHERE id=sid;
        INSERT INTO skill_file(version_id,file_path,file_size,content_type,sha256,storage_key)
          SELECT vid,file_path,file_size,content_type,sha256,storage_key FROM skill_file WHERE version_id=${Number(source.versionId)};
        END $fixture$;
        SELECT json_build_object('skillId',id,'slug',slug,'versionId',latest_version_id) FROM skill WHERE slug='${slug}';`)
      skills[index] = JSON.parse(rows.toString().trim()) as typeof source
    }
    for (const [index, title] of ['Sales Toolkit', 'Private Toolkit'].entries()) {
      const member = skills[index === 0 ? 0 : 14]!
      const slug = `role-suite-${suffix}-${index}`
      const selection = { skillVersionId: member.versionId, namespace: 'global', slug: member.slug, version: '1.0.0' }
      const response = await page.request.post('/api/web/suites', { headers: await csrfHeaders(page), data: {
        namespace: 'global', slug, displayName: title, summary: 'Business role browser verification',
        overview: '# Business role workflow\n\nDiscover the right skills for your team.', version: '1.0.0', visibility: 'PRIVATE',
        entrySkill: selection, members: [selection],
      } })
      expect(response.ok(), await response.text()).toBeTruthy()
      const suite = (await response.json()).data as { id: number; versionId: number; slug: string }
      suites.push(suite)
      const published = await page.request.post(`/api/web/suites/${suite.id}/versions/${suite.versionId}/publish`, { headers: await csrfHeaders(page) })
      expect(published.ok(), await published.text()).toBeTruthy()
    }
    const publicIds = skills.slice(0, 14).map(skill => Number(skill.skillId)).join(',')
    sql(`UPDATE skill SET visibility='PUBLIC' WHERE id IN (${publicIds}); UPDATE skill_suite_version SET visibility='PUBLIC' WHERE id=${Number(suites[0]!.versionId)};`)
    const rebuild = await page.request.post('/api/v1/admin/search/rebuild', { headers: await csrfHeaders(page) })
    expect(rebuild.ok(), await rebuild.text()).toBeTruthy()
    for (const skill of skills.slice(1, 14)) await setRoles('skills', skill.slug, ['ExampleTeam-sales'])
    await setRoles('skills', skills[14]!.slug, ['ExampleTeam-leadership'])
    await setRoles('suites', suites[1]!.slug, ['ExampleTeam-leadership'])
    await expect.poll(async () => (await (await page.request.get('/api/web/skills?businessRole=ExampleTeam-sales&size=100')).json()).data.total).toBe(13)

    const options = (await (await page.request.get('/api/web/business-roles/options')).json()).data
    expect(options).toEqual([
      { key: 'ExampleTeam-engineering', name: 'Engineering' }, { key: 'ExampleTeam-sales', name: 'Sales' },
      { key: 'ExampleTeam-delivery', name: 'Support' }, { key: 'ExampleTeam-leadership', name: 'Leadership' },
    ])
    for (const [type, slug] of [['skills', skills[0]!.slug], ['suites', suites[0]!.slug]]) {
      for (const key of ['sales', 'exampleteam-sales', 'ExampleTeam-unknown']) {
        const invalid = await page.request.put(rolePath(type!, slug!), { data: { businessRoles: [key] }, headers: await csrfHeaders(page) })
        expect(invalid.status(), await invalid.text()).toBe(400)
      }
    }
    await page.goto(`/space/global/${skills[0]!.slug}`)
    const panel = page.getByTestId('business-roles-panel')
    await expect(panel.getByText('No business roles assigned.')).toBeVisible()
    await panel.getByRole('button', { name: 'Edit roles' }).click()
    await expect(panel.getByRole('textbox')).toHaveCount(0)
    await expect(panel.getByRole('checkbox')).toHaveCount(4)
    for (const name of ['Sales', 'Support']) await panel.getByLabel(name, { exact: true }).check()
    await panel.getByRole('button', { name: 'Save roles' }).click()
    await expect(panel.getByRole('link', { name: 'Support', exact: true })).toBeVisible()
    await expect(panel).not.toContainText('ExampleTeam-')
    await expect(panel.getByRole('link', { name: 'Sales', exact: true })).toHaveAttribute('href', /businessRole=ExampleTeam-sales/)
    await page.reload()
    await expect(panel.getByRole('link', { name: 'Sales', exact: true })).toBeVisible()
    const stored = (await (await page.request.get(rolePath('skills', skills[0]!.slug))).json()).data.businessRoles
    expect(stored).toEqual(['ExampleTeam-delivery', 'ExampleTeam-sales'])
    await panel.getByRole('button', { name: 'Edit roles' }).click()
    await panel.getByRole('button', { name: 'Clear all roles' }).click()
    await panel.getByRole('button', { name: 'Cancel' }).click()
    await expect(panel.getByRole('link', { name: 'Sales', exact: true })).toBeVisible()
    // A legacy key remains readable but must be explicitly removed before a new replacement.
    sql(`INSERT INTO company_skill_business_role(skill_id,role_key) VALUES (${Number(skills[0]!.skillId)},'retired-role');`)
    await page.reload()
    await panel.getByRole('button', { name: 'Edit roles' }).click()
    await expect(panel.getByRole('alert')).toContainText('no longer configured')
    await expect(panel.getByRole('button', { name: 'Save roles' })).toBeDisabled()
    await panel.getByRole('button', { name: 'Remove retired-role' }).click()
    await panel.getByRole('button', { name: 'Clear all roles' }).click()
    await panel.getByRole('button', { name: 'Save roles' }).click()
    await expect(panel.getByText('No business roles assigned.')).toBeVisible()
    await panel.getByRole('button', { name: 'Edit roles' }).click()
    for (const name of ['Sales', 'Support']) await panel.getByLabel(name, { exact: true }).check()
    await panel.getByRole('button', { name: 'Save roles' }).click()
    await expect(panel.getByRole('link', { name: 'Sales', exact: true })).toBeVisible()

    await page.goto(`/dashboard/suites/global/${suites[0]!.slug}`)
    const suitePanel = page.getByTestId('business-roles-panel')
    await suitePanel.getByRole('button', { name: 'Edit roles' }).click()
    for (const name of ['Sales', 'Support']) await suitePanel.getByLabel(name, { exact: true }).check()
    await suitePanel.getByRole('button', { name: 'Save roles' }).click()
    await expect(suitePanel.getByRole('link', { name: 'Sales', exact: true })).toBeVisible()
    await suitePanel.getByRole('button', { name: 'Edit roles' }).click()
    await suitePanel.getByRole('button', { name: 'Clear all roles' }).click()
    await suitePanel.getByRole('button', { name: 'Save roles' }).click()
    await expect(suitePanel.getByText('No business roles assigned.')).toBeVisible()
    await suitePanel.getByRole('button', { name: 'Edit roles' }).click()
    for (const name of ['Sales', 'Support']) await suitePanel.getByLabel(name, { exact: true }).check()
    await suitePanel.getByRole('button', { name: 'Save roles' }).click()
    await expect(suitePanel.getByRole('link', { name: 'Sales', exact: true })).toBeVisible()

    await page.goto('/search?businessRole=ExampleTeam-sales')
    await expect(page.getByRole('heading', { name: /Sales Skill|Business Role Demo/ })).toHaveCount(12)
    const secondPage = await page.request.get('/api/web/skills?businessRole=ExampleTeam-sales&page=1&size=12')
    const next = (await secondPage.json()).data as { total: number; items: Array<{ slug: string }> }
    expect(next.total).toBe(14); expect(next.items).toHaveLength(2)
    await page.goto('/search?businessRole=ExampleTeam-sales&page=1')
    await expect(page.getByRole('heading', { name: /Sales Skill|Business Role Demo/ })).toHaveCount(2)
    await page.reload(); await expect(page.getByLabel('Business roles')).toHaveValue('ExampleTeam-sales')
    await page.getByLabel('Business roles').selectOption('ExampleTeam-engineering')
    await page.getByRole('button', { name: 'Apply role' }).click()
    await expect(page).toHaveURL(url => url.searchParams.get('businessRole') === 'ExampleTeam-engineering' && Number(url.searchParams.get('page') ?? 0) === 0)
    await expect(page.getByRole('heading', { name: /Sales Skill|Business Role Demo/ })).toHaveCount(0)
    const exactUnknown = (await (await page.request.get('/api/web/skills?businessRole=ExampleTeam-sale')).json()).data
    expect(exactUnknown.total).toBe(0)
    await page.goBack(); await expect(page.getByLabel('Business roles')).toHaveValue('ExampleTeam-sales')
    await page.goto('/suites?businessRole=ExampleTeam-sales')
    await expect(page.getByRole('heading', { name: 'Sales Toolkit', exact: true })).toBeVisible()
    await page.reload(); await expect(page.getByLabel('Business roles')).toHaveValue('ExampleTeam-sales')

    const star = await page.request.put(`/api/v1/skills/${skills[14]!.skillId}/star`, { headers: await csrfHeaders(page) })
    expect(star.ok()).toBeTruthy()
    await page.goto('/search?businessRole=ExampleTeam-leadership&starredOnly=true')
    await expect(page.getByRole('heading', { name: 'Private Favorite', exact: true })).toBeVisible()
    const privateMarket = (await (await page.request.get('/api/web/skills?businessRole=ExampleTeam-leadership')).json()).data
    expect(privateMarket.total).toBe(0)

    const reader = await browser.newContext({ baseURL })
    try {
      const readerPage = await reader.newPage(); await setEnglishLocale(readerPage)
      await createFreshSession(readerPage, testInfo)
      await readerPage.goto(`/space/global/${skills[0]!.slug}`)
      await expect(readerPage.getByTestId('business-roles-panel').getByRole('link', { name: 'Sales', exact: true })).toBeVisible()
      await expect(readerPage.getByTestId('business-roles-panel').getByRole('button', { name: 'Edit roles' })).toHaveCount(0)
      for (const [type, slug, privateSlug] of [['skills', skills[0]!.slug, skills[14]!.slug], ['suites', suites[0]!.slug, suites[1]!.slug]]) {
        const denied = await readerPage.request.put(rolePath(type!, slug!), { data: { businessRoles: [] }, headers: await csrfHeaders(readerPage) })
        expect(denied.status()).toBe(403)
        expect((await readerPage.request.get(rolePath(type!, privateSlug!))).status()).toBe(403)
      }
      const candidates = (await (await readerPage.request.get('/api/web/business-roles')).json()).data as string[]
      expect(candidates).toContain('ExampleTeam-sales'); expect(candidates).not.toContain('ExampleTeam-leadership')
      // Configuration is public vocabulary, not evidence of usage on private resources.
      const choices = (await (await readerPage.request.get('/api/web/business-roles/options')).json()).data as Array<{ key: string; name: string }>
      expect(choices.map(choice => choice.key)).toContain('ExampleTeam-leadership')
    } finally { await reader.close() }

    await page.evaluate(() => localStorage.setItem('i18nextLng', 'zh'))
    await page.goto('/search?businessRole=ExampleTeam-sales')
    await expect(page.getByLabel('业务角色', { exact: true })).toHaveValue('ExampleTeam-sales')
    await expect(page.getByRole('heading', { name: /Sales Skill|Business Role Demo/ })).toHaveCount(12)
    await capture('01-skill-role-search.png')
    await page.goto(`/space/global/${skills[0]!.slug}`)
    await page.getByTestId('business-roles-panel').getByRole('button', { name: '编辑角色' }).click()
    await capture('02-skill-role-editor.png', page.getByTestId('business-roles-panel'))
    await page.goto(`/dashboard/suites/global/${suites[0]!.slug}`)
    await expect(page.getByTestId('business-roles-panel').getByRole('link', { name: 'Sales', exact: true })).toBeVisible()
    await page.getByTestId('business-roles-panel').getByRole('button', { name: '编辑角色' }).click()
    await capture('03-suite-role-management.png', page.getByTestId('business-roles-panel'))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/suites?businessRole=ExampleTeam-sales')
    await expect(page.getByLabel('业务角色', { exact: true })).toHaveValue('ExampleTeam-sales')
    await expect(page.getByRole('heading', { name: 'Sales Toolkit', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await capture('04-mobile-suite-role-search.png')
  } finally {
    for (const suite of suites) await page.request.delete(`/api/web/suites/${suite.id}`, { headers: await csrfHeaders(page) })
    for (const skill of skills.filter(Boolean).reverse()) await page.request.delete(`/api/web/skills/global/${skill.slug}`, { headers: await csrfHeaders(page) })
    await builder.cleanup()
  }
})

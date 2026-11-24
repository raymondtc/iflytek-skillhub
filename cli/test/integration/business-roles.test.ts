import { expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { createTempHome } from '../helpers/temp-env'
import { runCli } from '../helpers/run-cli'

test('CLI reads, replaces multiple roles, clears and reports authorization failures', async () => {
  const { home, cwd } = await createTempHome()
  const seen: Array<{ path: string, method: string, body: unknown, auth: string | null }> = []
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      seen.push({ path: new URL(request.url).pathname, method: request.method,
        body: request.method === 'PUT' ? await request.json() : null, auth: request.headers.get('authorization') })
      if (request.headers.get('authorization') !== 'Bearer fake-publish-token') {
        return Response.json({ code: 403, msg: 'forbidden' }, { status: 403 })
      }
      return Response.json({ code: 0, data: { businessRoles: request.method === 'PUT'
        ? (seen.at(-1)?.body as { businessRoles: string[] }).businessRoles : ['sales'] } })
    }
  })
  try {
    const env = { HOME: home, SKILLHUB_TOKEN: 'fake-publish-token', SKILLHUB_REGISTRY: server.url.toString().replace(/\/$/, '') }
    for (const type of ['skill', 'suite']) {
      const base = ['business-roles', 'set', '@team/demo', '--type', type, '--json']
      const set = await runCli([...base, '--role', 'sales', '--role', 'support'], env, { cwd })
      expect(set.exitCode).toBe(0)
      expect(JSON.parse(set.stdout).businessRoles).toEqual(['sales', 'support'])
      expect(seen.at(-1)?.path).toBe(`/api/v1/${type === 'skill' ? 'skills' : 'suites'}/team/demo/business-roles`)
      const clear = await runCli([...base, '--clear'], env, { cwd })
      expect(clear.exitCode).toBe(0)
      expect(JSON.parse(clear.stdout).businessRoles).toEqual([])
      const get = await runCli(['business-roles', 'get', '@team/demo', '--type', type, '--json'], env, { cwd })
      expect(get.exitCode).toBe(0)
      expect(JSON.parse(get.stdout).businessRoles).toEqual(['sales'])
      expect(seen.at(-1)?.method).toBe('GET')
    }
    const before = seen.length
    const invalid = await runCli(['business-roles', 'set', '@team/demo', '--type', 'skill', '--clear', '--role', 'sales', '--json'], env, { cwd })
    expect(invalid.exitCode).toBe(5)
    expect(seen.length).toBe(before)
    const denied = await runCli(['business-roles', 'set', '@team/demo', '--type', 'skill', '--clear', '--json'],
      { ...env, SKILLHUB_TOKEN: 'wrong-token' }, { cwd })
    expect(denied.exitCode).not.toBe(0)
    expect(JSON.parse(denied.stderr).ok).toBe(false)
  } finally {
    server.stop(true)
    await rm(home, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
  }
})

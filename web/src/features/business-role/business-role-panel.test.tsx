/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '@/i18n/config'
import i18n from '@/i18n/config'

const state = vi.hoisted(() => ({
  actor: 'owner', roles: ['ExampleTeam-sales'], canManage: true, failSave: false, failOptions: false,
  writes: [] as string[][],
  options: [
    { key: 'ExampleTeam-engineering', name: 'Engineering' }, { key: 'ExampleTeam-sales', name: 'Sales' },
    { key: 'ExampleTeam-delivery', name: 'Support' }, { key: 'ExampleTeam-leadership', name: 'Leadership' },
  ],
}))
vi.mock('@/features/auth/use-auth', () => ({ useAuth: () => ({ user: { userId: state.actor }, isLoading: false }) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, search }: { children: ReactNode; search: { businessRole: string } }) => <a href={`?businessRole=${search.businessRole}`}>{children}</a> }))
vi.mock('@/shared/lib/toast', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/api/client', () => ({
  WEB_API_PREFIX: '/api/web', getCsrfHeaders: (headers?: HeadersInit) => {
    const result = new Headers(headers); result.set('X-XSRF-TOKEN', 'test-session-csrf'); return result
  },
  fetchJson: async (path: string, options?: { method?: string; body?: string; headers?: HeadersInit }) => {
    if (path.endsWith('/business-roles/options')) {
      if (state.failOptions) throw new Error('HTTP 503')
      return state.options
    }
    if (options?.method === 'PUT') {
      expect(new Headers(options.headers).get('X-XSRF-TOKEN')).toBe('test-session-csrf')
      expect(new Headers(options.headers).get('Content-Type')).toBe('application/json')
      const roles = (JSON.parse(options.body ?? '{}') as { businessRoles: string[] }).businessRoles
      state.writes.push(roles)
      if (state.failSave) throw new Error('HTTP 500')
      state.roles = roles
    }
    return { businessRoles: state.roles, canManageBusinessRoles: state.canManage }
  },
}))
import { BusinessRolePanel } from './business-role-panel'
import { BusinessRoleFilter } from './business-role-filter'

let client: QueryClient
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  state.actor = 'owner'; state.roles = ['ExampleTeam-sales']; state.canManage = true
  state.failSave = false; state.failOptions = false; state.writes = []
  state.options = [
    { key: 'ExampleTeam-engineering', name: 'Engineering' }, { key: 'ExampleTeam-sales', name: 'Sales' },
    { key: 'ExampleTeam-delivery', name: 'Support' }, { key: 'ExampleTeam-leadership', name: 'Leadership' },
  ]
  await i18n.changeLanguage('en')
})
afterEach(() => { cleanup(); client.clear() })
const panel = <BusinessRolePanel type="skills" namespace="team" slug="demo" />
async function edit() { fireEvent.click(await screen.findByRole('button', { name: 'Edit roles' })) }

describe('configured business roles', () => {
  it('shows names, selects multiple configured options, writes exact keys, and clears', async () => {
    render(panel, { wrapper })
    const link = await screen.findByRole('link', { name: 'Sales' })
    expect(link.getAttribute('href')).toBe('?businessRole=ExampleTeam-sales')
    await edit()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    fireEvent.click(screen.getByLabelText('Support'))
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await waitFor(() => expect(state.writes).toEqual([['ExampleTeam-delivery', 'ExampleTeam-sales']]))
    await screen.findByRole('link', { name: 'Support' })
    expect(document.body.textContent).not.toContain('ExampleTeam-')
    await edit(); fireEvent.click(screen.getByRole('button', { name: 'Clear all roles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await screen.findByText('No business roles assigned.')
    expect(state.writes.at(-1)).toEqual([])
  })
  it('cancel discards a clear draft and a failed save preserves selections for retry', async () => {
    render(panel, { wrapper }); await edit()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all roles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByRole('link', { name: 'Sales' }); expect(state.writes).toEqual([])
    await edit(); fireEvent.click(screen.getByLabelText('Support')); state.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await screen.findByText(/Could not save roles/)
    expect((screen.getByLabelText('Support') as HTMLInputElement).checked).toBe(true)
    state.failSave = false; fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await screen.findByRole('link', { name: 'Support' })
  })
  it('retains legacy values until explicit removal and never silently saves them', async () => {
    state.roles = ['legacy-role']
    render(panel, { wrapper }); await edit()
    expect(screen.getByRole('alert').textContent).toContain('no longer configured')
    expect((screen.getByRole('button', { name: 'Save roles' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(state.writes).toEqual([]); expect(state.roles).toEqual(['legacy-role'])
    await edit(); fireEvent.click(screen.getByRole('button', { name: 'Remove legacy-role' }))
    fireEvent.click(screen.getByLabelText('Engineering'))
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await waitFor(() => expect(state.writes).toEqual([['ExampleTeam-engineering']]))
  })
  it('partitions unfinished drafts and capabilities when identity changes', async () => {
    const view = render(panel, { wrapper }); await edit(); fireEvent.click(screen.getByLabelText('Support'))
    state.actor = 'reader'; state.roles = ['ExampleTeam-engineering']; state.canManage = false
    view.rerender(<BusinessRolePanel type="skills" namespace="team" slug="demo" />)
    await screen.findByRole('link', { name: 'Engineering' })
    expect(screen.queryByRole('button', { name: 'Edit roles' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
  it('uses the configured labels instead of a hardcoded mapping', async () => {
    state.options = [{ key: 'CustomRole', name: 'Custom display name' }]; state.roles = ['CustomRole']
    render(panel, { wrapper })
    await screen.findByRole('link', { name: 'Custom display name' }); await edit()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByLabelText('Custom display name')).toBeTruthy()
  })
  it('offers only configured filter names and passes the selected key', async () => {
    const onChange = vi.fn()
    render(<BusinessRoleFilter type="suites" value="ExampleTeam-sales" onChange={onChange} />, { wrapper })
    await screen.findByRole('option', { name: 'Engineering' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(5)
    fireEvent.change(screen.getByLabelText('Business roles'), { target: { value: 'ExampleTeam-engineering' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply role' }))
    expect(onChange).toHaveBeenLastCalledWith('ExampleTeam-engineering')
    fireEvent.click(screen.getByRole('button', { name: /Role: Sales/ }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(document.body.textContent).not.toContain('ExampleTeam-')
  })
  it('does not fall back to free text when options fail to load', async () => {
    state.failOptions = true
    render(<BusinessRoleFilter type="skills" value="" onChange={vi.fn()} />, { wrapper })
    await screen.findByRole('alert')
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Apply role' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

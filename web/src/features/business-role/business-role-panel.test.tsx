/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '@/i18n/config'
import i18n from '@/i18n/config'

const state = vi.hoisted(() => ({
  actor: 'owner', roles: ['sales'], canManage: true, failSave: false, writes: [] as string[][],
}))
vi.mock('@/features/auth/use-auth', () => ({ useAuth: () => ({ user: { userId: state.actor }, isLoading: false }) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: ReactNode }) => <a href="#role">{children}</a> }))
vi.mock('@/shared/lib/toast', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/api/client', () => ({
  WEB_API_PREFIX: '/api/web', getCsrfHeaders: (headers?: HeadersInit) => {
    const result = new Headers(headers)
    result.set('X-XSRF-TOKEN', 'test-session-csrf')
    return result
  },
  fetchJson: async (path: string, options?: { method?: string; body?: string; headers?: HeadersInit }) => {
    if (path.includes('/business-roles?')) return ['sales', 'support']
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
  state.actor = 'owner'; state.roles = ['sales']; state.canManage = true; state.failSave = false; state.writes = []
  await i18n.changeLanguage('en')
})
afterEach(() => { cleanup(); client.clear() })
const panel = <BusinessRolePanel type="skills" namespace="team" slug="demo" />

async function edit() { fireEvent.click(await screen.findByRole('button', { name: 'Edit roles' })) }
function add(role: string) {
  fireEvent.change(screen.getByLabelText('Business role key'), { target: { value: role } })
  fireEvent.click(screen.getByRole('button', { name: 'Add role' }))
}

describe('business role editor', () => {
  it('deduplicates, rejects invalid keys, saves multiple values, and explicitly clears', async () => {
    render(panel, { wrapper }); await edit()
    add('Sales')
    expect(screen.getByRole('alert').textContent).toContain('lowercase')
    expect(state.writes).toEqual([])
    add('sales'); add('support')
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await waitFor(() => expect(state.writes).toEqual([['sales', 'support']]))
    await edit(); fireEvent.click(screen.getByRole('button', { name: 'Clear all roles' }))
    expect(screen.getByText('No roles selected. Saving will clear all business roles.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await screen.findByText('No business roles assigned.')
    expect(state.writes.at(-1)).toEqual([])
  })
  it('cancel discards a clear draft, and a failed save retains edits for retry', async () => {
    render(panel, { wrapper }); await edit()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all roles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('link', { name: 'sales' })).toBeTruthy()
    expect(state.writes).toEqual([])
    await edit(); add('support'); state.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await screen.findByText(/Could not save roles/)
    expect(screen.getByRole('button', { name: 'Remove support' })).toBeTruthy()
    state.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await screen.findByRole('link', { name: 'support' })
  })
  it('partitions metadata and unfinished drafts when identity changes', async () => {
    const view = render(panel, { wrapper }); await edit(); add('private-owner-draft')
    state.actor = 'reader'; state.roles = ['reader-role']; state.canManage = false
    view.rerender(<BusinessRolePanel type="skills" namespace="team" slug="demo" />)
    await screen.findByRole('link', { name: 'reader-role' })
    expect(screen.queryByRole('button', { name: 'Edit roles' })).toBeNull()
    expect(screen.queryByText('private-owner-draft')).toBeNull()
  })
  it('uses exact single keys and permits clearing a filter', async () => {
    const onChange = vi.fn()
    render(<BusinessRoleFilter type="suites" value="sales" onChange={onChange} />, { wrapper })
    fireEvent.change(screen.getByLabelText('Business roles'), { target: { value: 'sale' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply role' }))
    expect(onChange).toHaveBeenLastCalledWith('sale')
    fireEvent.change(screen.getByLabelText('Business roles'), { target: { value: 'bad key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply role' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onChange).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Role: sales/ }))
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})

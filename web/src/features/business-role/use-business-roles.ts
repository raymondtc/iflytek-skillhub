import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@/api/generated/schema'
import { fetchJson, getCsrfHeaders, WEB_API_PREFIX } from '@/api/client'
import { useAuth } from '@/features/auth/use-auth'

export type BusinessRoleResource = 'skills' | 'suites'
type Metadata = components['schemas']['BusinessRolesResponse']
export type BusinessRoleOption = components['schemas']['BusinessRoleOption']
const resourcePath = (type: BusinessRoleResource, namespace: string, slug: string) =>
  `${WEB_API_PREFIX}/${type}/${encodeURIComponent(namespace.replace(/^@/, ''))}/${encodeURIComponent(slug)}/business-roles`

export function useBusinessRoles(type: BusinessRoleResource, namespace: string, slug: string) {
  const { user, isLoading } = useAuth()
  return useQuery({
    queryKey: ['business-roles', user?.userId ?? 'guest', 'metadata', type, namespace, slug],
    queryFn: () => fetchJson<Metadata>(resourcePath(type, namespace, slug)),
    enabled: !isLoading && !!namespace && !!slug,
    meta: { skipGlobalErrorHandler: true },
  })
}

export function useBusinessRoleOptions() {
  const { user, isLoading } = useAuth()
  return useQuery({
    queryKey: ['business-roles', user?.userId ?? 'guest', 'options'],
    queryFn: () => fetchJson<BusinessRoleOption[]>(`${WEB_API_PREFIX}/business-roles/options`),
    enabled: !isLoading,
    meta: { skipGlobalErrorHandler: true },
  })
}

export function useReplaceBusinessRoles(type: BusinessRoleResource, namespace: string, slug: string) {
  const client = useQueryClient()
  const { user } = useAuth()
  const queryKey = ['business-roles', user?.userId ?? 'guest', 'metadata', type, namespace, slug]
  return useMutation({
    mutationFn: (businessRoles: string[]) => fetchJson<Metadata>(resourcePath(type, namespace, slug), {
      method: 'PUT', headers: getCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ businessRoles }),
    }),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: async data => {
      client.setQueryData(queryKey, data)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['business-roles'] }),
        client.invalidateQueries({ queryKey: ['skills', 'search'] }),
        client.invalidateQueries({ queryKey: ['skills', 'stars'] }),
        client.invalidateQueries({ queryKey: ['resources', 'search'] }),
      ])
    },
    onError: () => { void client.invalidateQueries({ queryKey }) },
  })
}

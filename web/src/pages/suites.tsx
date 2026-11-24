import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Boxes } from 'lucide-react'
import { ResourceCard } from '@/features/suite/resource-card'
import { useResourceSearch } from '@/shared/hooks/use-suite-queries'
import { useVisibleLabels } from '@/shared/hooks/use-label-queries'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { BusinessRoleFilter } from '@/features/business-role/business-role-filter'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

const PAGE_SIZE = 12

export function SuitesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = useSearch({ from: '/suites' })
  const query = search.q ?? ''
  const selectedLabel = search.label ?? ''
  const businessRole = search.businessRole ?? ''
  const page = search.page ?? 0
  const [queryInput, setQueryInput] = useState(query)
  useEffect(() => setQueryInput(query), [query])
  const update = (next: Partial<typeof search>) => navigate({ to: '/suites', search: { ...search, page: 0, ...next } })
  const { data: labels, isLoading: isLoadingLabels } = useVisibleLabels()
  const { data, isLoading, isError, refetch } = useResourceSearch({
    q: query.trim() || undefined,
    resourceType: 'SUITE',
    businessRole: businessRole || undefined,
    labels: selectedLabel ? [selectedLabel] : undefined,
    sort: 'newest',
    page,
    size: PAGE_SIZE,
  })

  return (
    <div className={APP_SHELL_PAGE_CLASS_NAME}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Boxes className="h-4 w-4" /> {t('suite.listTitle')}
          </div>
          <h1 className="text-4xl font-bold">{t('suite.listTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{t('suite.listDescription')}</p>
        </div>
        <Button onClick={() => navigate({ to: '/dashboard/suites/new' })}>{t('suite.create')}</Button>
      </div>

      <form className="flex max-w-xl gap-2" onSubmit={event => { event.preventDefault(); void update({ q: queryInput.trim() || undefined }) }}>
      <Input
        value={queryInput}
        placeholder={t('suite.searchPlaceholder')}
        onChange={(event) => setQueryInput(event.target.value)}
      />
      <Button type="submit" variant="outline">{t('nav.search')}</Button>
      </form>

      <BusinessRoleFilter type="suites" value={businessRole} onChange={role => { void update({ businessRole: role || undefined }) }} />

      <section className="space-y-2" aria-labelledby="suite-label-filter-title">
        <div id="suite-label-filter-title" className="text-sm font-medium text-foreground">
          {t('suite.labelFilterTitle')}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectedLabel === '' ? 'default' : 'outline'}
            onClick={() => {
              void update({ label: undefined })
            }}
          >
            {t('suite.allLabels')}
          </Button>
          {isLoadingLabels ? (
            <span className="px-2 py-1 text-sm text-muted-foreground">{t('suite.loadingLabels')}</span>
          ) : labels?.map(label => (
            <Button
              key={label.slug}
              type="button"
              size="sm"
              variant={selectedLabel === label.slug ? 'default' : 'outline'}
              onClick={() => {
                void update({ label: selectedLabel === label.slug ? undefined : label.slug })
              }}
            >
              {label.displayName}
            </Button>
          ))}
        </div>
      </section>

      {isError ? <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>{t('businessRoles.searchFailed')}</p><Button variant="outline" onClick={() => void refetch()}>{t('businessRoles.retry')}</Button>
      </div> : isLoading ? (
        <SkeletonList count={PAGE_SIZE} />
      ) : data?.items.length ? (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((suite) => (
              <ResourceCard
                key={suite.id}
                resource={suite}
                onClick={() => navigate({
                  to: `/suite/${suite.namespace}/${encodeURIComponent(suite.slug)}`,
                })}
              />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(data.total / data.size))}
            onPageChange={page => { void update({ page }) }}
          />
        </>
      ) : (
        <EmptyState title={t('suite.emptyTitle')} description={t('suite.emptyDescription')} />
      )}
    </div>
  )
}

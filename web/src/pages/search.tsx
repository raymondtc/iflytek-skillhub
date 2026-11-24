import { startTransition, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'
import { SearchBar } from '@/features/search/search-bar'
import { SkillCard } from '@/features/skill/skill-card'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { useSearchSkills } from '@/shared/hooks/use-skill-queries'
import { useVisibleLabels } from '@/shared/hooks/use-label-queries'
import { useMyStarsPage } from '@/shared/hooks/use-user-queries'
import { BusinessRoleFilter } from '@/features/business-role/business-role-filter'
import { toRouterPath } from '@/shared/lib/base-path'
import { formatNamespaceSearchInput, normalizeSearchQuery, parseNamespaceSearchInput } from '@/shared/lib/search-query'
import { Button } from '@/shared/ui/button'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

const PAGE_SIZE = 12

function blurActiveElement() {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') {
    return
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
}

function scrollToTopOnPageChange() {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let secondFrame = 0
  const firstFrame = window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    secondFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' })
    })
  })

  return () => {
    window.cancelAnimationFrame(firstFrame)
    if (secondFrame) {
      window.cancelAnimationFrame(secondFrame)
    }
  }
}

/**
 * Skill discovery page with synchronized URL state.
 *
 * Search text, sorting, pagination, and the starred-only filter are mirrored into router search
 * params so the page can be shared, restored, and revisited without losing state.
 */
export function SearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const searchParams = useSearch({ from: '/search' })
  const { isAuthenticated } = useAuth()

  const q = normalizeSearchQuery(searchParams.q || '')
  const namespace = (searchParams.namespace || '').replace(/^@/, '')
  const selectedLabel = searchParams.label || ''
  const businessRole = searchParams.businessRole || ''
  const sort = searchParams.sort || 'newest'
  const page = searchParams.page ?? 0
  const starredOnly = searchParams.starredOnly ?? false
  const [queryInput, setQueryInput] = useState(formatNamespaceSearchInput(namespace, q))
  const previousPageRef = useRef(page)

  useEffect(() => {
    setQueryInput(formatNamespaceSearchInput(namespace, q))
  }, [namespace, q])

  useEffect(() => {
    if (previousPageRef.current !== page) {
      blurActiveElement()
      const cleanupScroll = scrollToTopOnPageChange()

      previousPageRef.current = page
      return () => {
        cleanupScroll()
      }
    }

    previousPageRef.current = page
  }, [page])

  const skillsQuery = useSearchSkills({
    q,
    namespace: namespace || undefined,
    label: selectedLabel || undefined,
    businessRole: businessRole || undefined,
    sort,
    page,
    size: PAGE_SIZE,
    starredOnly,
  }, !starredOnly)
  const { data: labels } = useVisibleLabels()
  const starsQuery = useMyStarsPage({ q, namespace: namespace || undefined, businessRole: businessRole || undefined,
    sort, page, size: PAGE_SIZE }, starredOnly && isAuthenticated)
  const { data, isLoading, isFetching, isError, refetch } = starredOnly ? starsQuery : skillsQuery
  const handleSearch = (query: string) => {
    const parsedInput = parseNamespaceSearchInput(query)
    setQueryInput(query)
    startTransition(() => {
      navigate({ to: '/search', search: { q: parsedInput.query, namespace: parsedInput.namespace, label: selectedLabel, businessRole, sort, page: 0, starredOnly }, replace: true })
    })
  }

  const handleSortChange = (newSort: string) => {
    navigate({ to: '/search', search: { q, namespace, label: selectedLabel, businessRole, sort: newSort, page: 0, starredOnly } })
  }

  const handlePageChange = (newPage: number) => {
    blurActiveElement()
    navigate({ to: '/search', search: { q, namespace, label: selectedLabel, businessRole, sort, page: newPage, starredOnly } })
  }

  const handleLabelToggle = (label: string) => {
    const nextLabel = selectedLabel === label ? '' : label
    navigate({ to: '/search', search: { q, namespace, label: nextLabel, businessRole, sort, page: 0, starredOnly } })
  }

  const handleNamespaceClear = () => {
    navigate({ to: '/search', search: { q, namespace: '', label: selectedLabel, businessRole, sort, page: 0, starredOnly } })
  }

  const handleStarredToggle = () => {
    if (!isAuthenticated) {
      navigate({
        to: '/login',
        search: {
          returnTo: toRouterPath(window.location.pathname, window.location.search, window.location.hash),
        },
      })
      return
    }

    navigate({ to: '/search', search: { q, namespace, label: selectedLabel, businessRole, sort, page: 0, starredOnly: !starredOnly } })
  }

  const handleSkillClick = (namespace: string, slug: string) => {
    navigate({
      to: `/space/${namespace}/${encodeURIComponent(slug)}`,
      search: { returnTo: toRouterPath(window.location.pathname, window.location.search) },
    })
  }

  const totalPages = data ? Math.ceil(data.total / data.size) : 0
  const displayItems = data?.items ?? []
  const isPageLoading = isLoading
  const isUpdatingResults = isFetching && !isLoading
  const resultCount = data?.total ?? 0

  return (
    <div className={APP_SHELL_PAGE_CLASS_NAME}>
      {/* Search Bar */}
      <div className="max-w-3xl mx-auto">
        <SearchBar
          value={queryInput}
          isSearching={isUpdatingResults}
          onChange={setQueryInput}
          onSearch={handleSearch}
        />
      </div>

      <BusinessRoleFilter type="skills" namespace={namespace} value={businessRole} onChange={role => {
        navigate({ to: '/search', search: { q, namespace, label: selectedLabel, businessRole: role || undefined,
          sort, page: 0, starredOnly } })
      }} />
      {/* Sort And Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">{t('search.sort.label')}</span>
            <div className="flex max-w-full flex-wrap gap-2">
              <Button
                variant={sort === 'relevance' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSortChange('relevance')}
              >
                {t('search.sort.relevance')}
              </Button>
              <Button
                variant={sort === 'downloads' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSortChange('downloads')}
              >
                {t('search.sort.downloads')}
              </Button>
              <Button
                variant={sort === 'newest' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSortChange('newest')}
              >
                {t('search.sort.newest')}
              </Button>
            </div>
          </div>

          {resultCount > 0 && (
            <div className="text-sm text-muted-foreground">
              {t('search.results', { count: resultCount })}
            </div>
          )}
        </div>

        {isUpdatingResults ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('search.loadingMore')}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{t('search.filters.label')}</span>
          <Button
            variant={starredOnly ? 'default' : 'outline'}
            size="sm"
            onClick={handleStarredToggle}
          >
            {t('search.filterStarred')}
          </Button>
          {!starredOnly && labels?.map((label) => (
            <Button
              key={label.slug}
              variant={selectedLabel === label.slug ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleLabelToggle(label.slug)}
            >
              {label.displayName}
            </Button>
          ))}
          {namespace ? (
            <Button
              variant="default"
              size="sm"
              onClick={handleNamespaceClear}
            >
              {t('search.namespaceFilter', { namespace })}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Results */}
      {isError ? <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>{t('businessRoles.searchFailed')}</p><Button variant="outline" onClick={() => void refetch()}>{t('businessRoles.retry')}</Button>
      </div> : isPageLoading ? (
        <SkeletonList count={PAGE_SIZE} />
      ) : displayItems.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayItems.map((skill, idx) => (
              <div key={skill.id} className={`h-full animate-fade-up delay-${Math.min(idx % 6 + 1, 6)}`}>
                <SkillCard
                  skill={skill}
                  highlightStarred
                  onClick={() => handleSkillClick(skill.namespace, skill.slug)}
                />
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </>
      ) : (
        <EmptyState
          title={starredOnly ? t('search.noStarredResults') : t('search.noResults')}
          description={
            starredOnly
              ? (q ? t('search.noStarredResultsFor', { q }) : t('search.noStarredSkills'))
              : (q ? t('search.noResultsFor', { q }) : undefined)
          }
        />
      )}
    </div>
  )
}

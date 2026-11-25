import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { toast } from '@/shared/lib/toast'
import { useBusinessRoleOptions, useBusinessRoles, useReplaceBusinessRoles, type BusinessRoleResource, type BusinessRoleOption } from './use-business-roles'

type Props = { type: BusinessRoleResource; namespace: string; slug: string; readOnly?: boolean }

export function BusinessRolePanel(props: Props) {
  const { user } = useAuth()
  return <Panel key={`${props.type}:${props.namespace}:${props.slug}:${user?.userId ?? 'guest'}`} {...props} />
}

function Panel({ type, namespace, slug, readOnly }: Props) {
  const { t } = useTranslation()
  const query = useBusinessRoles(type, namespace, slug)
  const options = useBusinessRoleOptions()
  const [editing, setEditing] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const roles = query.data?.businessRoles ?? []
  const roleName = (key: string) => options.data?.find(option => option.key === key)?.name ?? t('businessRoles.unconfigured')
  const canManage = options.isSuccess && !readOnly && query.data?.canManageBusinessRoles === true
  const close = () => {
    setEditing(false)
    requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true }))
  }
  return <Card className="space-y-3 p-4" data-testid="business-roles-panel">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">{t('businessRoles.title')}</h2>
      {canManage && !editing && <Button ref={editButton} size="sm" variant="outline" onClick={() => setEditing(true)}>{t('businessRoles.edit')}</Button>}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{t(type === 'suites' ? 'businessRoles.suiteHint' : 'businessRoles.hint')}</p>
    {query.isLoading || options.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t('businessRoles.loading')}</p>
      : query.isError || options.isError ? <div role="alert" className="space-y-2 text-sm text-destructive">
        <p>{t('businessRoles.loadFailed')}</p><Button size="sm" variant="outline" onClick={() => { void query.refetch(); void options.refetch() }}>{t('businessRoles.retry')}</Button>
      </div>
      : canManage && editing ? <Editor type={type} namespace={namespace} slug={slug} initial={roles} options={options.data ?? []} onClose={close} />
      : <div className="flex flex-wrap gap-2">
        {roles.length ? roles.map(role => type === 'skills'
          ? <Link key={role} to="/search" search={{ q: '', businessRole: role, sort: 'newest', page: 0, starredOnly: false }} className="max-w-full break-all rounded-md border px-2 py-1 text-xs hover:bg-accent" title={options.data?.some(option => option.key === role) ? undefined : role}>{roleName(role)}</Link>
          : <Link key={role} to="/suites" search={{ businessRole: role, page: 0 }} className="max-w-full break-all rounded-md border px-2 py-1 text-xs hover:bg-accent" title={options.data?.some(option => option.key === role) ? undefined : role}>{roleName(role)}</Link>)
          : <p className="text-sm text-muted-foreground">{t('businessRoles.empty')}</p>}
      </div>}
  </Card>
}

function Editor({ type, namespace, slug, initial, options, onClose }: Omit<Props, 'readOnly'> & { initial: string[]; options: BusinessRoleOption[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const mutation = useReplaceBusinessRoles(type, namespace, slug)
  const legacy = draft.filter(key => !options.some(option => option.key === key))
  return <form className="space-y-3" aria-label={t('businessRoles.editForm')} onSubmit={async event => {
    event.preventDefault()
    if (legacy.length) return
    try {
      await mutation.mutateAsync(draft)
      onClose(); toast.success(t('businessRoles.saved'))
    } catch { setError(t('businessRoles.saveFailed')) }
  }}>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{t('businessRoles.choose')}</legend>
      <div className="space-y-2">{options.map(option => <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <input type="checkbox" checked={draft.includes(option.key)}
          disabled={!draft.includes(option.key) && draft.length >= 32}
          onChange={event => { const checked = event.target.checked; setDraft(current => checked ? [...new Set([...current, option.key])].sort() : current.filter(key => key !== option.key)); setError('') }} />
        <span>{option.name}</span>
      </label>)}</div>
      {legacy.length > 0 && <div className="space-y-2 text-xs">
        <p role="alert" className="text-destructive">{t('businessRoles.legacyWarning')}</p>
        <div className="flex flex-wrap gap-2">{legacy.map(key => <span key={key} title={key} className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
          {t('businessRoles.unconfigured')}<button type="button" aria-label={t('businessRoles.remove', { role: key })}
            className="rounded p-1 hover:bg-accent focus-visible:outline focus-visible:outline-2" onClick={() => setDraft(current => current.filter(value => value !== key))}><X className="h-3 w-3" /></button>
        </span>)}</div>
      </div>}
      {!draft.length && <p className="text-xs text-muted-foreground">{t('businessRoles.emptyDraft')}</p>}
      <p className="text-xs leading-5 text-muted-foreground">{t('businessRoles.selectionHelp')}</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => { setDraft([]); setError('') }}>{t('businessRoles.clearAll')}</Button>
        <div className="flex gap-2"><Button size="sm" variant="outline" type="button" onClick={onClose}>{t('businessRoles.cancel')}</Button>
          <Button size="sm" type="submit" disabled={legacy.length > 0}>{t(mutation.isPending ? 'businessRoles.saving' : 'businessRoles.save')}</Button></div>
      </div>
    </fieldset>
  </form>
}

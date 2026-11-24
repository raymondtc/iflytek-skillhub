import { useId, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/lib/toast'
import { isBusinessRoleKey, useBusinessRoleCandidates, useBusinessRoles, useReplaceBusinessRoles, type BusinessRoleResource } from './use-business-roles'

type Props = { type: BusinessRoleResource; namespace: string; slug: string; readOnly?: boolean }

export function BusinessRolePanel(props: Props) {
  const { user } = useAuth()
  return <Panel key={`${props.type}:${props.namespace}:${props.slug}:${user?.userId ?? 'guest'}`} {...props} />
}

function Panel({ type, namespace, slug, readOnly }: Props) {
  const { t } = useTranslation()
  const query = useBusinessRoles(type, namespace, slug)
  const [editing, setEditing] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const roles = query.data?.businessRoles ?? []
  const canManage = !readOnly && query.data?.canManageBusinessRoles === true
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
    {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t('businessRoles.loading')}</p>
      : query.isError ? <div role="alert" className="space-y-2 text-sm text-destructive">
        <p>{t('businessRoles.loadFailed')}</p><Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t('businessRoles.retry')}</Button>
      </div>
      : canManage && editing ? <Editor type={type} namespace={namespace} slug={slug} initial={roles} onClose={close} />
      : <div className="flex flex-wrap gap-2">
        {roles.length ? roles.map(role => type === 'skills'
          ? <Link key={role} to="/search" search={{ q: '', businessRole: role, sort: 'newest', page: 0, starredOnly: false }} className="max-w-full break-all rounded-md border px-2 py-1 font-mono text-xs hover:bg-accent">{role}</Link>
          : <Link key={role} to="/suites" search={{ businessRole: role, page: 0 }} className="max-w-full break-all rounded-md border px-2 py-1 font-mono text-xs hover:bg-accent">{role}</Link>)
          : <p className="text-sm text-muted-foreground">{t('businessRoles.empty')}</p>}
      </div>}
  </Card>
}

function Editor({ type, namespace, slug, initial, onClose }: Omit<Props, 'readOnly'> & { initial: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState(initial)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const mutation = useReplaceBusinessRoles(type, namespace, slug)
  const candidates = useBusinessRoleCandidates(type, namespace, input)
  const add = () => {
    if (!isBusinessRoleKey(input)) { setError(t('businessRoles.invalidKey')); return }
    if (!draft.includes(input) && draft.length >= 32) { setError(t('businessRoles.tooMany')); return }
    setDraft(current => [...new Set([...current, input])].sort()); setInput(''); setError('')
  }
  return <form className="space-y-3" aria-label={t('businessRoles.editForm')} onSubmit={async event => {
    event.preventDefault()
    if (input) { setError(t('businessRoles.addBeforeSave')); return }
    try {
      await mutation.mutateAsync(draft)
      onClose(); toast.success(t('businessRoles.saved'))
    } catch { setError(t('businessRoles.saveFailed')) }
  }}>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      <div className="flex flex-wrap gap-2">{draft.map(role => <span key={role} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs">
        <span className="break-all font-mono">{role}</span><button type="button" aria-label={t('businessRoles.remove', { role })}
          className="rounded p-1 hover:bg-accent focus-visible:outline focus-visible:outline-2" onClick={() => setDraft(current => current.filter(key => key !== role))}><X className="h-3 w-3" /></button>
      </span>)}</div>
      {!draft.length && <p className="text-xs text-muted-foreground">{t('businessRoles.emptyDraft')}</p>}
      <label htmlFor={id} className="block text-sm font-medium">{t('businessRoles.keyLabel')}</label>
      <div className="flex flex-wrap gap-2">
        <Input id={id} value={input} list={`${id}-options`} maxLength={64} className="min-w-0 flex-1" autoComplete="off"
          aria-invalid={!!error} aria-describedby={`${id}-help ${id}-error`}
          placeholder="customer-support" onChange={event => { setInput(event.target.value); setError('') }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
        <Button size="sm" variant="outline" type="button" onClick={add}>{t('businessRoles.add')}</Button>
      </div>
      <datalist id={`${id}-options`}>{candidates.data?.map(key => <option key={key} value={key} />)}</datalist>
      <p id={`${id}-help`} className="text-xs leading-5 text-muted-foreground">{t('businessRoles.keyHelp')}</p>
      <p id={`${id}-error`} role={error ? 'alert' : undefined} className="text-xs text-destructive">{error}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => { setDraft([]); setInput(''); setError('') }}>{t('businessRoles.clearAll')}</Button>
        <div className="flex gap-2"><Button size="sm" variant="outline" type="button" onClick={onClose}>{t('businessRoles.cancel')}</Button>
          <Button size="sm" type="submit">{t(mutation.isPending ? 'businessRoles.saving' : 'businessRoles.save')}</Button></div>
      </div>
    </fieldset>
  </form>
}

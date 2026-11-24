import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { isBusinessRoleKey, useBusinessRoleCandidates, type BusinessRoleResource } from './use-business-roles'

export function BusinessRoleFilter({ type, namespace = '', value, onChange }: {
  type: BusinessRoleResource; namespace?: string; value: string; onChange: (key: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [input, setInput] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const candidates = useBusinessRoleCandidates(type, namespace, input)
  useEffect(() => { setInput(value); setInvalid(false) }, [value])
  return <form aria-label={t('businessRoles.filterLabel')} className="space-y-2" onSubmit={event => {
    event.preventDefault()
    if (input && !isBusinessRoleKey(input)) { setInvalid(true); return }
    setInvalid(false); onChange(input)
  }}>
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">{t('businessRoles.title')}</label>
      <Input id={id} list={`${id}-options`} value={input} maxLength={64}
        placeholder={t('businessRoles.all')} className="w-full sm:w-60"
        aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={event => { setInput(event.target.value); setInvalid(false) }} />
      <datalist id={`${id}-options`}>{candidates.data?.map(key => <option key={key} value={key} />)}</datalist>
      <Button size="sm" type="submit" variant="outline">{t('businessRoles.apply')}</Button>
      {value && <Button size="sm" variant="soft" type="button" onClick={() => onChange('')}>
        {t('businessRoles.activeFilter', { role: value })} ×
      </Button>}
    </div>
    {invalid && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{t('businessRoles.invalidKey')}</p>}
    {candidates.isError && <p className="text-xs text-muted-foreground">{t('businessRoles.candidatesFailed')}{' '}
      <button type="button" className="underline" onClick={() => void candidates.refetch()}>{t('businessRoles.retry')}</button>
    </p>}
  </form>
}

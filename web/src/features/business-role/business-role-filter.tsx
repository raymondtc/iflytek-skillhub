import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { SELECT_TRIGGER_CLASS_NAME } from '@/shared/ui/select'
import { cn } from '@/shared/lib/utils'
import { useBusinessRoleOptions, type BusinessRoleResource } from './use-business-roles'

export function BusinessRoleFilter({ value, onChange }: {
  type: BusinessRoleResource; namespace?: string; value: string; onChange: (key: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [selected, setSelected] = useState(value)
  const options = useBusinessRoleOptions()
  useEffect(() => setSelected(value), [value])
  const known = (key: string) => options.data?.some(option => option.key === key)
  const roleName = options.data?.find(option => option.key === value)?.name ?? t('businessRoles.unconfigured')
  return <form aria-label={t('businessRoles.filterLabel')} className="space-y-2" onSubmit={event => {
    event.preventDefault()
    if (!options.isSuccess || (selected && !known(selected))) return
    onChange(selected)
  }}>
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">{t('businessRoles.title')}</label>
      <select id={id} value={selected} disabled={!options.isSuccess}
        className={cn(SELECT_TRIGGER_CLASS_NAME, 'w-full sm:w-60')}
        onChange={event => setSelected(event.target.value)}>
        <option value="">{t('businessRoles.all')}</option>
        {selected && !known(selected) && <option value={selected} disabled>{t('businessRoles.unconfigured')}</option>}
        {options.data?.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}
      </select>
      <Button size="sm" type="submit" variant="outline" disabled={!options.isSuccess || (!!selected && !known(selected))}>{t('businessRoles.apply')}</Button>
      {value && <Button size="sm" variant="soft" type="button" onClick={() => onChange('')}>
        {t('businessRoles.activeFilter', { role: roleName })} ×
      </Button>}
    </div>
    {options.isLoading && <p role="status" className="text-xs text-muted-foreground">{t('businessRoles.loading')}</p>}
    {options.isError && <p role="alert" className="text-xs text-destructive">{t('businessRoles.optionsFailed')}{' '}
      <button type="button" className="underline" onClick={() => void options.refetch()}>{t('businessRoles.retry')}</button>
    </p>}
  </form>
}

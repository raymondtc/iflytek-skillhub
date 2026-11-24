import { SkillHubClient } from '../clients/skillhub-client'
import { ConfigStore } from '../stores/config-store'
import { CredentialsStore } from '../stores/credentials-store'
import { resolveRegistry, resolveToken } from '../services/registry-service'
import { resolveSkillName } from '../shared/skill-name-parser'
import { CliError } from '../shared/errors'
import { EXIT } from '../shared/constants'

export interface BusinessRolesOptions {
  type?: string | undefined
  role?: string[] | undefined
  clear?: boolean | undefined
  registry?: string | undefined
  token?: string | undefined
  json?: boolean | undefined
}

export async function businessRolesCommand(action: string, coordinate: string, options: BusinessRolesOptions): Promise<string> {
  if (!['get', 'set'].includes(action) || !['skill', 'suite'].includes(options.type ?? '')) {
    throw new CliError('use business-roles <get|set> <coordinate> --type <skill|suite>', EXIT.usage)
  }
  const roles = options.role ?? []
  if ((action === 'get' && (roles.length > 0 || options.clear)) ||
      (action === 'set' && ((roles.length === 0 && !options.clear) || (roles.length > 0 && options.clear)))) {
    throw new CliError('set requires --role <key> (repeatable) or --clear; get accepts neither', EXIT.usage)
  }
  const config = await new ConfigStore().read()
  const registry = resolveRegistry(options, process.env, config)
  const token = resolveToken(options, process.env, await new CredentialsStore().getToken(registry))
  const { namespace, slug } = resolveSkillName(coordinate)
  const result = await new SkillHubClient(registry, token).businessRoles(
    options.type === 'suite' ? 'suites' : 'skills', namespace, slug, action === 'set' ? roles : undefined)
  return options.json ? JSON.stringify({ ok: true, ...result }) :
    `${options.type} @${namespace}/${slug}: ${result.businessRoles.join(', ') || '(empty)'}`
}

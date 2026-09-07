import { AI_PIPELINE_STAGES } from './aiPipeline'

export const MINI_APP_TASK_ROUTES: Readonly<Record<string, string>> =
  Object.freeze({
    ...Object.fromEntries(
      AI_PIPELINE_STAGES.map(stage => [stage.id, stage.route])
    ),
    chat: '/chat',
    profile: '/profile',
    plan: '/profile?tab=plan',
    files: '/profile?tab=files',
    skills: '/profile?tab=skills',
  })

const START_ROUTES: Readonly<Record<string, string>> = {
  ...MINI_APP_TASK_ROUTES,
  feed: '/feed',
  search: '/search',
  learn: '/learn',
  create: MINI_APP_TASK_ROUTES.editor,
  pair: '/profile?tab=agent',
}

/** A launch hint selects a known screen; it never establishes identity. */
export function resolveMiniAppStartRoute(
  startParam: unknown,
  search: string
): string | undefined {
  const value =
    typeof startParam === 'string' && startParam
      ? startParam
      : new URLSearchParams(search).get('tgWebAppStartParam')
  return value && Object.hasOwn(START_ROUTES, value)
    ? START_ROUTES[value]
    : undefined
}

/** Only the structured action from the tool result may become a button. */
export function miniAppTaskDestination(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const action = value as Record<string, unknown>
  if (Object.keys(action).some(key => key !== 'type' && key !== 'destination'))
    return undefined
  if (action.type !== 'open_mini_app' || typeof action.destination !== 'string')
    return undefined
  return Object.hasOwn(MINI_APP_TASK_ROUTES, action.destination)
    ? action.destination
    : undefined
}

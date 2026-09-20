/**
 * THE ONE PLACE EVERY UPDATE PASSES THROUGH.
 *
 * Instrumenting `safeEnterScene` was the obvious idea and it under-counts:
 * dozens of scenes call `ctx.scene.enter` directly, so half the traffic would
 * be invisible and the report would quietly lie. A Telegraf middleware sees
 * every update regardless of how the scene was entered.
 *
 * WHY THE "BEFORE" VALUE COMES FROM THE SESSION, NOT `ctx.scene`. This
 * middleware is registered before `stage.middleware()`, so `ctx.scene` does
 * not exist yet when the update arrives — reading it there would report `null`
 * every time and every event would look like a first visit. Telegraf keeps the
 * current scene in `session.__scenes.current`, which the session middleware
 * has already loaded by the time we run.
 *
 * Nothing is awaited in the user's path: the insert is fired and forgotten, so
 * a slow or dead telemetry database costs the client nothing.
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { recordClientEvent } from './clientEvents'

type Next = () => Promise<void>

/** Telegraf stores `{ current, state }` under `session.__scenes`. */
export function sceneFromSession(session: unknown): string | null {
  const scenes = (session as { __scenes?: Record<string, unknown> } | undefined)
    ?.__scenes
  const current = scenes?.current
  return typeof current === 'string' && current ? current : null
}

/** The scene the update left the user in, preferring the live stage state. */
function sceneAfter(ctx: MyContext): string | null {
  const live = ctx.scene?.current?.id
  if (typeof live === 'string' && live) return live
  return sceneFromSession(ctx.session)
}

export function createClientTelemetryMiddleware() {
  return async (ctx: MyContext, next: Next): Promise<void> => {
    const before = sceneFromSession(ctx.session)
    try {
      await next()
    } finally {
      try {
        const after = sceneAfter(ctx)
        // Same scene means the client is still working inside it: many updates,
        // one event. Only a move is worth a row.
        if (after !== before && ctx.from?.id) {
          // Not awaited: the client is waiting on their own handler, not on
          // our insert. `recordClientEvent` swallows its failures, and the
          // `catch` here is the belt to that braces -- an unhandled rejection
          // in a fire-and-forget call would take the process down.
          void recordClientEvent({
            telegramId: String(ctx.from.id),
            botName: ctx.botInfo?.username || '',
            username: ctx.from.username || null,
            fromScene: before,
            toScene: after,
          }).catch(() => {})
        }
      } catch {
        // Telemetry must never turn a handled update into a failed one.
      }
    }
  }
}

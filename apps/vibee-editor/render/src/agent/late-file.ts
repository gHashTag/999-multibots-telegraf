/**
 * A PICTURE THAT FINISHED AFTER THE ANSWER IS POSTED INTO ITS THREAD.
 *
 * agent-claims-honest.t27 v2, late_file_posted. Owner, 2026-10-09: image_edit
 * answered "still drawing", the turn ended, the provider finished a minute
 * later and the picture went to "my files" -- and the chat it was asked for
 * never heard of it. The person asked again and again for a link nobody had.
 * The answer line goes into the same thread the turn wrote to, so the open
 * chat shows it (thread-live.ts) and the next turn's history carries it.
 */
import type { ToolContext } from './tools'
import { lateFilePosted } from '../spec/agent-claims-honest.logic'

export async function postLateFile(
  ctx: ToolContext,
  url: string
): Promise<boolean> {
  if (!url || !ctx.thread) return false
  const { записатьРеплику } = await import('./conversation') // cyrillic-ok: the module's own export
  return записатьРеплику(
    // cyrillic-ok: the module's own export
    ctx.pool as never,
    String(ctx.telegramId),
    {
      role: 'assistant',
      content: `📎 Дорисовалось: ${url}`,
      surface: ctx.surface || 'unknown',
    },
    ctx.thread
  ).catch(() => false)
}

/**
 * What a late watch's verdict does: a picture that came is posted into the
 * turn's thread when the turn was kept (spec late_file_posted); one that
 * never came is refunded by the caller, which holds the charge.
 */
export async function onLateOutcome(
  ctx: ToolContext,
  out: { state: string; url?: string },
  refund: () => Promise<void>
): Promise<void> {
  if (out.state === 'ready') {
    if (lateFilePosted(true, !!ctx.thread, !!ctx.ephemeral))
      await postLateFile(ctx, String(out.url ?? ''))
    return
  }
  await refund()
}

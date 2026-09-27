/**
 * WHAT SURVIVES THE STORAGE RESET (main.tsx).
 *
 * The reset exists for the editor's DEFAULTS: raise the version and new
 * values take effect. But it swept everything by the "vibee-" prefix,
 * including the person's conversation with the agent and their half-written
 * message. That is not a setting: it is where a task is written. The owner
 * reported exactly that: "chat history after a reload".
 *
 * The list is a positive one: anything new is reset by default, as before;
 * only what the person wrote themselves survives.
 */
const KEEP = new Set([
  'vibee-agent-chat',
  'vibee-agent-chat-draft',
  'vibee-last-route',
  'vibee-soul',
])

/*
 * AND EVERY THREAD, NOT ONLY THE FIRST ONE. The set above names the self
 * thread's key; each client's thread (`vibee-agent-chat:client:<id>`), the
 * Queen's beside it, a specialist's (`:agent:<id>`), a numbered conversation
 * (`~<id>`) and each thread's own draft are the same kind of thing under a
 * longer key -- and the next version bump would have swept all of them
 * (owner, 2026-09-27: "the chat is not kept in the CRM between clients").
 */
const THREAD_KEY = /^vibee-agent-chat(-draft)?[:~]/

export function survivesStorageReset(key: string): boolean {
  return KEEP.has(key) || THREAD_KEY.test(key)
}

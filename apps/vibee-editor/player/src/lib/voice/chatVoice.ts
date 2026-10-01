/**
 * A voice session bound to one chat conversation: what it hears goes into
 * that conversation through the ordinary send path, and what it speaks is
 * that conversation's answer.
 */
import { atomWithStorage } from 'jotai/utils'
import { editorStore } from '@/atoms/Provider'
import type { MessagesAtom } from '@/atoms/agentChat'
import type { Language } from '@/atoms/language'
import {
  agentBusyThreadsAtom,
  agentQueueAtom,
  sendOrQueue,
  threadKeyOf,
  type SendOptions,
} from '@/lib/agentStream'
import { VoiceSession } from './session'

export const VOICE_MODES = [
  'pulse',
  'spectrum',
  'orbit',
  'hologram',
  'shatter',
] as const
export type VoiceMode = (typeof VOICE_MODES)[number]

/** The visual a person picked last time. */
export const voiceModeAtom = atomWithStorage<VoiceMode>(
  'vibee.voice.mode',
  'pulse'
)
/** The voice picked per language; null is the server's default. */
export const voiceNameAtom = atomWithStorage<Partial<Record<Language, string>>>(
  'vibee.voice.name',
  {}
)

export function createChatVoiceSession(
  thread: MessagesAtom,
  options: SendOptions,
  lang: () => Language
): VoiceSession {
  const key = threadKeyOf(options)
  return new VoiceSession({
    lang,
    voice: () => editorStore.get(voiceNameAtom)[lang()] ?? null,
    send: text => {
      sendOrQueue(text, [], options)
    },
    messages: () => editorStore.get(thread),
    answering: () =>
      editorStore.get(agentBusyThreadsAtom).includes(key) ||
      editorStore.get(agentQueueAtom).some(q => threadKeyOf(q.options) === key),
    subscribe: cb => {
      const offs = [
        editorStore.sub(thread, cb),
        editorStore.sub(agentBusyThreadsAtom, cb),
        editorStore.sub(agentQueueAtom, cb),
      ]
      return () => offs.forEach(off => off())
    },
  })
}

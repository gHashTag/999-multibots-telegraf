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
  stopAgent,
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
/**
 * Voice mode on its own full screen instead of inside the chat. Off by
 * default: the chat stays in view, with what was said and the cards, as
 * ChatGPT made it on 2025-11-25 (keeping "Separate mode" as a setting).
 */
export const voiceSeparateAtom = atomWithStorage<boolean>(
  'vibee.voice.separate',
  false
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
    voice: l => editorStore.get(voiceNameAtom)[l] ?? null,
    send: text => {
      sendOrQueue(text, [], options)
    },
    stop: () => stopAgent(key),
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

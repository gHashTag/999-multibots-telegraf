import { hasCredential } from '@/lib/embedGuest'

/**
 * WHAT TALKING TO A LIVE AGENT COSTS, in the words every try button uses
 * (the package cards and the welcome screen), so the two cannot disagree.
 *
 * The agent chat is on the FREE list (render/src/agent/pricing.ts; pinned by
 * tryFirstNote.test.tsx). A browser with no credential is refused by
 * /api/agent/chat and asked to sign in, so it is told that before the press.
 */
const NOTE = {
  en: {
    free: 'Free: chatting costs nothing',
    signIn: 'Free, with a Telegram sign-in',
  },
  ru: {
    free: 'Бесплатно: переписка ничего не стоит',
    signIn: 'Бесплатно, нужен вход через Telegram',
  },
} as const

export function tryFreeNote(lang: 'en' | 'ru'): string {
  return hasCredential() ? NOTE[lang].free : NOTE[lang].signIn
}

export type MarketplaceAgentStatus = 'live' | 'training' | 'design'

export interface LocalizedText {
  en: string
  ru: string
}

export interface MarketplaceAgentListing {
  id: string
  icon: string
  name: LocalizedText
  role: LocalizedText
  promise: LocalizedText
  status: MarketplaceAgentStatus
  creator: string
  skills: readonly LocalizedText[]
  evidence: readonly LocalizedText[]
}

/**
 * Public catalogue, shared by the market screen and the server gate.
 *
 * `live` means a person can open a distinct thread and run the specialised
 * agent now. `training` means the underlying tools exist, but the complete
 * specialist contract and its acceptance checks do not. The distinction is
 * deliberate: a polished card is not evidence that an agent can do the job.
 */
export const MARKETPLACE_AGENTS: readonly MarketplaceAgentListing[] = [
  {
    id: 'blogger',
    icon: '✦',
    name: { en: 'Blogger', ru: 'Блогер' },
    role: {
      en: 'Verified publishing agent',
      ru: 'Агент проверенных публикаций',
    },
    promise: {
      en: 'Finds shipped work that the blog has not covered, turns it into a complete EN/RU campaign, and returns publication receipts.',
      ru: 'Находит сделанное, о котором блог ещё не рассказал, собирает полноценную EN/RU-кампанию и возвращает отчёт с подтверждениями.',
    },
    status: 'live',
    creator: 'T27',
    skills: [
      { en: 'unpublished-work audit', ru: 'аудит неопубликованного' },
      { en: 'EN/RU article', ru: 'статья EN/RU' },
      { en: 'triptych cover', ru: 'обложка-триптих' },
      { en: 'X · LinkedIn · Telegram', ru: 'X · LinkedIn · Telegram' },
    ],
    evidence: [
      {
        en: 'separate persistent thread',
        ru: 'отдельная сохраняемая переписка',
      },
      {
        en: 'real tool calls remain visible',
        ru: 'реальные вызовы инструментов видны',
      },
      {
        en: 'hashtags and a contextual offer are mandatory',
        ru: 'хештеги и контекстный офер обязательны',
      },
      {
        en: 'completion requires live receipts',
        ru: 'завершение требует живых подтверждений',
      },
    ],
  },
  {
    id: 'google',
    icon: 'G',
    name: { en: 'Google Scout', ru: 'Google-разведчик' },
    role: {
      en: 'Demand and evidence researcher',
      ru: 'Исследователь спроса и фактов',
    },
    promise: {
      en: 'Maps search intent, sources and competitors before a content or product decision.',
      ru: 'Картирует поисковый спрос, источники и конкурентов до решения о контенте или продукте.',
    },
    status: 'training',
    creator: 'T27',
    skills: [
      { en: 'search intent', ru: 'поисковый спрос' },
      { en: 'source ledger', ru: 'реестр источников' },
      { en: 'gap analysis', ru: 'анализ пробелов' },
    ],
    evidence: [],
  },
  {
    id: 'tiktok',
    icon: '♪',
    name: { en: 'TikTok Producer', ru: 'TikTok-продюсер' },
    role: { en: 'Short-form campaign agent', ru: 'Агент коротких видео' },
    promise: {
      en: 'Turns one verified idea into hooks, a script, edit plan, caption and measured variants.',
      ru: 'Превращает одну проверенную идею в хуки, сценарий, монтажный план, подпись и измеримые варианты.',
    },
    status: 'training',
    creator: 'T27',
    skills: [
      { en: 'hook variants', ru: 'варианты хуков' },
      { en: 'script and edit', ru: 'сценарий и монтаж' },
      { en: 'publishing receipt', ru: 'подтверждение публикации' },
    ],
    evidence: [],
  },
  {
    id: 'habr',
    icon: 'H',
    name: { en: 'Habr Engineer', ru: 'Habr-инженер' },
    role: {
      en: 'Technical long-read agent',
      ru: 'Агент технических лонгридов',
    },
    promise: {
      en: 'Reconstructs an engineering result from code and tests, then prepares a reproducible Habr draft.',
      ru: 'Восстанавливает инженерный результат по коду и тестам и готовит воспроизводимый черновик для Habr.',
    },
    status: 'training',
    creator: 'T27',
    skills: [
      { en: 'code-to-story', ru: 'из кода в историю' },
      { en: 'reproduction steps', ru: 'шаги воспроизведения' },
      { en: 'technical review', ru: 'техническая редактура' },
    ],
    evidence: [],
  },
] as const

export const MARKETPLACE_ECONOMY = {
  active: false,
  creatorBps: 7_000,
  platformBps: 2_000,
  qualityReserveBps: 1_000,
  releaseRule: 'accepted_receipt',
} as const

export function marketplaceAgentById(
  id: unknown
): MarketplaceAgentListing | null {
  const key = String(id ?? '')
    .trim()
    .toLowerCase()
  return MARKETPLACE_AGENTS.find(agent => agent.id === key) ?? null
}

export function liveMarketplaceAgentById(
  id: unknown
): MarketplaceAgentListing | null {
  const found = marketplaceAgentById(id)
  return found?.status === 'live' ? found : null
}

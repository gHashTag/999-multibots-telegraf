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
  /**
   * Skill-name prefixes that address one of the person's skills to this
   * agent: "Работа: ..." belongs to the job agent (agentSkills below).
   */
  skillPrefixes: readonly string[]
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
    skillPrefixes: ['блогер', 'blogger'],
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
    /*
     * THE JOB DESK. Owner, 2026-09-24: "the job agent must know every hunter
     * in my contacts, and create groups by the target audience of the bots."
     *
     * `training`, and the guard in this package is why. Both hands exist and
     * are tested -- `job_hunters` decides who is hiring from what they WROTE
     * (job-hunters.ts, pure and covered), and a new group goes out as a card
     * the owner presses (`create-group`, covered including its refusals) --
     * but NOTHING has yet run end to end against a real dialog or a real
     * group. By this file's own standard that is a trainee, however finished
     * the card looks, and the test that says "one live specialist" caught the
     * author of these tools reaching for `live` on his own judgement.
     *
     * The tools are not hidden meanwhile: the general prompt names them
     * (chat.ts), so the agent knows it has them. Only the specialist voice
     * waits, and it waits for the owner's word after a first real run.
     *
     * 2026-09-24, the owner: the mail agent from gHashTag/agent-mail-mcp
     * goes here, and every job-search skill with it. The mailbox is the
     * `mail_*` tools (render mail-tools.ts, owner-only, a letter leaves on a
     * card tap); the map of every job-search piece is the `job-agent` skill.
     * Mail has not run against the real mailbox either -- same rule.
     */
    id: 'job',
    skillPrefixes: ['работа', 'job'],
    icon: '⚒',
    name: { en: 'Job', ru: 'Работа' },
    role: {
      en: 'Hiring-side agent',
      ru: 'Агент по найму и вакансиям',
    },
    promise: {
      en: 'Finds which of your own contacts are hiring -- from what they wrote, never from a name -- and opens a group per audience for your press.',
      ru: 'Находит, кто из ваших контактов нанимает — по словам в переписке, не по имени, — и открывает группу под аудиторию, по вашему нажатию.',
    },
    status: 'training',
    creator: 'T27',
    skills: [
      { en: 'hunters among contacts', ru: 'хантеры среди контактов' },
      { en: 'evidence, not names', ru: 'доказательства, не имена' },
      { en: 'a group per audience', ru: 'группа под аудиторию' },
      { en: 'hh · LinkedIn · Upwork', ru: 'hh · LinkedIn · Upwork' },
      { en: 'recruiter mail · Zoho', ru: 'письма рекрутёров · Zoho' },
    ],
    evidence: [
      {
        en: 'two different signs in their own words, never one',
        ru: 'два разных признака их словами, не один',
      },
      {
        en: "the owner's own messages are never evidence about a contact",
        ru: 'свои сообщения не доказательство о собеседнике',
      },
      {
        en: 'a group is created empty; inviting is a second press',
        ru: 'группа создаётся пустой, приглашение — второе нажатие',
      },
      {
        en: 'writing to anybody still waits for the press',
        ru: 'написать кому-либо по-прежнему только с нажатия',
      },
      {
        en: 'a letter leaves only after the owner taps its card',
        ru: 'письмо уходит только после нажатия на его карточку',
      },
    ],
  },
  {
    id: 'google',
    skillPrefixes: ['google', 'гугл'],
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
    skillPrefixes: ['tiktok', 'тикток'],
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
    skillPrefixes: ['habr', 'хабр'],
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

/** The prefix before a colon in a skill's name, lowercase, or null. Pure. */
export function skillPrefixOf(name: string): string | null {
  const m = /^\s*([^:]{1,24}):/.exec(String(name ?? ''))
  return m ? m[1].trim().toLowerCase() : null
}

/** Scopes that are not agents' and never reach an agent. */
const NON_AGENT_SKILL_SCOPES = ['leela']

/**
 * WHICH OF THE PERSON'S SKILLS AN AGENT CARRIES (owner, 2026-09-24: "in
 * every agent the skills are connected"): its own -- named with one of its
 * skillPrefixes -- first, then the general ones (no agent's prefix). Read
 * the same way by the render (the specialist's prompt) and the app (what
 * the agent's chat says is connected). Pure.
 */
export function agentSkills<T extends { name: string }>(
  rows: readonly T[],
  agentId: string
): { own: T[]; general: T[] } {
  const mine = marketplaceAgentById(agentId)?.skillPrefixes ?? []
  const anyAgent = MARKETPLACE_AGENTS.flatMap(a => [...a.skillPrefixes])
  const own: T[] = []
  const general: T[] = []
  for (const r of rows) {
    const p = skillPrefixOf(r.name)
    if (p && mine.includes(p)) own.push(r)
    else if (
      !p ||
      (!anyAgent.includes(p) && !NON_AGENT_SKILL_SCOPES.includes(p))
    )
      general.push(r)
  }
  return { own, general }
}

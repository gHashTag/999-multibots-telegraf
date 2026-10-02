/**
 * THE SOCIAL DESK: the owner's agent posts to the owner's networks.
 *
 * WHOSE NETWORKS. The tokens in `social_tokens` are the owner's: he connected
 * Threads, Facebook (+ Instagram), LinkedIn and X himself, by OAuth, in the
 * app (Profile -> MetaConnectCard). Every tool here is the owner's alone
 * (requireOwner, fail-closed), like the mailbox in mail-tools.ts.
 *
 * WHO MAY POST. The model may not. `social_post` PREPARES a post and puts the
 * very text each network will get on the owner's Telegram permission card
 * (the browser's requestPermission, one tap). The second call, with only the
 * card's id, posts exactly that draft to exactly those networks -- and only if
 * the owner tapped Allow. A card is used once; a restart forgets the draft.
 *
 * CONNECTING IS NOT HERE. OAuth consent is the owner's own tap on the
 * network's page; the agent can only hand him the link (`connect`).
 */
import type { AgentTool, ToolContext } from './tools'
import { requireOwner } from './telegram-tools'
import { threadsPost, type Network, type Post } from './meta-connect'
import { linkedInCommentary, xPost } from './social-api'

/** Opens the app on Profile, where MetaConnectCard connects each network. */
export const CONNECT_LINK = 'https://t.me/t27ai_bot?start=app_profile'

export const SOCIAL_NETWORKS: readonly Network[] = [
  'threads',
  'facebook',
  'linkedin',
  'x',
]

const LABEL: Record<Network, string> = {
  threads: 'Threads',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
}

/** Telegram caps a message at 4096; the card adds its own lines. */
export const CARD_MAX = 3200
const TITLE_MAX = 300
const SUMMARY_MAX = 1500

export interface Draft {
  post: Post
  networks: Network[]
}

function httpsUrl(v: unknown, what: string): string {
  const s = String(v ?? '').trim()
  if (!/^https:\/\/\S+$/.test(s)) throw new Error(`${what} must be an https URL`)
  return s
}

/** What the model asked for, checked before anything is shown or posted. */
export function draftOf(args: Record<string, any>): Draft {
  const title = String(args?.title ?? '').trim()
  const summary = String(args?.summary ?? '').trim()
  if (!title) throw new Error('title is required')
  if (title.length > TITLE_MAX)
    throw new Error(`title is longer than ${TITLE_MAX} characters`)
  if (!summary) throw new Error('summary is required')
  if (summary.length > SUMMARY_MAX)
    throw new Error(`summary is longer than ${SUMMARY_MAX} characters`)
  const link = httpsUrl(args?.link, 'link')
  const cardUrl = args?.image_url ? httpsUrl(args.image_url, 'image_url') : ''
  let networks: Network[] = [...SOCIAL_NETWORKS]
  if (args?.networks !== undefined) {
    if (!Array.isArray(args.networks))
      throw new Error('networks must be an array')
    const asked = args.networks.map((n: unknown) =>
      String(n).trim().toLowerCase()
    )
    for (const n of asked) {
      if (!SOCIAL_NETWORKS.includes(n as Network))
        throw new Error(
          `unknown network "${n}": one of ${SOCIAL_NETWORKS.join(', ')}`
        )
    }
    networks = [...new Set(asked)] as Network[]
    if (!networks.length) throw new Error('networks is empty')
  }
  return { post: { title, link, summary, cardUrl }, networks }
}

export type Texts = (p: Post) => Record<Network, string>

/** The owner's card: every network's own text, as it will leave. Pure. */
export function approvalText(d: Draft, texts: Texts): string {
  const t = texts(d.post)
  const parts = ['Пост в соцсети от вашего имени:'] // cyrillic-ok: told to the owner
  for (const n of d.networks) {
    const body = n === 'facebook' ? `${t[n]}\n${d.post.link}` : t[n]
    parts.push(`— ${LABEL[n]} —\n${body}`)
  }
  if (d.networks.includes('facebook') && d.post.cardUrl)
    parts.push(`Instagram (если подключён): картинка ${d.post.cardUrl}`) // cyrillic-ok: told to the owner
  const all = parts.join('\n\n')
  return all.length > CARD_MAX
    ? `${all.slice(0, CARD_MAX)}\n… (обрезано для карточки)` // cyrillic-ok: told to the owner
    : all
}

export interface NetworkState {
  network: string
  account?: unknown
  instagram?: unknown
  daysLeft?: unknown
  usable?: unknown
}

export interface SocialStatus {
  /** Which networks have their app id/secret on vibee-render. */
  apps: Record<Network, boolean>
  networks: NetworkState[]
}

/** What is left for each network before the agent can post there. Pure. */
export function todoOf(s: SocialStatus): Record<Network, string> {
  const out = {} as Record<Network, string>
  for (const n of SOCIAL_NETWORKS) {
    const held = s.networks.find(x => x.network === n)
    if (held && held.usable) out[n] = 'nothing: connected'
    else if (held)
      out[n] = `the token expired: the owner reconnects at ${CONNECT_LINK}`
    else if (!s.apps[n])
      out[n] =
        'the app id/secret is not on vibee-render (tri meta put), then connect'
    else out[n] = `not connected: the owner connects at ${CONNECT_LINK}`
  }
  return out
}

export interface SocialDeps {
  ask: (ctx: ToolContext, what: string) => Promise<string>
  answer: (
    ctx: ToolContext,
    id: string
  ) => Promise<{ state: string; telegramId: string } | null>
  sleep: (ms: number) => Promise<void>
  texts: Texts
  publish: (
    ctx: ToolContext,
    p: Post,
    only: readonly Network[]
  ) => Promise<Record<string, string>>
  status: (ctx: ToolContext) => Promise<SocialStatus>
}

const realDeps: SocialDeps = {
  async ask(ctx, what) {
    const { requestPermission } = await import('../browser/agent-tools')
    return await requestPermission(ctx.pool, ctx.telegramId, what)
  },
  async answer(ctx, id) {
    const { readApproval } = await import('../browser/approvals')
    return await readApproval(ctx.pool, id)
  },
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  texts: p => ({
    threads: threadsPost(p),
    /* publishFacebook sends the link beside the message, not inside it. */
    facebook: `${p.title}\n\n${p.summary}`.trim(),
    linkedin: linkedInCommentary(p),
    x: xPost(p),
  }),
  async publish(ctx, p, only) {
    const { postByApi } = await import('./meta-connect')
    const { postBySocialApi } = await import('./social-api')
    const d = {
      fetch: ((url: string, init?: object) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })) as never,
      sleep: (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
      only,
    }
    const owner = String(ctx.telegramId)
    const [meta, social] = await Promise.all(
      [postByApi, postBySocialApi].map(post =>
        post(ctx.pool, owner, p, d).catch(() => ({}) as Record<string, string>)
      )
    )
    return { ...meta, ...social }
  },
  async status(ctx) {
    const { readTokens, statusView, appOf } = await import('./meta-connect')
    const held = await readTokens(ctx.pool, String(ctx.telegramId))
    const apps = {} as Record<Network, boolean>
    for (const n of SOCIAL_NETWORKS) apps[n] = !!appOf(n)
    return {
      apps,
      networks: statusView(held, Date.now()) as unknown as NetworkState[],
    }
  },
}
let deps = realDeps
export function setSocialDepsForTests(d: Partial<SocialDeps> | null): void {
  deps = d ? { ...realDeps, ...d } : realDeps
  PENDING.clear()
}

/*
 * Posts waiting for the owner's tap, keyed by the permission card's id. In
 * memory on purpose: a restart forgets them, and a forgotten draft is simply
 * prepared again -- it can never leave without a fresh tap.
 */
interface Pending {
  draft: Draft
  owner: string
  at: number
}
const PENDING = new Map<string, Pending>()
const PENDING_TTL_MS = 10 * 60 * 1000

/** How long one `social_post {approval}` call waits for the tap. */
export const POST_WAIT_MS = 90_000

async function prepare(args: Record<string, any>, ctx: ToolContext) {
  const asked = draftOf(args)
  const s = await deps.status(ctx)
  const ready = asked.networks.filter(n =>
    s.networks.some(x => x.network === n && x.usable)
  )
  const skipped = asked.networks.filter(n => !ready.includes(n))
  const todo = todoOf(s)
  // A card for a post that cannot leave anywhere wastes the owner's tap.
  if (!ready.length) {
    return {
      posted: false,
      blocked: 'none of these networks is connected: nothing was asked',
      todo: Object.fromEntries(asked.networks.map(n => [n, todo[n]])),
      connect: CONNECT_LINK,
    }
  }
  const draft: Draft = { post: asked.post, networks: ready }
  const id = await deps.ask(ctx, approvalText(draft, deps.texts))
  PENDING.set(id, { draft, owner: String(ctx.telegramId), at: Date.now() })
  return {
    posted: false,
    approval: id,
    networks: ready,
    skipped: Object.fromEntries(skipped.map(n => [n, todo[n]])),
    note: 'Every network\'s text is on the owner\'s card in Telegram. Call social_post again with only {"approval": "<id>"} to post it once they tap Allow.',
  }
}

async function transmit(id: string, ctx: ToolContext) {
  const p = PENDING.get(id)
  if (!p || Date.now() - p.at > PENDING_TTL_MS) {
    PENDING.delete(id)
    return {
      posted: false,
      refused:
        'no prepared post under this card (expired or restarted): prepare it again',
    }
  }
  if (p.owner !== String(ctx.telegramId)) {
    return { posted: false, refused: 'this card belongs to someone else' }
  }
  const deadline = Date.now() + POST_WAIT_MS
  let state = 'pending'
  for (;;) {
    const a = await deps.answer(ctx, id)
    if (a && a.telegramId !== p.owner) {
      return { posted: false, refused: 'the card was answered by someone else' }
    }
    state = a?.state ?? 'expired'
    if (state !== 'pending' || Date.now() >= deadline) break
    await deps.sleep(2000)
  }
  if (state === 'pending') {
    return {
      posted: false,
      waiting: true,
      note: 'no tap yet; call again with the same approval id',
    }
  }
  // Allowed or not, a card is used once.
  PENDING.delete(id)
  if (state !== 'allowed') {
    return { posted: false, refused: `the owner did not allow it (${state})` }
  }
  const results = await deps.publish(ctx, p.draft.post, p.draft.networks)
  return {
    posted: Object.keys(results).length > 0,
    results,
    note: 'each line says what the network answered; open the post to verify',
  }
}

export const SOCIAL_TOOLS: AgentTool[] = [
  {
    name: 'social_status',
    description:
      'Соцсети владельца: какие подключены (Threads, Facebook+Instagram, ' + // cyrillic-ok: tool description for the model
      'LinkedIn, X), сколько дней живёт вход и что осталось сделать до ' + // cyrillic-ok: tool description for the model
      'первого поста. Токены не показывает.', // cyrillic-ok: tool description for the model
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, ctx?: ToolContext) {
      requireOwner(ctx)
      const s = await deps.status(ctx!)
      return { ...s, todo: todoOf(s), connect: CONNECT_LINK }
    },
  },
  {
    name: 'social_post',
    description:
      'Пост в соцсети владельца. Первый вызов {title, link, summary, ' + // cyrillic-ok: tool description for the model
      'image_url?, networks?} ГОТОВИТ пост и показывает владельцу текст каждой ' + // cyrillic-ok: tool description for the model
      'сети карточкой в Telegram; ничего не уходит. Второй вызов {approval} ' + // cyrillic-ok: tool description for the model
      'публикует ровно это, если владелец нажал «Разрешить». Неподключённые ' + // cyrillic-ok: tool description for the model
      'сети пропускаются — см. social_status.', // cyrillic-ok: tool description for the model
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        link: { type: 'string', description: 'https-ссылка на материал' }, // cyrillic-ok: tool description for the model
        summary: { type: 'string', description: 'текст поста' }, // cyrillic-ok: tool description for the model
        image_url: {
          type: 'string',
          description: 'https-картинка; без неё Instagram пропускается', // cyrillic-ok: tool description for the model
        },
        networks: {
          type: 'array',
          items: { type: 'string', enum: [...SOCIAL_NETWORKS] },
          description: 'по умолчанию все подключённые', // cyrillic-ok: tool description for the model
        },
        approval: {
          type: 'string',
          description: 'id карточки из первого вызова', // cyrillic-ok: tool description for the model
        },
      },
      additionalProperties: false,
    },
    async handler(args, ctx?: ToolContext) {
      requireOwner(ctx)
      if (args?.approval) return await transmit(String(args.approval), ctx!)
      return await prepare(args, ctx!)
    },
  },
]

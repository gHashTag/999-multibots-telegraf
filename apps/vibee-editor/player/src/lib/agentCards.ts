/**
 * CARDS THE AGENT PROPOSES; THE PERSON APPROVES OR DECLINES.
 *
 * Owner, 2026-09-22: "the agent should propose cards for its tasks, so
 * steering it is approving or declining a card". The agent writes, at the
 * end of an answer,
 *
 *   [[card: Skip the address | I will press Skip on the Google page]]
 *
 * and the chat draws a card with Approve / Decline. A press is sent to the
 * agent as an ordinary message ("✅ Одобряю: Skip the address"), so the
 * agent acts on it in its next turn with everything it already knows, and
 * the transcript says in plain words what the person decided.
 *
 * A marker in the text, not a tool: the compact tool kit's schema budget is
 * full, and a line of text is what even a small model writes reliably. The
 * marker is kept in the stored answer, so cards come back after a reload;
 * their state is read from what the person said after them, never stored
 * twice.
 */

/*
 * Two kinds, because they are pressed differently:
 *   card -- one of several ALTERNATIVES ("Skip" or "Save"): one is chosen;
 *   step -- one step of a PLAN: several can be approved, and "Approve all"
 *           appears only for steps. Approving all alternatives is nonsense.
 */
export type CardKind = 'card' | 'step'

export interface AgentCard {
  kind: CardKind
  title: string
  detail: string
}

export type CardState = 'open' | 'approved' | 'declined'

export const APPROVE = '✅ Одобряю: ' // cyrillic-ok: the words sent to the agent
export const DECLINE = '✖ Не надо: ' // cyrillic-ok: the words sent to the agent
export const MAX_CARDS = 6

const CARD =
  /\[\[(card|step):\s*([^|\]\n]{1,80}?)\s*(?:\|\s*([^\]\n]{0,240}?)\s*)?\]\]/g
/* A marker still arriving while the answer streams: hidden until it closes. */
const OPEN_TAIL = /\[\[(?:c|ca|car|card|s|st|ste|step)?(?::[^\]]*)?\]?$/

/** The answer without its markers, and the cards they carried. Pure. */
export function parseCards(text: string): { text: string; cards: AgentCard[] } {
  const cards: AgentCard[] = []
  const seen = new Set<string>()
  const stripped = text.replace(
    CARD,
    (_m, kind: CardKind, title: string, detail?: string) => {
      const t = title.trim()
      if (t && !seen.has(t) && cards.length < MAX_CARDS) {
        seen.add(t)
        cards.push({ kind, title: t, detail: (detail ?? '').trim() })
      }
      return ''
    }
  )
  return {
    text: stripped
      .replace(OPEN_TAIL, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd(),
    cards,
  }
}

/** What a press sends to the agent: one line per card. Pure. */
export function answerFor(cards: AgentCard[], approve: boolean): string {
  return cards.map(c => (approve ? APPROVE : DECLINE) + c.title).join('\n')
}

/**
 * Each card's state, read from the person's messages AFTER the answer that
 * proposed it. Pure. A card nobody answered stays open.
 */
export function cardStates(
  cards: AgentCard[],
  laterUserTexts: string[]
): CardState[] {
  const lines = laterUserTexts.flatMap(t => t.split('\n').map(l => l.trim()))
  return cards.map(c => {
    if (lines.includes(APPROVE + c.title)) return 'approved'
    if (lines.includes(DECLINE + c.title)) return 'declined'
    return 'open'
  })
}

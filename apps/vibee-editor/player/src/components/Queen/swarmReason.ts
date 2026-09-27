/**
 * Why the Queen's swarm is (not) working, as data -- kept apart from the
 * composer component so the component file exports components only
 * (react-refresh/only-export-components) and fast refresh keeps working.
 */
export interface SwarmStatus {
  /** Bees running right now. */
  running: number
  /** Total worker slots. */
  slots: number
  /** Open issues on the board. */
  candidates: number
  /** How many of them pass the delegatable gate. */
  delegatable: number
  /** The engine's own refusal line, when it gave one. */
  refusal?: string | null
  /** The engine has not ticked recently -- it may be down. */
  stale?: boolean
}

export type SwarmLevel = 'sos' | 'idle' | 'work'
export interface SwarmReason {
  level: SwarmLevel
  text: string
}

/**
 * Why the swarm is (not) working, in one line. Pure, so the blocker text is
 * tested rather than eyeballed. An idle swarm always yields a reason; an idle
 * swarm with a full backlog is the recorded failure, named here.
 */
export function swarmReason(s: SwarmStatus | undefined): SwarmReason {
  if (!s)
    return {
      level: 'sos',
      text: 'Статус роя неизвестен — движок не отвечает. SOS.',
    } // cyrillic-ok: UI text
  if (s.stale)
    return { level: 'sos', text: 'Рой не отвечает — движок не тикает. SOS.' } // cyrillic-ok: UI text
  if (s.running > 0) {
    const full = s.slots > 0 && s.running >= s.slots ? ' (полон)' : '' // cyrillic-ok: UI text
    return {
      level: 'work',
      text: `Рой работает: ${s.running}/${s.slots} пчёл${full}.`, // cyrillic-ok: UI text
    }
  }
  if (s.delegatable <= 0)
    return {
      level: 'idle',
      text: `Рой стоит: нечего выбрать — 0 делегируемых из ${s.candidates} открытых (нет ## Boundary). Заведи задачу ниже.`, // cyrillic-ok: UI text
    }
  return {
    level: 'idle',
    text: s.refusal
      ? `Рой стоит: ${s.refusal}.` // cyrillic-ok: UI text
      : `Рой стоит: ${s.delegatable} готовы, но ни одна не взята.`, // cyrillic-ok: UI text
  }
}

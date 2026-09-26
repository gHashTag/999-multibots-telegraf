import type { SendCard } from '@/atoms/agentChat'

/**
 * Cards in one conversation that can still be pressed: waiting and not past
 * their expiry. Pure, so the client card's "waiting for your Send" block
 * (components/Crm/ClientTimeline.tsx) and its test agree on what that means.
 */
export function waitingCards(
  messages: Array<{ id: string; sendCard?: SendCard }>,
  now = Date.now()
): Array<{ messageId: string; card: SendCard }> {
  return messages
    .filter(
      m =>
        m.sendCard &&
        (m.sendCard.state ?? 'waiting') === 'waiting' &&
        !(m.sendCard.expiresAt && now > m.sendCard.expiresAt)
    )
    .map(m => ({ messageId: m.id, card: m.sendCard! }))
}

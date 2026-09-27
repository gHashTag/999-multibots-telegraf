import { sendOrQueue } from '@/lib/agentStream'

/**
 * ASK THE AGENT IN THE CLIENT'S OWN THREAD, THEN GO THERE.
 *
 * The one move behind "Prepare" (waiting list) and "Return" (win back): the
 * words go to OUR agent, in the thread keyed by this client, and the owner
 * lands in it to press Send on the card -- or not. Nothing reaches the client
 * from here; the agent's send card is the only door, and the owner holds it.
 */
export function askAgentInThread(
  client: string,
  text: string,
  go: (to: string) => void
): void {
  sendOrQueue(text, [], { client })
  go(`/crm/${client}/chat`)
}

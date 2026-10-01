/**
 * Following ONE answer in a thread and handing out its sentences once each.
 *
 * Voice mode sends the person's words as an ordinary chat message
 * (lib/agentStream.ts sendOrQueue), so the answer arrives the ordinary way:
 * an assistant message appended to the thread and growing in place. This
 * object remembers which messages existed before the send, recognises the
 * first assistant message that did not, and reports only the text it has not
 * reported yet. It never touches audio, so it can be tested on plain arrays.
 */
import type { Message } from '@/atoms/agentChat'
import { takeSentences } from './sentences'

export class ReplyFollower {
  private readonly before: Set<string>
  private replyId: string | null = null
  private spokenUpTo = 0
  private done = false

  constructor(existing: readonly Message[]) {
    this.before = new Set(existing.map(m => m.id))
  }

  /** True once the answer has been followed to its end. */
  get finished(): boolean {
    return this.done
  }

  /**
   * New sentences of the answer, given the thread as it is now and whether
   * the conversation is still answering. A reply the person stopped is
   * finished without its tail: the stop was a request for silence.
   */
  update(messages: readonly Message[], answering: boolean): string[] {
    if (this.done) return []
    const reply = this.replyId
      ? messages.find(m => m.id === this.replyId)
      : messages.find(m => m.role === 'assistant' && !this.before.has(m.id))
    if (!reply) {
      // Not even started, and nothing is answering: it is never coming.
      if (!answering && this.replyId === null) this.done = true
      return []
    }
    this.replyId = reply.id
    if (reply.stopped) {
      this.done = true
      return []
    }
    const final = !answering
    const cut = takeSentences(reply.text || '', this.spokenUpTo, final)
    this.spokenUpTo = cut.next
    if (final) this.done = true
    return cut.sentences
  }
}

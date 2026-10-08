/**
 * The team row's rules (lib/team.ts, bot-agent-team.t27): the listed members
 * as chats in team order, the offered ones as "+", the open chat marked, a
 * member's chat the same conversation as its tab in the bot.
 */
import { describe, expect, it } from 'vitest'
import { memberHref, splitTitle, teamChips, type TeamView } from './team'

const member = (kind: string, listed: boolean, offered: boolean) => ({
  kind,
  title: `* ${kind}`,
  conversation: kind === 'agent' ? null : `tab${kind}`,
  onTeam: listed,
  listed,
  offered,
})

const view: TeamView = {
  bot: 't27ai_bot',
  botHasTabs: true,
  members: [
    member('agent', true, false),
    member('reels', true, false),
    member('browser', false, true),
    member('wallet', false, true),
  ],
}

describe('the team row', () => {
  it('lists the team as chats first, then the members to hire', () => {
    const chips = teamChips(view, null)
    expect(chips.map(c => [c.member.kind, c.hire])).toEqual([
      ['agent', false],
      ['reels', false],
      ['browser', true],
      ['wallet', true],
    ])
  })

  it('marks the open chat: the Agent on the base conversation, a member on its tab', () => {
    expect(
      teamChips(view, null)
        .filter(c => c.current)
        .map(c => c.member.kind)
    ).toEqual(['agent'])
    expect(
      teamChips(view, 'tabreels')
        .filter(c => c.current)
        .map(c => c.member.kind)
    ).toEqual(['reels'])
    expect(teamChips(view, 'c1a2b3').some(c => c.current)).toBe(false)
  })

  it("a member's chat is its tab's conversation; the Agent's is the base chat", () => {
    expect(memberHref({ conversation: 'tabreels' })).toBe('/chat?c=tabreels')
    expect(memberHref({ conversation: null })).toBe('/chat')
  })

  it('a member on the team is a chat once, never also a hire', () => {
    const both: TeamView = { ...view, members: [member('hive', true, true)] }
    expect(teamChips(both, null).map(c => c.hire)).toEqual([false])
  })

  it('no team read, no row', () => {
    expect(teamChips(null, null)).toEqual([])
  })

  it('splits the emoji from the name', () => {
    expect(splitTitle('🎬 Director')).toEqual({ mark: '🎬', name: 'Director' })
    expect(splitTitle('Director')).toEqual({ mark: '•', name: 'Director' })
  })
})

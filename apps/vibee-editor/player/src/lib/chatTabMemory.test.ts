import { beforeEach, describe, expect, it } from 'vitest'
import {
  MARKET,
  OWN_CHAT,
  chatAddress,
  chatTabHref,
  readChatTabMemory,
  rememberChatTab,
} from './chatTabMemory'
import { TAB_ROUTE_PATTERNS } from './primaryNavigation'

const at = (pathname: string, search = '') => ({ pathname, search })

describe('the agents tab: the market once, then the chat left last', () => {
  beforeEach(() => window.localStorage.clear())

  it('leads to the market the first time', () => {
    expect(chatTabHref(at('/feed'), readChatTabMemory())).toBe(MARKET)
  })

  it('after the market was seen, leads to the own chat', () => {
    rememberChatTab('/agents')
    expect(chatTabHref(at('/feed'), readChatTabMemory())).toBe(OWN_CHAT)
  })

  it('returns to the client chat that was open', () => {
    rememberChatTab('/agents')
    rememberChatTab('/crm/144022504/chat')
    rememberChatTab('/feed')
    expect(chatTabHref(at('/browser'), readChatTabMemory())).toBe(
      '/crm/144022504/chat'
    )
  })

  it('returns to the conversation, not just the thread', () => {
    rememberChatTab('/agents/job/work', '?c=abcd1234&utm=x')
    expect(chatTabHref(at('/feed'), readChatTabMemory())).toBe(
      '/agents/job/work?c=abcd1234'
    )
  })

  it('opening a chat by a link counts as having seen the market', () => {
    rememberChatTab('/chat')
    expect(chatTabHref(at('/feed'), readChatTabMemory())).toBe(OWN_CHAT)
  })

  it('the last chat wins over an earlier one', () => {
    rememberChatTab('/crm/144022504/chat')
    rememberChatTab('/agents/blogger/work')
    expect(readChatTabMemory().last).toBe('/agents/blogger/work')
  })

  it('pages that are not chats are never kept', () => {
    rememberChatTab('/crm/144022504/chat')
    for (const p of [
      '/agents/job',
      '/crm/144022504',
      '/crm',
      '/agents/connect',
    ])
      rememberChatTab(p)
    expect(readChatTabMemory().last).toBe('/crm/144022504/chat')
  })

  it('inside a chat the tab stays on it', () => {
    rememberChatTab('/crm/144022504/chat')
    expect(chatTabHref(at('/chat', '?c=wxyz9876'), readChatTabMemory())).toBe(
      '/chat?c=wxyz9876'
    )
  })

  it('a stored address that is not a chat is ignored', () => {
    window.localStorage.setItem('vibee.chatTab.marketSeen', '1')
    window.localStorage.setItem('vibee.chatTab.last', '/evil.example/x')
    expect(chatTabHref(at('/feed'), readChatTabMemory())).toBe(OWN_CHAT)
  })

  it('a malformed conversation is dropped from the address', () => {
    expect(chatAddress('/chat', '?c=../../x')).toBe('/chat')
  })

  it('the client chat lights the agents tab', () => {
    expect(TAB_ROUTE_PATTERNS.chat.test('/crm/144022504/chat')).toBe(true)
    expect(TAB_ROUTE_PATTERNS.chat.test('/crm/144022504')).toBe(false)
  })
})

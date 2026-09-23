import { describe, expect, it } from 'vitest'
import { marketplaceAgentPrompt, systemPrompt } from './src/agent/chat'
import { threadFor } from './src/agent/routes'

describe('the first labour-market agent is real and isolated', () => {
  it('gives Blogger the complete publication contract', () => {
    const prompt = marketplaceAgentPrompt('blogger')
    expect(prompt).toContain('БЛОГЕР T27')
    expect(prompt).toContain('полные EN и RU версии')
    expect(prompt).toContain('трёхпанельный')
    expect(prompt).toContain('хештегов')
    expect(prompt).toContain('контекстный офер')
    expect(prompt).toContain('X, LinkedIn и Telegram')
    expect(systemPrompt('miniapp', false, 'blogger')).toContain(prompt)
  })

  it('refuses catalogue cards that are still training', async () => {
    const getPool = () => {
      throw new Error('the market gate must not touch the database')
    }
    await expect(threadFor(null, '42', getPool, 'blogger')).resolves.toEqual({
      ok: true,
      thread: 'agent:blogger',
      client: null,
      agent: 'blogger',
    })
    await expect(threadFor(null, '42', getPool, 'google')).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'agent is not available',
    })
  })

  it('will not merge a client conversation with a hired-agent conversation', async () => {
    const getPool = () => {
      throw new Error('the ambiguity gate must answer first')
    }
    await expect(threadFor('12345', '42', getPool, 'blogger')).resolves.toEqual(
      {
        ok: false,
        status: 400,
        error: 'choose client or agent, not both',
      }
    )
  })
})

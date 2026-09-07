import { describe, expect, it, vi } from 'vitest'
import {
  TOOLS,
  TOOLS_BY_NAME,
  toMcpTools,
  toOpenAITools,
} from './src/agent/tools'

describe('agent task handoff to the Mini App', () => {
  const destinations = [
    'chat',
    'script',
    'audio',
    'image',
    'avatar',
    'video',
    'editor',
    'profile',
    'plan',
    'files',
    'skills',
  ]

  it('registers each tool exactly once on both agent transports', () => {
    const names = TOOLS.map(tool => tool.name)
    expect(names.length).toBe(new Set(names).size)
    expect(toMcpTools().filter(tool => tool.name === 'open_app')).toHaveLength(
      1
    )
    expect(
      toOpenAITools().filter(tool => tool.function.name === 'open_app')
    ).toHaveLength(1)
  })

  it.each(destinations)(
    'offers %s without reading data or starting a job',
    async destination => {
      const tool = TOOLS_BY_NAME.get('open_app')
      expect(tool).toBeDefined()
      const query = vi.fn(() => {
        throw new Error('navigation must not query')
      })
      const result = await tool!.handler(
        { destination },
        { telegramId: 'owner', pool: { query } }
      )
      expect(result).toEqual({ action: { type: 'open_mini_app', destination } })
      expect(query).not.toHaveBeenCalled()
    }
  )

  it.each([
    {},
    { destination: 'https://evil.example' },
    { destination: '../admin' },
    { destination: 'constructor' },
    { destination: 'audio', telegramId: 'other' },
    { destination: 'audio', url: 'https://evil.example' },
    { destination: 'editor', project_id: 'fake-task' },
  ])(
    'rejects unknown destinations or authority-bearing arguments',
    async args => {
      const tool = TOOLS_BY_NAME.get('open_app')
      expect(tool).toBeDefined()
      await expect(
        tool!.handler(args, { telegramId: 'owner', pool: { query: vi.fn() } })
      ).rejects.toThrow(/destination|argument/)
    }
  )
})

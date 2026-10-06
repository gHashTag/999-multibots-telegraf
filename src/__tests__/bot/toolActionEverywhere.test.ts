import fs from 'fs'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { TOOL_ACTIONS, actionForTool } from '@/helpers/telegramLongAnswer'
import {
  answerAsAgent,
  clearAgentBots,
  type AgentCtx,
} from '@/core/bot/agentHive/answer'
import { clearChain } from '@/core/bot/agentHive/chain'
import { replyToClient } from '@/core/bot/managedBots/runner'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'

/**
 * EVERY CHAT THE AGENT ANSWERS SHOWS WHAT IT IS DOING (#3683).
 *
 * #3665 switched the personal DM to "sending a photo…" while a picture tool
 * runs. Business DMs, managed bots and the agent hive still showed one
 * "typing…" (or none after five seconds). And the action was guessed from the
 * tool's name: `reel_analyze` showed "sending a video…" while it only read a
 * reel, `crm_deliver_photo` showed "typing…" while it drew one.
 */

const ROOT = path.join(__dirname, '..', '..', '..')
const RENDER_SRC = path.join(ROOT, 'apps', 'vibee-editor', 'render', 'src')

/** Every tool name the render registers, read from its source. */
function renderToolNames(): Set<string> {
  const names = new Set<string>()
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8')
        for (const m of src.matchAll(/\bname: '([a-z][a-z0-9_]+)'/g))
          names.add(m[1])
      }
    }
  }
  walk(RENDER_SRC)
  return names
}

// A word of the snake_case name starts with a media word: "invoice" is not
// "voice", "my_renders" is "render".
const SOUNDS_LIKE_MEDIA =
  /(?:^|_)(?:image|photo|picture|video|lipsync|reel|audio|voice|speech|tts|avatar|portrait|album|media|render|clip)/

describe('the tool map covers the render registry', () => {
  const names = renderToolNames()

  it('reads a real registry, not an empty folder', () => {
    expect(names.has('image_generate')).toBe(true)
    expect(names.has('lipsync_generate')).toBe(true)
    expect(names.size).toBeGreaterThan(100)
  })

  it('every tool that sounds like media has an explicit action', () => {
    const missing = [...names].filter(
      n => SOUNDS_LIKE_MEDIA.test(n) && !Object.hasOwn(TOOL_ACTIONS, n)
    )
    expect(missing).toEqual([])
  })

  it('every entry is a tool the render really has (no typo, no ghost)', () => {
    const ghosts = Object.keys(TOOL_ACTIONS).filter(n => !names.has(n))
    expect(ghosts).toEqual([])
  })
})

describe('actionForTool reads the map, not the name', () => {
  it('the cases the name used to get wrong', () => {
    expect(actionForTool('crm_deliver_photo')).toBe('upload_photo')
    expect(actionForTool('agent_avatars_make')).toBe('upload_photo')
    expect(actionForTool('crm_story_reel')).toBe('upload_video')
    expect(actionForTool('crm_voice_clone')).toBe('upload_voice')
    expect(actionForTool('reel_render')).toBe('upload_video')
    expect(actionForTool('reel_analyze')).toBe('typing')
    expect(actionForTool('tg_send_video')).toBe('typing')
  })

  it('a tool newer than the map still gets the obvious action', () => {
    expect(actionForTool('image_upscale')).toBe('upload_photo')
    expect(actionForTool('video_extend')).toBe('upload_video')
    expect(actionForTool('crm_history')).toBe('typing')
  })

  it('a prototype name is not a tool', () => {
    expect(actionForTool('constructor')).toBe('typing')
    expect(actionForTool('toString')).toBe('typing')
  })
})

describe('the agent hive shows the tool while it runs', () => {
  afterEach(() => {
    clearAgentBots()
    clearChain()
  })

  it('typing, then sending a photo, and nothing after the turn', async () => {
    vi.useFakeTimers()
    try {
      const actions: string[] = []
      const ctx: AgentCtx = {
        message: {
          message_id: 1,
          text: 'draw me',
          from: { id: 5, first_name: 'Dima', language_code: 'en' },
        },
        chat: { id: 5, type: 'private' },
        botInfo: { id: 11, username: 't27_blogger_bot' },
        telegram: {
          sendMessage: async () => ({ message_id: 2 }),
          sendChatAction: async (_chat, action) => void actions.push(action),
        },
      }
      const row = {
        botId: 11,
        botUsername: 't27_blogger_bot',
        ownerId: 144,
        agentId: 'blogger',
      } as ManagedBotRow
      await answerAsAgent(ctx, row, {
        ask: async (_id, _text, opts) => {
          opts.onTool?.('image_edit')
          await vi.advanceTimersByTimeAsync(8000)
          opts.onTool?.(null)
          return 'done'
        },
      })
      expect(actions[0]).toBe('typing')
      expect(actions).toContain('upload_photo')
      expect(actions.at(-1)).toBe('typing')
      const before = actions.length
      await vi.advanceTimersByTimeAsync(20_000)
      expect(actions).toHaveLength(before)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a managed bot hands the tool listener to the agent', () => {
  it('replyToClient passes onTool through to deps.answer', async () => {
    const heard: Array<string | null> = []
    await replyToClient(
      {
        answer: async (_c, _t, _f, _s, _textOnly, onTool) => {
          onTool?.('video_generate')
          return 'ok'
        },
        tellOwner: async () => undefined,
        access: async () => ({ paid: true, media: true }) as any,
      },
      { botId: 1, botUsername: 'b', ownerId: 2, manager: 'm' },
      { fromId: 3, fromName: 'A', text: 'hi', language: 'en' } as any,
      Date.now(),
      name => heard.push(name)
    )
    expect(heard).toEqual(['video_generate'])
  })
})

describe('the wiring stays in place', () => {
  const read = (...p: string[]) =>
    fs.readFileSync(path.join(ROOT, 'src', ...p), 'utf8')

  it('business DMs: the lane indicator follows the tool', () => {
    const src = read('services', 'businessBotService.ts')
    expect(src).toMatch(
      /onTool: name =>\s+typingStops\.get\(laneKey\)\?\.setAction\(actionForTool\(name\)\)/
    )
    expect(src).toContain('...(opts.onTool ? { onTool: opts.onTool } : {})')
  })

  it('managed bots: repeated, switched, stopped in finally', () => {
    const src = read('core', 'bot', 'managedBots', 'runner.ts')
    expect(src).toMatch(/name => typing\.setAction\(actionForTool\(name\)\)/)
    expect(src).toMatch(/finally \{\s+typing\(\)\s+\}/)
    expect(src).not.toContain("ctx.sendChatAction('typing')")
  })

  it('the manager deps forward the listener to answerClient', () => {
    const src = read('index.ts')
    expect(src).toContain('...(onTool ? { onTool } : {})')
  })
})

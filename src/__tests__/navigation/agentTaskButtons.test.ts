import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_TASK_ROUTES,
  buildAgentTaskUrl,
  createAgentTaskKeyboard,
  parseAgentTaskAction,
  replyWithAgentTaskButtons,
} from '@/navigation/helpers/agentTaskButtons'

const action = (destination: string) => ({
  type: 'open_mini_app',
  destination,
})

describe('agent task destinations', () => {
  it.each([
    ['chat', '/chat'],
    ['script', '/generate/script'],
    ['audio', '/generate/audio'],
    ['image', '/generate/image'],
    ['avatar', '/generate/avatar'],
    ['video', '/generate/video'],
    ['editor', '/generate/editor'],
    ['profile', '/profile'],
    ['plan', '/profile?tab=plan'],
    ['files', '/profile?tab=files'],
    ['skills', '/profile?tab=skills'],
  ])('opens %s at the supported screen', (destination, route) => {
    const parsed = parseAgentTaskAction(action(destination))
    expect(parsed).not.toBeNull()
    expect(buildAgentTaskUrl(parsed!)).toBe(`https://app.t27.ai${route}`)
    expect(
      AGENT_TASK_ROUTES[destination as keyof typeof AGENT_TASK_ROUTES]
    ).toBe(route)
  })

  it.each([
    null,
    {},
    { type: 'url', destination: 'chat' },
    action('https://evil.example'),
    action('__proto__'),
    action('constructor'),
    action('../admin'),
    { ...action('editor'), project_id: 'unverified-project' },
    { ...action('chat'), url: 'https://evil.example' },
    { ...action('profile'), telegram_id: '123456' },
  ])('rejects untrusted or unsupported action %j', input => {
    expect(parseAgentTaskAction(input)).toBeNull()
  })
})

describe('inline task buttons', () => {
  it('keeps at most two distinct actions in model order', () => {
    const markup = createAgentTaskKeyboard('private', false, [
      action('video'),
      action('video'),
      action('files'),
      action('profile'),
    ])
    expect(markup?.inline_keyboard.flat()).toHaveLength(2)
    expect(
      markup?.inline_keyboard.flat().map(button => button.web_app.url)
    ).toEqual([
      'https://app.t27.ai/generate/video',
      'https://app.t27.ai/profile?tab=files',
    ])
  })

  it('provides a chat continuation when no valid task was returned', () => {
    expect(createAgentTaskKeyboard('private', false, [action('bad')])).toEqual({
      inline_keyboard: [
        [
          {
            text: 'Continue in app',
            web_app: { url: 'https://app.t27.ai/chat' },
          },
        ],
      ],
    })
    expect(
      createAgentTaskKeyboard('private', true, [])?.inline_keyboard[0][0].text
    ).toBe('Продолжить в приложении')
  })

  it.each(['group', 'supergroup', 'channel', undefined])(
    'omits web apps from %s',
    chatType => {
      expect(
        createAgentTaskKeyboard(chatType, false, [action('video')])
      ).toBeUndefined()
    }
  )

  it('attaches context only to the final chunk of a long answer', async () => {
    const reply = vi.fn(async () => undefined)
    const text = `${'first paragraph '.repeat(310)}\n\nThe video is ready to edit.`
    expect(
      await replyWithAgentTaskButtons(
        { chat: { type: 'private' }, reply },
        text,
        [action('editor')],
        false
      )
    ).toBe(true)
    expect(reply.mock.calls.length).toBeGreaterThan(1)
    const calls = reply.mock.calls as unknown as Array<[string, unknown?]>
    expect(calls.slice(0, -1).every(call => call[1] === undefined)).toBe(true)
    expect(calls.at(-1)?.[1]).toEqual({
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Open editor',
              web_app: { url: 'https://app.t27.ai/generate/editor' },
            },
          ],
        ],
      },
    })
    expect(calls.every(call => call[0].length <= 4096)).toBe(true)
    expect(calls.map(call => call[0]).join(' ')).toContain(
      'The video is ready to edit.'
    )
  })

  it('delivers an action-only answer without sending an empty message', async () => {
    const reply = vi.fn(async () => undefined)
    expect(
      await replyWithAgentTaskButtons(
        { chat: { type: 'private' }, reply },
        '',
        [action('plan')],
        true
      )
    ).toBe(true)
    expect(reply).toHaveBeenCalledWith('Откройте нужный экран в приложении.', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Открыть план',
              web_app: { url: 'https://app.t27.ai/profile?tab=plan' },
            },
          ],
        ],
      },
    })
  })

  it('does not turn an empty failed agent answer into a successful reply', async () => {
    const reply = vi.fn(async () => undefined)
    expect(
      await replyWithAgentTaskButtons(
        { chat: { type: 'private' }, reply },
        '',
        [],
        false
      )
    ).toBe(false)
    expect(reply).not.toHaveBeenCalled()
  })

  it('delivers group text without an invalid web_app keyboard', async () => {
    const reply = vi.fn(async () => undefined)
    await replyWithAgentTaskButtons(
      { chat: { type: 'group' }, reply },
      'Answer',
      [action('chat')],
      false
    )
    expect(reply).toHaveBeenCalledExactlyOnceWith('Answer')
  })
})

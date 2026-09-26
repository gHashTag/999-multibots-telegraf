import { describe, expect, it } from 'vitest'
import { supervisorBlock, toolsField } from './chat'

/**
 * THE QUEEN SUPERVISES; SHE HAS NO HANDS.
 *
 * Pinned: her brief says she never writes to the client, has no tools, and
 * sets the agent tasks in the one marker the app turns into a press; it
 * carries what the agent has been doing, or says there is nothing yet. And
 * a turn with every tool denied sends no `tools` field at all (an empty list
 * is refused by some providers).
 */
describe('supervisorBlock', () => {
  it('names the role, the limits and the task marker', () => {
    const b = supervisorBlock('АГЕНТ: подготовил портрет') // cyrillic-ok
    expect(b).toContain('КОРОЛЕВА') // cyrillic-ok
    expect(b).toContain('не пишешь клиенту никогда') // cyrillic-ok
    expect(b).toContain('Инструментов у тебя нет') // cyrillic-ok
    expect(b).toContain('[[task: ')
    expect(b).toContain('АГЕНТ: подготовил портрет') // cyrillic-ok
  })
  it('says there is no agent work yet instead of an empty block', () => {
    expect(supervisorBlock('')).toContain('пока ничего не было') // cyrillic-ok
  })
})

describe('toolsField', () => {
  it('omits tools and tool_choice when there is nothing to offer', () => {
    expect(toolsField([])).toEqual({})
    expect(toolsField([{ type: 'function' }])).toEqual({
      tools: [{ type: 'function' }],
      tool_choice: 'auto',
    })
  })
})

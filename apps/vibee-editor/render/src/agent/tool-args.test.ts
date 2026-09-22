import { describe, it, expect } from 'vitest'
import { argsProblem, assertArgs } from './tool-args'
import { TOOLS_BY_NAME } from './tools'

const evaluate = {
  name: 'browser_evaluate',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string' } },
    required: ['code'],
    additionalProperties: false,
  },
}

describe('a call is checked against the tool s own schema', () => {
  it('refuses the wrong field name instead of answering {}', () => {
    expect(argsProblem(evaluate, { expression: '1' })).toBe(
      'browser_evaluate: missing code; unknown expression. It takes: code'
    )
  })

  it('refuses a missing id (close_tab closed "undefined")', () => {
    expect(() =>
      assertArgs(
        {
          name: 'browser_close_tab',
          parameters: {
            properties: { id: {} },
            required: ['id'],
          },
        },
        {}
      )
    ).toThrow(/missing id/)
  })

  it('lets a good call through', () => {
    expect(argsProblem(evaluate, { code: '1' })).toBeNull()
  })

  it('tolerates extra fields where the schema allows them', () => {
    expect(
      argsProblem(
        { name: 't', parameters: { properties: { a: {} } } },
        { a: 1, b: 2 }
      )
    ).toBeNull()
  })

  it('every real tool accepts an empty call or says what it needs', () => {
    for (const tool of TOOLS_BY_NAME.values()) {
      const p = argsProblem(tool, {})
      const req = (tool.parameters as { required?: string[] }).required ?? []
      expect(p === null).toBe(req.length === 0)
    }
  })
})

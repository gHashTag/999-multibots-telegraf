/**
 * Tests for escapeMarkdown.ts
 *
 * Markdown V2 escape utility
 */

import { describe, it, expect } from 'vitest'
import {
  escapeMarkdownV2,
  escapeMarkdownV2CodeBlock,
} from '@/helpers/escapeMarkdown'

describe('escapeMarkdownV2', () => {
  describe('special characters', () => {
    it('should escape underscore', () => {
      expect(escapeMarkdownV2('hello_world')).toBe('hello\\_world')
    })

    it('should escape asterisk', () => {
      expect(escapeMarkdownV2('hello*world')).toBe('hello\\*world')
    })

    it('should escape square brackets', () => {
      expect(escapeMarkdownV2('hello[world]')).toBe('hello\\[world\\]')
    })

    it('should escape parentheses', () => {
      expect(escapeMarkdownV2('hello(world)')).toBe('hello\\(world\\)')
    })

    it('should escape tilde', () => {
      expect(escapeMarkdownV2('hello~world')).toBe('hello\\~world')
    })

    it('should escape backtick', () => {
      expect(escapeMarkdownV2('hello`world')).toBe('hello\\`world')
    })

    it('should escape greater than', () => {
      expect(escapeMarkdownV2('hello>world')).toBe('hello\\>world')
    })

    it('should escape hash', () => {
      expect(escapeMarkdownV2('hello#world')).toBe('hello\\#world')
    })

    it('should escape plus', () => {
      expect(escapeMarkdownV2('hello+world')).toBe('hello\\+world')
    })

    it('should escape minus/hyphen', () => {
      expect(escapeMarkdownV2('hello-world')).toBe('hello\\-world')
    })

    it('should escape equals', () => {
      expect(escapeMarkdownV2('hello=world')).toBe('hello\\=world')
    })

    it('should escape pipe', () => {
      expect(escapeMarkdownV2('hello|world')).toBe('hello\\|world')
    })

    it('should escape curly braces', () => {
      expect(escapeMarkdownV2('hello{world}')).toBe('hello\\{world\\}')
    })

    it('should escape period', () => {
      expect(escapeMarkdownV2('hello.world')).toBe('hello\\.world')
    })

    it('should escape exclamation mark', () => {
      expect(escapeMarkdownV2('hello!world')).toBe('hello\\!world')
    })

    it('should escape backslash', () => {
      expect(escapeMarkdownV2('hello\\world')).toBe('hello\\\\world')
    })
  })

  describe('multiple characters', () => {
    it('should escape multiple special characters', () => {
      expect(escapeMarkdownV2('*bold* _italic_ `code`')).toBe(
        '\\*bold\\* \\_italic\\_ \\`code\\`'
      )
    })

    it('should escape complex markdown', () => {
      expect(escapeMarkdownV2('[link](http://example.com)')).toBe(
        '\\[link\\]\\(http://example\\.com\\)'
      )
    })

    it('should handle consecutive special characters', () => {
      expect(escapeMarkdownV2('***bold***')).toBe('\\*\\*\\*bold\\*\\*\\*')
    })
  })

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(escapeMarkdownV2('')).toBe('')
    })

    it('should not modify text without special characters', () => {
      expect(escapeMarkdownV2('hello world')).toBe('hello world')
    })

    it('should not modify numbers', () => {
      expect(escapeMarkdownV2('12345')).toBe('12345')
    })

    it('should preserve spaces', () => {
      expect(escapeMarkdownV2('hello   world')).toBe('hello   world')
    })

    it('should preserve newlines', () => {
      expect(escapeMarkdownV2('hello\nworld')).toBe('hello\nworld')
    })

    it('should handle unicode characters', () => {
      expect(escapeMarkdownV2('привет*мир')).toBe('привет\\*мир')
    })

    it('should handle emojis with special characters', () => {
      expect(escapeMarkdownV2('⭐ *stars*')).toBe('⭐ \\*stars\\*')
    })
  })

  describe('real-world examples', () => {
    it('should escape telegram message with formatting', () => {
      const input = 'Баланс: 100⭐ | Статус: *активен*'
      const expected = 'Баланс: 100⭐ \\| Статус: \\*активен\\*'
      expect(escapeMarkdownV2(input)).toBe(expected)
    })

    it('should escape URL in text', () => {
      const input = 'Сайт: https://example.com/path?query=1'
      const expected = 'Сайт: https://example\\.com/path?query\\=1'
      expect(escapeMarkdownV2(input)).toBe(expected)
    })

    it('should escape command with arguments', () => {
      const input = '/start arg1=value1'
      const expected = '/start arg1\\=value1'
      expect(escapeMarkdownV2(input)).toBe(expected)
    })
  })
})

// A backtick or backslash embedded raw in a MarkdownV2 code block breaks the
// fence -> Telegram rejects the whole message. sendImprovedPrompt (improve-prompt
// wizard) puts LLM output in a code block, so it must escape via this.
describe('escapeMarkdownV2CodeBlock (for text inside ``` fences)', () => {
  it('escapes backticks', () => {
    expect(escapeMarkdownV2CodeBlock('a `code` b')).toBe('a \\`code\\` b')
  })
  it('escapes backslashes', () => {
    expect(escapeMarkdownV2CodeBlock('a\\b')).toBe('a\\\\b')
  })
  it('leaves other MarkdownV2 specials untouched (they are literal in a code block)', () => {
    const s = 'photo of a cat, cinematic (8k). vibrant-colors! #trending'
    expect(escapeMarkdownV2CodeBlock(s)).toBe(s)
  })
  it('escapes a backslash before a backtick without producing a raw backtick', () => {
    // \` raw would still break the fence; both chars must end up escaped
    expect(escapeMarkdownV2CodeBlock('x\\`y')).toBe('x\\\\\\`y')
  })
})

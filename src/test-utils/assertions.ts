import { Context } from 'telegraf'
import { Update } from 'telegraf/types'

/**
 * Asserts that a reply contains the given text
 */
export function assertReplyContains(ctx: Context<Update>, text: string) {
  const replies = (ctx as any).replies || []
  const found = replies.some((reply: any) => {
    if (typeof reply === 'string') {
      return reply.includes(text)
    }
    if (reply.text) {
      return reply.text.includes(text)
    }
    return false
  })

  if (!found) {
    throw new Error(
      `Expected reply to contain "${text}" but got:\n${JSON.stringify(replies, null, 2)}`
    )
  }
}

/**
 * Asserts that a keyboard with specific buttons is present in a reply
 */
export function assertReplyKeyboard(ctx: Context<Update>, buttons: string[][]) {
  const replies = (ctx as any).replies || []
  const keyboard = replies.find(
    (reply: any) => reply.reply_markup && reply.reply_markup.keyboard
  )

  if (!keyboard) {
    throw new Error(
      `Expected reply to contain a keyboard but got:\n${JSON.stringify(replies, null, 2)}`
    )
  }

  const replyKeyboard = keyboard.reply_markup.keyboard

  // Check if each expected button row exists in the actual keyboard
  buttons.forEach((buttonRow, rowIndex) => {
    if (rowIndex >= replyKeyboard.length) {
      throw new Error(
        `Expected keyboard to have at least ${rowIndex + 1} rows but got ${replyKeyboard.length}`
      )
    }

    buttonRow.forEach((buttonText, buttonIndex) => {
      const actualRow = replyKeyboard[rowIndex]

      if (buttonIndex >= actualRow.length) {
        throw new Error(
          `Expected row ${rowIndex} to have at least ${buttonIndex + 1} buttons but got ${actualRow.length}`
        )
      }

      const actualButton = actualRow[buttonIndex]
      const actualButtonText =
        typeof actualButton === 'string' ? actualButton : actualButton.text

      if (actualButtonText !== buttonText) {
        throw new Error(
          `Expected button at row ${rowIndex}, position ${buttonIndex} to be "${buttonText}" but got "${actualButtonText}"`
        )
      }
    })
  })
}

/**
 * Asserts that a reply contains an inline keyboard with specific buttons
 */
export function assertReplyInlineKeyboard(
  ctx: Context<Update>,
  buttons: string[][]
) {
  const replies = (ctx as any).replies || []
  const keyboard = replies.find(
    (reply: any) => reply.reply_markup && reply.reply_markup.inline_keyboard
  )

  if (!keyboard) {
    throw new Error(
      `Expected reply to contain an inline keyboard but got:\n${JSON.stringify(replies, null, 2)}`
    )
  }

  const inlineKeyboard = keyboard.reply_markup.inline_keyboard

  // Check if each expected button row exists in the actual keyboard
  buttons.forEach((buttonRow, rowIndex) => {
    if (rowIndex >= inlineKeyboard.length) {
      throw new Error(
        `Expected inline keyboard to have at least ${rowIndex + 1} rows but got ${inlineKeyboard.length}`
      )
    }

    buttonRow.forEach((buttonText, buttonIndex) => {
      const actualRow = inlineKeyboard[rowIndex]

      if (buttonIndex >= actualRow.length) {
        throw new Error(
          `Expected row ${rowIndex} to have at least ${buttonIndex + 1} buttons but got ${actualRow.length}`
        )
      }

      const actualButton = actualRow[buttonIndex]

      if (actualButton.text !== buttonText) {
        throw new Error(
          `Expected button at row ${rowIndex}, position ${buttonIndex} to be "${buttonText}" but got "${actualButton.text}"`
        )
      }
    })
  })
}

/**
 * Asserts that a specific function was called with specific arguments
 */
export function assertCalled(fn: any, expectedArgs?: any[]) {
  if (!fn.mock) {
    throw new Error('Function is not a mock')
  }

  if (fn.mock.calls.length === 0) {
    throw new Error('Expected function to be called but it was not')
  }

  if (expectedArgs) {
    const lastCallArgs = fn.mock.calls[fn.mock.calls.length - 1]

    expectedArgs.forEach((arg, index) => {
      if (JSON.stringify(lastCallArgs[index]) !== JSON.stringify(arg)) {
        throw new Error(
          `Expected argument ${index} to be ${JSON.stringify(arg)} but got ${JSON.stringify(lastCallArgs[index])}`
        )
      }
    })
  }
}

/**
 * Extends the mock context with a clearReplies method
 */
export function addClearRepliesToContext(ctx: Context<Update>) {
  ;(ctx as any).clearReplies = () => {
    ;(ctx as any).replies = []
  }

  return ctx
}

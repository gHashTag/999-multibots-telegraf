/**
 * Unit tests for menu utilities and keyboards
 */
import { jest, describe, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

import { cancelHelpArray } from '../../src/menu/cancelHelpArray'
import { cancelMenu } from '../../src/menu/cancelMenu'
import { getStepSelectionMenu } from '../../src/menu/getStepSelectionMenu'
import { getStepSelectionMenuV2 } from '../../src/menu/getStepSelectionMenuV2'
import { videoModelKeyboard } from '../../src/menu/videoModelMenu'
import { createGenerateImageKeyboard } from '../../src/menu'
import { startMenu } from '../../src/menu/startMenu'
import { levels } from '../../src/menu/mainMenu'

describe('cancelHelpArray', () => {
  it('returns Russian commands when isRu=true', () => {
    expect(cancelHelpArray(true)).toEqual([
      ['Справка по команде'],
      ['Отмена'],
    ])
  })
  it('returns English commands when isRu=false', () => {
    expect(cancelHelpArray(false)).toEqual([
      ['Help for the command'],
      ['Cancel'],
    ])
  })
})

describe('cancelMenu', () => {
  it('builds a Russian keyboard', () => {
    const markup: any = cancelMenu(true)
    const rm = markup.reply_markup
    expect(rm.keyboard).toEqual([[{ text: 'Отмена' }]])
    expect(rm.resize_keyboard).toBe(true)
  })
  it('builds an English keyboard', () => {
    const markup: any = cancelMenu(false)
    const rm = markup.reply_markup
    expect(rm.keyboard).toEqual([[{ text: 'Cancel' }]])
    expect(rm.resize_keyboard).toBe(true)
  })
})

describe('getStepSelectionMenu', () => {
  it('includes correct Russian labels when isRu=true', () => {
    const markup: any = getStepSelectionMenu(true)
    const kb = markup.reply_markup.keyboard
    // First and last keys
    expect(kb[0][0].text).toBe('1000 шагов')
    const lastRow = kb[kb.length - 1]
    expect(lastRow).toEqual([
      { text: 'Справка по команде' },
      { text: 'Отмена' },
    ])
  })
  it('includes correct English labels when isRu=false', () => {
    const markup: any = getStepSelectionMenu(false)
    const kb = markup.reply_markup.keyboard
    expect(kb[0][0].text).toBe('1000 steps')
    const lastRow = kb[kb.length - 1]
    expect(lastRow).toEqual([
      { text: 'Help for the command' },
      { text: 'Cancel' },
    ])
  })
})

describe('getStepSelectionMenuV2', () => {
  it('includes correct Russian labels when isRu=true', () => {
    const markup: any = getStepSelectionMenuV2(true)
    const kb = markup.reply_markup.keyboard
    expect(kb[0][0].text).toBe('100 шагов')
    const last = kb[kb.length - 1]
    expect(last).toEqual([
      { text: 'Справка по команде' },
      { text: 'Отмена' },
    ])
  })
  it('includes correct English labels when isRu=false', () => {
    const markup: any = getStepSelectionMenuV2(false)
    const kb = markup.reply_markup.keyboard
    expect(kb[0][0].text).toBe('100 steps')
    const last = kb[kb.length - 1]
    expect(last).toEqual([
      { text: 'Help for the command' },
      { text: 'Cancel' },
    ])
  })
})

describe('videoModelKeyboard', () => {
  it('builds correct Russian keyboard', () => {
    const markup: any = videoModelKeyboard(true)
    const kb = markup.reply_markup.keyboard
    expect(kb[0].map(b => b.text)).toEqual(['Minimax', 'Haiper'])
    const last = kb[kb.length - 1]
    expect(last).toEqual([
      { text: 'Справка по команде' },
      { text: 'Отмена' },
    ])
  })
  it('builds correct English keyboard', () => {
    const markup: any = videoModelKeyboard(false)
    const kb = markup.reply_markup.keyboard
    expect(kb[0].map(b => b.text)).toEqual(['Minimax', 'Haiper'])
    const last = kb[kb.length - 1]
    expect(last).toEqual([
      { text: 'Help for the command' },
      { text: 'Cancel' },
    ])
  })
})

describe('createGenerateImageKeyboard', () => {
  it('creates inline keyboard with generate and cancel buttons', () => {
    const ik = createGenerateImageKeyboard()
    expect(ik.inline_keyboard).toBeDefined()
    expect(ik.inline_keyboard[0]).toEqual([
      { text: 'Сгенерировать', callback_data: 'generate_image' },
      { text: 'Отмена', callback_data: 'cancel' },
    ])
  })
})

describe('startMenu', () => {
  it('replies with Russian menu', async () => {
    const ctx = makeMockContext()
    await startMenu(ctx, true)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [msg, extra] = ctx.reply.mock.calls[0]
    expect(msg).toBe('Выберите действие в меню:')
    const kb = extra.reply_markup.keyboard
    expect(kb).toEqual([[{ text: levels[104].title_ru }]])
    expect(extra.reply_markup.resize_keyboard).toBe(true)
  })
  it('replies with English menu', async () => {
    const ctx = makeMockContext()
    await startMenu(ctx, false)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [msg, extra] = ctx.reply.mock.calls[0]
    expect(msg).toBe('Choose an action in the menu:')
    const kb = extra.reply_markup.keyboard
    expect(kb).toEqual([[{ text: levels[104].title_en }]])
    expect(extra.reply_markup.resize_keyboard).toBe(true)
  })
})

describe('createHelpCancelKeyboard', () => {
  it('builds keyboard with help and cancel for Russian', () => {
    const markup: any = require('../../src/menu/createHelpCancelKeyboard/createHelpCancelKeyboard').createHelpCancelKeyboard(true)
    const rm = markup.reply_markup
    expect(rm.keyboard).toEqual([
      [{ text: 'Справка по команде' }],
      [{ text: 'Отмена' }],
    ])
  })
  it('builds keyboard with help and cancel for English', () => {
    const markup: any = require('../../src/menu/createHelpCancelKeyboard/createHelpCancelKeyboard').createHelpCancelKeyboard(false)
    const rm = markup.reply_markup
    expect(rm.keyboard).toEqual([
      [{ text: 'Help for the command' }],
      [{ text: 'Cancel' }],
    ])
  })
})

describe('sendGenerationErrorMessage', () => {
  it('replies with generation error message', async () => {
    const { sendGenerationErrorMessage } = require('../../src/menu/sendGenerationErrorMessage')
    const ctx = makeMockContext()
    await sendGenerationErrorMessage(ctx, false)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ An error occurred while generating. Please try again later.'
    )
  })
})

describe('sendPromptImprovementMessage', () => {
  it('replies with starting prompt improvement message', async () => {
    const { sendPromptImprovementMessage } = require('../../src/menu/sendPromptImprovementMessage')
    const ctx = makeMockContext()
    await sendPromptImprovementMessage(ctx, true)
    expect(ctx.reply).toHaveBeenCalledWith('⏳ Начинаю улучшение промпта...')
  })
})

describe('sendPromptImprovementFailureMessage', () => {
  it('replies with failure prompt improvement message', async () => {
    const { sendPromptImprovementFailureMessage } = require('../../src/menu/sendPromptImprovementFailureMessage')
    const ctx = makeMockContext()
    await sendPromptImprovementFailureMessage(ctx, false)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Failed to improve prompt')
  })
})

describe('sendPhotoDescriptionRequest', () => {
  it('replies requesting neurophoto description in Russian', async () => {
    const { sendPhotoDescriptionRequest } = require('../../src/menu/sendPhotoDescriptionRequest')
    const ctx = makeMockContext()
    await sendPhotoDescriptionRequest(ctx, true, 'neuro_photo')
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Опишите на английском, какую нейрофотографию вы хотите сгенерировать.',
      { reply_markup: expect.any(Object) }
    )
  })
  it('replies requesting photo description in English for other mode', async () => {
    const { sendPhotoDescriptionRequest } = require('../../src/menu/sendPhotoDescriptionRequest')
    const ctx = makeMockContext()
    await sendPhotoDescriptionRequest(ctx, false, 'other')
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Describe what kind of фотографию you want to generate in English.',
      { reply_markup: expect.any(Object) }
    )
  })
})
})
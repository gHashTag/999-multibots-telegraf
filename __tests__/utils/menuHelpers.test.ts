import { describe, it, expect } from '@jest/globals'
import { createHelpCancelKeyboard } from '../../src/menu/createHelpCancelKeyboard/createHelpCancelKeyboard'
import { cancelHelpArray } from '../../src/menu/cancelHelpArray'
import { mainMenu } from '@/menu'

describe('cancelHelpArray', () => {
  it('returns Russian array when isRu true', () => {
    const arr = cancelHelpArray(true)
    expect(arr).toEqual([['Справка по команде'], ['Отмена']])
  })

  it('returns English array when isRu false', () => {
    const arr = cancelHelpArray(false)
    expect(arr).toEqual([['Help for the command'], ['Cancel']])
  })
})

import { videoModelKeyboard } from '../../src/menu/videoModelMenu'

describe('videoModelKeyboard', () => {
  it('creates correct keyboard for Russian', () => {
    const kb = videoModelKeyboard(true) as any
    const rows = kb.reply_markup.keyboard
    expect(rows).toEqual([
      ['Minimax', 'Haiper'],
      ['Ray', 'I2VGen-XL'],
      ['Справка по команде', 'Отмена'],
    ])
  })

  it('creates correct keyboard for English', () => {
    const kb = videoModelKeyboard(false) as any
    const rows = kb.reply_markup.keyboard
    expect(rows).toEqual([
      ['Minimax', 'Haiper'],
      ['Ray', 'I2VGen-XL'],
      ['Help for the command', 'Cancel'],
    ])
  })
})

import { cancelMenu } from '../../src/menu/cancelMenu'
import { getStepSelectionMenu } from '../../src/menu/getStepSelectionMenu'
import { getStepSelectionMenuV2 } from '../../src/menu/getStepSelectionMenuV2'
import { startMenu } from '../../src/menu/startMenu'
import makeMockContext from './mockTelegrafContext'

describe('cancelMenu', () => {
  it('creates keyboard with single Cancel button in Russian', () => {
    const kb = cancelMenu(true) as any
    expect(kb.reply_markup.keyboard).toEqual([['Отмена']])
  })
  it('creates keyboard with single Cancel button in English', () => {
    const kb = cancelMenu(false) as any
    expect(kb.reply_markup.keyboard).toEqual([['Cancel']])
  })
})

describe('getStepSelectionMenu', () => {
  it('builds first-level step menu in Russian', () => {
    const kb = getStepSelectionMenu(true) as any
    const rows = kb.reply_markup.keyboard
    expect(rows[0]).toEqual(['1000 шагов', '1500 шагов', '2000 шагов'])
    expect(rows[3]).toEqual(['Справка по команде', 'Отмена'])
  })
  it('builds first-level step menu in English', () => {
    const kb = getStepSelectionMenu(false) as any
    const rows = kb.reply_markup.keyboard
    expect(rows[0]).toEqual(['1000 steps', '1500 steps', '2000 steps'])
    expect(rows[3]).toEqual(['Help for the command', 'Cancel'])
  })
})

describe('getStepSelectionMenuV2', () => {
  it('builds second-level step menu in Russian', () => {
    const kb = getStepSelectionMenuV2(true) as any
    const rows = kb.reply_markup.keyboard
    expect(rows[0]).toEqual(['100 шагов', '200 шагов', '300 шагов'])
    expect(rows[3]).toEqual(['Справка по команде', 'Отмена'])
  })
  it('builds second-level step menu in English', () => {
    const kb = getStepSelectionMenuV2(false) as any
    const rows = kb.reply_markup.keyboard
    expect(rows[0]).toEqual(['100 steps', '200 steps', '300 steps'])
    expect(rows[3]).toEqual(['Help for the command', 'Cancel'])
  })
})

describe('startMenu', () => {
  it('sends start menu in Russian', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'ru'
    await startMenu(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите действие в меню:',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })
  it('sends start menu in English', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    await startMenu(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose an action in the menu:',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })
})
// Tests for imageModelMenu
import { imageModelMenu } from '../../src/menu/imageModelMenu'

describe('imageModelMenu', () => {
  it('builds keyboard for Russian', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'ru'
    await imageModelMenu(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Выберите модель для генерации:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: [
            ['A', 'B'],
            ['Отмена', 'Справка по команде'],
            ['🏠 Главное меню'],
          ],
        }),
      })
    )
  })

  it('builds keyboard for English', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    await imageModelMenu(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Choose a model for generation:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: [
            ['A', 'B'],
            ['Cancel', 'Help for the command'],
            ['🏠 Main menu'],
          ],
        }),
      })
    )
  })
})

describe('createHelpCancelKeyboard', () => {
  it('creates a keyboard with correct buttons for Russian', () => {
    const keyboard = createHelpCancelKeyboard(true)
    // Markup.keyboard().resize() returns object with reply_markup.keyboard
    const rows = (keyboard as any).reply_markup.keyboard
    expect(rows).toEqual([['Справка по команде'], ['Отмена']])
  })

  it('creates a keyboard with correct buttons for English', () => {
    const keyboard = createHelpCancelKeyboard(false)
    const rows = (keyboard as any).reply_markup.keyboard
    expect(rows).toEqual([['Help for the command'], ['Cancel']])
  })
})
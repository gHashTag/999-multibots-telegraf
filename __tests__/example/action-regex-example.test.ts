import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
// Импортируем модуль целиком, чтобы шпионить за экспортированной функцией
import * as ActionModule from './action-regex-example'
import type { Update, CallbackQuery, Message, User } from '@telegraf/types'

// Расширяем контекст для хранения match
interface ContextWithMatch extends Context {
  match?: RegExpExecArray
}

const mockBotInfo: User = {
  id: 1,
  is_bot: true,
  first_name: 'RegexBot',
  username: 'regex_bot',
}

describe('Example: Action Regex Match', () => {
  let bot: Telegraf<ContextWithMatch>
  let mockContext: ContextWithMatch
  let apiSpy: ReturnType<typeof vi.spyOn>
  let callbackSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    bot = new Telegraf<ContextWithMatch>('fake-token-regex-example')

    // --- Мок API ---
    apiSpy = vi
      .spyOn(bot.telegram, 'callApi')
      .mockImplementation(async (method, payload) => {
        if (method === 'getMe') return mockBotInfo
        if (method === 'answerCallbackQuery') {
          console.log(
            `Mock API: Handled answerCallbackQuery for ID: ${(payload as any)?.callback_query_id}`
          )
          return true // Имитируем УСПЕШНЫЙ ответ
        }
        console.warn(`Unhandled API call in mock: ${method}`)
        // Для других методов возвращаем ошибку, чтобы увидеть, если что-то не учли
        // return {};
        throw new Error(`Mock Error: Unhandled API call ${method}`)
      })

    // --- Шпион на Коллбэк ---
    // Создаем шпиона ДО регистрации обработчика
    callbackSpy = vi.spyOn(ActionModule, 'exampleRegexActionCallback')

    // Регистрируем РЕАЛЬНЫЙ обработчик
    bot.action(/^item:(\d+)$/, ActionModule.exampleRegexActionCallback)

    // --- Мок Контекста ---
    const actionData = 'item:123'
    mockContext = {
      update: {
        update_id: 9,
        callback_query: {
          id: 'cb_query_id_abc',
          from: { id: 444, is_bot: false, first_name: 'RegexUser' },
          chat_instance: 'chat_instance_id_4',
          data: actionData,
          message: {
            message_id: 1000,
            date: Date.now(),
            chat: { id: 11122, type: 'private' },
            text: 'Item List',
          } as Message.TextMessage,
        } as CallbackQuery.DataCallbackQuery,
      } as Update.CallbackQueryUpdate,
      telegram: bot.telegram,
      botInfo: mockBotInfo,
      state: {},
      match: /^item:(\d+)$/.exec(actionData) ?? undefined,
      // Добавляем настоящие методы Telegraf, но шпионим за ними при необходимости
      reply: vi.fn(),
      answerCbQuery: vi.fn().mockResolvedValue(true), // Мок для внутренней логики, если нужна
    } as ContextWithMatch
  })

  // Очистка после каждого теста
  afterEach(() => {
    vi.restoreAllMocks() // Восстанавливаем все моки и шпионы
  })

  it('should call the callback with the correct context and match', async () => {
    // Запускаем обработку
    await bot.handleUpdate(mockContext.update)

    // Проверяем, что НАШ коллбэк был вызван
    expect(callbackSpy).toHaveBeenCalledTimes(1)
    // Проверяем, что контекст содержал правильный match
    expect(callbackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        match: expect.arrayContaining(['item:123', '123']),
      }),
      expect.any(Function) // next middleware
    )

    // Проверяем, что ИЗНУТРИ коллбэка был вызван API answerCallbackQuery
    expect(apiSpy).toHaveBeenCalledWith('answerCallbackQuery', {
      callback_query_id: 'cb_query_id_abc',
      text: undefined, // Или какой-то текст, если он передавался
    })
    // Проверяем, что ИЗНУТРИ коллбэка был вызван reply
    expect(mockContext.reply).toHaveBeenCalledWith('Selected item ID: 123')
  })

  it('should not call the callback if action data does not match regex', async () => {
    // Меняем данные в моке
    mockContext.update.callback_query!.data = 'other_action'
    mockContext.match = undefined // Telegraf бы не добавил match

    // Запускаем обработку
    await bot.handleUpdate(mockContext.update)

    // Проверяем, что НАШ коллбэк НЕ был вызван
    expect(callbackSpy).not.toHaveBeenCalled()
    // Проверяем, что reply НЕ был вызван
    expect(mockContext.reply).not.toHaveBeenCalled()
    // Проверяем, что answerCbQuery НЕ был вызван (т.к. коллбэк не запускался)
    expect(apiSpy).not.toHaveBeenCalledWith(
      'answerCallbackQuery',
      expect.anything()
    )
  })
})

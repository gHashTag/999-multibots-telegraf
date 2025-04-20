import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { handleModelCallback } from '@/handlers/handleModelCallback'
import { MyContext } from '@/interfaces'
import * as supabase from '@/core/supabase'
import { Message, Chat } from 'telegraf/types'

// Мокируем весь модуль supabase
jest.mock('@/core/supabase')

// Типизируем мок
const mockedSupabase = supabase as jest.Mocked<typeof supabase>

describe('handleModelCallback', () => {
  let ctx: Partial<MyContext>

  beforeEach(() => {
    jest.clearAllMocks()

    // Создаем полный мок PrivateChat
    const mockChat: Chat.PrivateChat = {
      id: 123,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
    }

    // Создаем мок сообщения для reply
    const mockMessage: Message.TextMessage = {
      message_id: 1,
      date: Date.now(),
      chat: mockChat,
      text: 'mock reply',
      from: { id: 456, is_bot: false, first_name: 'Bot' },
    }

    // Создаем базовый мок контекста
    ctx = {
      from: { id: 123, language_code: 'ru', is_bot: false, first_name: 'Test' },
      reply: jest.fn<() => Promise<Message.TextMessage>>().mockResolvedValue(mockMessage),
    }
    // Убедимся, что мок для updateUserModel существует и готов
    mockedSupabase.updateUserModel.mockResolvedValue(undefined)
  })

  it('должен вызывать updateUserModel с правильными аргументами', async () => {
    await handleModelCallback(ctx as MyContext, 'modelX')
    expect(mockedSupabase.updateUserModel).toHaveBeenCalledWith('123', 'modelX')
    expect(ctx.reply).toHaveBeenCalledWith('✅ Модель успешно изменена на modelX')
  })

  it('должен вызывать reply с сообщением об ошибке, если updateUserModel падает', async () => {
    const error = new Error('Supabase error')
    mockedSupabase.updateUserModel.mockRejectedValue(error)

    await handleModelCallback(ctx as MyContext, 'mymodel')

    expect(mockedSupabase.updateUserModel).toHaveBeenCalledWith('123', 'mymodel')
    expect(ctx.reply).toHaveBeenCalledWith('❌ Ошибка при изменении модели')
  })

  it('должен использовать английский текст, если язык не ru', async () => {
    ctx.from!.language_code = 'en'
    await handleModelCallback(ctx as MyContext, 'abc')
    expect(mockedSupabase.updateUserModel).toHaveBeenCalledWith('123', 'abc')
    expect(ctx.reply).toHaveBeenCalledWith('✅ Model successfully changed to abc')
  })

  it('должен использовать английский текст ошибки, если язык не ru', async () => {
    ctx.from!.language_code = 'en'
    const error = new Error('Supabase error')
    mockedSupabase.updateUserModel.mockRejectedValue(error)

    await handleModelCallback(ctx as MyContext, 'x')

    expect(mockedSupabase.updateUserModel).toHaveBeenCalledWith('123', 'x')
    expect(ctx.reply).toHaveBeenCalledWith('❌ Error changing model')
  })

  it('не должен падать, если ctx.from не определен (хотя TS не позволяет)', async () => {
    // @ts-expect-error Тестируем граничный случай
    delete ctx.from
    await handleModelCallback(ctx as MyContext, 'y')
    // В этом случае функция должна просто выйти, ничего не делая и не вызывая
    expect(mockedSupabase.updateUserModel).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
  })
})
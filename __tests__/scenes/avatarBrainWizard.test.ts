/* eslint-disable @typescript-eslint/ban-ts-comment */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { Scenes, MiddlewareFn } from 'telegraf'
// Импортируем User из typegram
import { Update, User } from 'telegraf/typings/core/types/typegram'
import makeMockContext from '../utils/mockTelegrafContext'
// Импортируем нужные типы
import { MyContext, MySession, UserModel } from '@/interfaces'
import { avatarBrainWizard } from '../../src/scenes/avatarBrainWizard'
// Импорты из index файлов
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { isRussian } from '@/helpers/language'
// Импорты из @/core/supabase
import {
  updateUserSoul,
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '@/core/supabase'

// Моки
jest.mock('@/menu')
jest.mock('@/handlers')
jest.mock('@/helpers/language')
jest.mock('@/core/supabase') // Мокаем весь модуль supabase

const mockedCreateHelpCancelKeyboard = jest.mocked(createHelpCancelKeyboard)
const mockedHandleHelpCancel = jest.mocked(handleHelpCancel)
const mockedIsRussian = jest.mocked(isRussian)
// Типизируем моки правильно
const mockedUpdateUserSoul = jest.mocked(updateUserSoul)
const mockedGetUserByTelegramId = jest.mocked(getUserByTelegramId)
const mockedUpdateUserLevelPlusOne = jest.mocked(updateUserLevelPlusOne)

const mockUserModel: UserModel = {
  model_name: 'test-brain-model',
  trigger_word: 'brain',
  model_url: 'org/brain:latest',
}

// Определяем тип для state, используемый в этом визарде
interface AvatarBrainWizardState {
  company?: string
  position?: string
}

// Передаем state через sessionData
const createMockSession = (
  initialState: AvatarBrainWizardState = {}
): MySession => ({
  userModel: mockUserModel,
  targetUserId: 'user123',
  images: [],
  cursor: 0,
  // Передаем state через __scenes, типизируя его
  __scenes: { state: initialState } as any,
})

// Мок для next()
const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue()

describe('avatarBrainWizard', () => {
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsRussian.mockReturnValue(true)
    mockedHandleHelpCancel.mockResolvedValue(false)
    mockedCreateHelpCancelKeyboard.mockReturnValue({
      reply_markup: { keyboard: [['Help'], ['Cancel']] },
    } as any)
    // Настроим базовые возвращаемые значения
    mockedUpdateUserSoul.mockResolvedValue(undefined) // Возвращает void
    mockedGetUserByTelegramId.mockResolvedValue({ data: { level: 1 } }) // Базовый уровень
    mockedUpdateUserLevelPlusOne.mockResolvedValue(undefined)
  })

  it('step 0: should ask for company name', async () => {
    const session = createMockSession()
    ctx = makeMockContext({ message: { text: 'start' } } as Update, session)

    const step0 = avatarBrainWizard.steps[0]
    await (step0 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      '👋 Привет, как называется ваша компания?',
      mockedCreateHelpCancelKeyboard(true)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: should save company and ask for position', async () => {
    const session = createMockSession()
    ctx = makeMockContext({ message: { text: 'AcmeCorp' } } as Update, session)

    const step1 = avatarBrainWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    // Проверяем косвенно - следующий шаг должен получить company из state
    expect(ctx.reply).toHaveBeenCalledWith(
      '💼 Какая у вас должность?',
      mockedCreateHelpCancelKeyboard(true)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 2: should save position and ask for skills', async () => {
    // Передаем company в начальном state
    const session = createMockSession({ company: 'AcmeCorp' })
    ctx = makeMockContext({ message: { text: 'Developer' } } as Update, session)

    const step2 = avatarBrainWizard.steps[2]
    await (step2 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      '🛠️ Какие у тебя навыки?',
      mockedCreateHelpCancelKeyboard(true)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 3: should save skills, update soul, check level <= 2 and leave', async () => {
    // Передаем company и position в начальном state
    const session = createMockSession({
      company: 'AcmeCorp',
      position: 'Developer',
    })
    const userFrom = { id: 555 } as User
    ctx = makeMockContext(
      { message: { text: 'JS, TS', from: userFrom } } as Update,
      session
    )

    // Устанавливаем нужный уровень для этого теста
    mockedGetUserByTelegramId.mockResolvedValue({ data: { level: 2 } })

    const step3 = avatarBrainWizard.steps[3]
    await (step3 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedUpdateUserSoul).toHaveBeenCalledWith(
      '555', // userId
      'AcmeCorp', // company (из state)
      'Developer', // position (из state)
      'JS, TS' // skills (из message)
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('✅ Аватар успешно получил информацию'),
      { parse_mode: 'HTML' }
    )
    expect(mockedGetUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(mockedUpdateUserLevelPlusOne).not.toHaveBeenCalled() // Уровень не должен обновляться
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.wizard.next).not.toHaveBeenCalled() // Не должен переходить дальше
  })

  it('step 3: should save skills, update soul, check level = 3, update level and leave', async () => {
    const session = createMockSession({
      company: 'BigCorp',
      position: 'Manager',
    })
    const userFrom = { id: 666 } as User
    ctx = makeMockContext(
      { message: { text: 'Leadership', from: userFrom } } as Update,
      session
    )

    mockedGetUserByTelegramId.mockResolvedValue({ data: { level: 3 } })

    const step3 = avatarBrainWizard.steps[3]
    await (step3 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedUpdateUserSoul).toHaveBeenCalledWith(
      '666',
      'BigCorp',
      'Manager',
      'Leadership'
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('✅ Аватар успешно получил информацию'),
      { parse_mode: 'HTML' }
    )
    expect(mockedGetUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(mockedUpdateUserLevelPlusOne).toHaveBeenCalledWith('666', 3) // Уровень должен обновиться
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

  it('step 3: should save skills, update soul, check level > 3 and leave', async () => {
    const session = createMockSession({ company: 'Startup', position: 'CTO' })
    const userFrom = { id: 777 } as User
    ctx = makeMockContext(
      { message: { text: 'Strategy', from: userFrom } } as Update,
      session
    )

    mockedGetUserByTelegramId.mockResolvedValue({ data: { level: 4 } })

    const step3 = avatarBrainWizard.steps[3]
    await (step3 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedUpdateUserSoul).toHaveBeenCalledWith(
      '777',
      'Startup',
      'CTO',
      'Strategy'
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('✅ Аватар успешно получил информацию'),
      { parse_mode: 'HTML' }
    )
    expect(mockedGetUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(mockedUpdateUserLevelPlusOne).not.toHaveBeenCalled() // Уровень не должен обновляться
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

  it('step 3: should throw error if user not found', async () => {
    const session = createMockSession({
      company: 'Ghost Inc.',
      position: 'Phantom',
    })
    const userFrom = { id: 404 } as User
    ctx = makeMockContext(
      { message: { text: 'Invisibility', from: userFrom } } as Update,
      session
    )

    mockedGetUserByTelegramId.mockResolvedValue({ data: null }) // Пользователь не найден

    const step3 = avatarBrainWizard.steps[3]
    await expect(
      (step3 as MiddlewareFn<MyContext>)(ctx, mockNext)
    ).rejects.toThrow('User with ID 404 does not exist.')

    // Проверяем, что updateUserSoul был вызван до ошибки
    expect(mockedUpdateUserSoul).toHaveBeenCalledWith(
      '404',
      'Ghost Inc.',
      'Phantom',
      'Invisibility'
    )
    expect(mockedUpdateUserLevelPlusOne).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled() // Не должен выйти штатно
  })
})

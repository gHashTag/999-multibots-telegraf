import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test'
import { AiAssistantService } from '@/services/plan_b/aiAssistantService'
import * as supabaseHelpers from '@/core/supabase' // Импортируем все как объект

// Мокируем весь модуль supabaseHelpers, возвращая объект с пустыми функциями
mock.module('@/core/supabase', () => ({
  getAiFeedbackFromSupabase: () => {
    /* мок */
  },
  updateHistory: () => {
    /* мок */
  },
}))

describe('AiAssistantService', () => {
  let aiAssistantService: AiAssistantService
  const mockTelegramId = '12345'
  const mockAssistantId = 'asst_abc'
  const mockReport = 'This is a test report.'
  const mockLangCode = 'en'
  const mockFullName = 'Test User'
  const mockAiResponse = 'This is the AI response.'
  // Создаем "шпионов" для мокированных функций, чтобы использовать .mockResolvedValue и др.
  let getAiFeedbackMock: ReturnType<typeof spyOn>
  let updateHistoryMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    aiAssistantService = new AiAssistantService()

    // Получаем ссылки на мокированные функции через spyOn
    getAiFeedbackMock = spyOn(supabaseHelpers, 'getAiFeedbackFromSupabase')
    updateHistoryMock = spyOn(supabaseHelpers, 'updateHistory')

    // Настраиваем мок getAiFeedbackFromSupabase
    getAiFeedbackMock.mockResolvedValue({
      ai_response: mockAiResponse,
    })
    // Настраиваем мок updateHistory (просто успешно разрешается)
    updateHistoryMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Восстанавливаем исходные реализации после каждого теста
    mock.restore()
  })

  it('should call getAiFeedbackFromSupabase and updateHistory with correct params and return AI response', async () => {
    const result = await aiAssistantService.getAiResponse(
      mockTelegramId,
      mockAssistantId,
      mockReport,
      mockLangCode,
      mockFullName
    )

    // Проверяем вызов getAiFeedbackFromSupabase
    expect(getAiFeedbackMock).toHaveBeenCalledTimes(1)
    expect(getAiFeedbackMock).toHaveBeenCalledWith({
      assistant_id: mockAssistantId,
      report: mockReport,
      language_code: mockLangCode,
      full_name: mockFullName,
    })

    // Проверяем вызов updateHistory
    expect(updateHistoryMock).toHaveBeenCalledTimes(1)
    expect(updateHistoryMock).toHaveBeenCalledWith({
      telegram_id: mockTelegramId,
      report: mockReport,
      ai_response: mockAiResponse,
    })

    // Проверяем возвращенный результат
    expect(result).toEqual({ ai_response: mockAiResponse })
  })

  // Добавим тест на случай ошибки в getAiFeedbackFromSupabase
  it('should throw error and not call updateHistory if getAiFeedbackFromSupabase fails', async () => {
    const error = new Error('Supabase feedback error')
    getAiFeedbackMock.mockRejectedValue(error)

    await expect(
      aiAssistantService.getAiResponse(
        mockTelegramId,
        mockAssistantId,
        mockReport,
        mockLangCode,
        mockFullName
      )
    ).rejects.toThrow(error)

    expect(updateHistoryMock).not.toHaveBeenCalled()
  })

  // Добавим тест на случай ошибки в updateHistory
  it('should throw error if updateHistory fails', async () => {
    const error = new Error('Supabase history error')
    updateHistoryMock.mockRejectedValue(error)

    await expect(
      aiAssistantService.getAiResponse(
        mockTelegramId,
        mockAssistantId,
        mockReport,
        mockLangCode,
        mockFullName
      )
    ).rejects.toThrow(error)

    expect(getAiFeedbackMock).toHaveBeenCalledTimes(1) // getAiFeedback должен быть вызван
    expect(updateHistoryMock).toHaveBeenCalledTimes(1) // updateHistory тоже должен быть вызван перед падением
  })
})

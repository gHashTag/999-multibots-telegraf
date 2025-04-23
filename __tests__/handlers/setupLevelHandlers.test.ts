import { setupLevelHandlers } from '@/handlers/setupLevelHandlers'
// Import handlers to reference them
import * as handlers from '@/scenes/levelQuestWizard/handlers'
import { ModeEnum } from '@/interfaces/modes'

describe('setupLevelHandlers', () => {
  let bot: any
  beforeEach(() => {
    bot = { action: jest.fn() }
  })

  it('registers 14 actions for levels, completion, and navigation', () => {
    setupLevelHandlers(bot as any)
    const expectedLevelActions = [
      'level_1',
      'level_2',
      'level_3',
      'level_4',
      'level_5',
      'level_6',
      'level_7',
      'level_8',
      'level_9',
      'level_10',
      'level_11',
      'level_complete',
    ]

    // Проверяем, что было 14 вызовов bot.action всего
    expect(bot.action).toHaveBeenCalledTimes(14)

    // Проверяем первые 12 вызовов для уровней
    expectedLevelActions.forEach((action, idx) => {
      expect(bot.action).toHaveBeenNthCalledWith(
        idx + 1,
        action,
        (handlers as any)[
          action === 'level_complete'
            ? 'handleQuestComplete'
            : `handleLevel${action.split('_')[1]}`
        ]
      )
    })

    // Проверяем дополнительные обработчики
    expect(bot.action.mock.calls[12][0]).toBe('go_subscribe')
    expect(bot.action.mock.calls[13][0]).toBe('go_help')
  })
})

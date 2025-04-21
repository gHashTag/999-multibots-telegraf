import { setupLevelHandlers } from '@/handlers/setupLevelHandlers'
// Import handlers to reference them
import * as handlers from '@/scenes/levelQuestWizard/handlers'

describe('setupLevelHandlers', () => {
  let bot: any
  beforeEach(() => {
    bot = { action: jest.fn() }
  })

  it('registers 12 actions for levels and completion', () => {
    setupLevelHandlers(bot as any)
    const expectedActions = [
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
    expect(bot.action).toHaveBeenCalledTimes(expectedActions.length)
    expectedActions.forEach((action, idx) => {
      expect(bot.action).toHaveBeenNthCalledWith(
        idx + 1,
        action,
        (handlers as any)[
          action === 'level_complete' ? 'handleQuestComplete' :
          `handleLevel${action.split('_')[1]}`
        ]
      )
    })
  })
})
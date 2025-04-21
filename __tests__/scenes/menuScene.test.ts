/**
 * Tests for menuScene (WizardScene)
 */
import { menuScene } from '../../src/scenes/menuScene'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/helpers', () => ({ isDev: true, isRussian: jest.fn() }))
jest.mock('../../src/menu/mainMenu', () => ({ mainMenu: jest.fn() }))
jest.mock('../../src/scenes/menuScene/getText', () => ({ getText: jest.fn() }))
// Supabase referral count is not called when isDev=true, so no need to mock getReferalsCountAndUserData

import { isRussian } from '../../src/helpers'
import { mainMenu } from '../../src/menu/mainMenu'
import { getText } from '../../src/scenes/menuScene/getText'

describe('menuScene - step 0 (menuCommandStep)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should reply with mainMenu text and keyboard, then call wizard.next when isDev=true', async () => {
    // Arrange
    const ctx = makeMockContext()
    // simulate language
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // simulate keyboard return
    const fakeKeyboard = { keyboard: [['A']] }
    ;(mainMenu as jest.Mock).mockResolvedValueOnce(fakeKeyboard)
    // simulate getText
    ;(getText as jest.Mock).mockReturnValueOnce('MENU TEXT')

    // Act: invoke step0
    // @ts-ignore
    const step0 = menuScene.steps[0]
    await step0(ctx)

    // Assert: mainMenu called with isRu true, inviteCount 0, subscription 'neurotester', level 0
    expect(mainMenu).toHaveBeenCalledWith({
      isRu: true,
      inviteCount: 0,
      subscription: 'neurotester',
      ctx,
      level: 0,
    })
    // getText called for 'mainMenu'
    expect(getText).toHaveBeenCalledWith(true, 'mainMenu')
    // reply called with message and keyboard
    expect(ctx.reply).toHaveBeenCalledWith('MENU TEXT', fakeKeyboard)
    // wizard.next called
    expect(ctx.wizard.next).toHaveBeenCalled()
  })
})

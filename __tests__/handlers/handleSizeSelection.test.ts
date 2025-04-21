import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'
import { ModeEnum } from '@/interfaces'

// Mock dependencies
jest.mock('@/core/supabase', () => ({
  setAspectRatio: jest.fn(),
  getReferalsCountAndUserData: jest.fn(),
}))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu', () => ({ mainMenu: jest.fn() }))

import { setAspectRatio, getReferalsCountAndUserData } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { mainMenu } from '@/menu'

function makeCtx() {
  return {
    from: { id: 42, toString: () => '42' },
    session: {} as any,
    reply: jest.fn(),
    scene: { enter: jest.fn() },
  } as any
}

describe('handleSizeSelection', () => {
  let ctx: any
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.enter = jest.fn(() => Promise.resolve())
  })

  it('handles neuro_photo mode in Russian', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(true)
    const testCtx = makeMockContext(
      {
        message: {
          from: {
            id: 1,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
        },
      } as any,
      { mode: ModeEnum.NeuroPhotoV2 }
    )
    testCtx.reply = ctx.reply
    testCtx.scene.enter = ctx.scene.enter

    await handleSizeSelection(testCtx as any, '16:9')
    expect(setAspectRatio).toHaveBeenCalledWith(1, '16:9')
    expect(testCtx.session.selectedSize).toBe('16:9')
    expect(testCtx.reply).toHaveBeenCalledWith('✅ Вы выбрали размер: 16:9')
    expect(testCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.NeuroPhotoV2)
  })

  it('handles text_to_image mode in English', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(false)
    const testCtx = makeMockContext(
      {
        message: {
          from: {
            id: 2,
            language_code: 'en',
            is_bot: false,
            first_name: 'Test',
          },
        },
      } as any,
      { mode: ModeEnum.TextToImage }
    )
    testCtx.reply = ctx.reply
    testCtx.scene.enter = ctx.scene.enter

    await handleSizeSelection(testCtx as any, '1:1')
    expect(setAspectRatio).toHaveBeenCalledWith(2, '1:1')
    expect(testCtx.reply).toHaveBeenCalledWith('✅ You selected size: 1:1')
    expect(testCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.TextToImage)
  })

  it('calls mainMenu when mode unknown and user exists', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(false)
    const testCtx = makeMockContext(
      {
        message: {
          from: {
            id: 3,
            language_code: 'en',
            is_bot: false,
            first_name: 'Test',
          },
        },
      } as any,
      { mode: ModeEnum.MainMenu }
    )
    testCtx.reply = ctx.reply
    testCtx.scene.enter = ctx.scene.enter
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValue({
      count: 5,
      subscription: 'sub',
      level: 2,
      isExist: true,
    })
    await handleSizeSelection(testCtx as any, '4:3')
    expect(setAspectRatio).toHaveBeenCalledWith(3, '4:3')
    expect(getReferalsCountAndUserData).toHaveBeenCalledWith(3)
    expect(mainMenu).toHaveBeenCalledWith({
      isRu: false,
      inviteCount: 5,
      subscription: 'sub',
      ctx: testCtx,
      level: 2,
    })
  })

  it('enters helpScene when mode unknown and user does not exist', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(true)
    const testCtx = makeMockContext(
      {
        message: {
          from: {
            id: 4,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
        },
      } as any,
      { mode: ModeEnum.MainMenu }
    )
    testCtx.reply = ctx.reply
    testCtx.scene.enter = ctx.scene.enter
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValue({
      count: 0,
      subscription: '',
      level: 0,
      isExist: false,
    })
    await handleSizeSelection(testCtx as any, '2:1')
    expect(setAspectRatio).toHaveBeenCalledWith(4, '2:1')
    expect(testCtx.scene.enter).toHaveBeenCalledWith('helpScene')
  })
})

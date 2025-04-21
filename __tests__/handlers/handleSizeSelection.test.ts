import { handleSizeSelection } from '@/handlers/handleSizeSelection'
import { ModeEnum } from '@/interfaces/modes'

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
    ctx = makeCtx()
  })

  it('sets selectedSize and calls setAspectRatio, replies and enters NeuroPhoto scene', async () => {
    isRussian.mockReturnValue(true)
    ctx.session.mode = ModeEnum.NeuroPhoto
    await handleSizeSelection(ctx, '16:9')
    expect(ctx.session.selectedSize).toBe('16:9')
    expect(setAspectRatio).toHaveBeenCalledWith(ctx.from.id, '16:9')
    expect(ctx.reply).toHaveBeenCalledWith('✅ Вы выбрали размер: 16:9')
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.NeuroPhoto)
  })

  it('enters text_to_image when mode matches string', async () => {
    isRussian.mockReturnValue(false)
    ctx.session.mode = 'text_to_image'
    await handleSizeSelection(ctx, '1:1')
    expect(setAspectRatio).toHaveBeenCalledWith(ctx.from.id, '1:1')
    expect(ctx.reply).toHaveBeenCalledWith('✅ You selected size: 1:1')
    expect(ctx.scene.enter).toHaveBeenCalledWith('text_to_image')
  })

  it('calls mainMenu when mode unknown and user exists', async () => {
    isRussian.mockReturnValue(false)
    ctx.session.mode = 'unknown'
    (getReferalsCountAndUserData as jest.Mock).mockResolvedValue({ count: 3, subscriptionType: 'stars', level: 1, isExist: true })
    await handleSizeSelection(ctx, '4:3')
    expect(mainMenu).toHaveBeenCalledWith({
      isRu: false,
      inviteCount: 3,
      subscription: 'stars',
      ctx,
      level: 1,
    })
  })

  it('enters helpScene when mode unknown and user does not exist', async () => {
    isRussian.mockReturnValue(true)
    ctx.session.mode = 'other'
    (getReferalsCountAndUserData as jest.Mock).mockResolvedValue({ count: 0, subscriptionType: '', level: 0, isExist: false })
    await handleSizeSelection(ctx, '3:2')
    expect(ctx.scene.enter).toHaveBeenCalledWith('helpScene')
  })
})
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/core/supabase', () => ({
  setAspectRatio: jest.fn(),
  getReferalsCountAndUserData: jest.fn(),
}))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu', () => ({ mainMenu: jest.fn() }))

import { handleSizeSelection } from '@/handlers/handleSizeSelection'
import { setAspectRatio, getReferalsCountAndUserData } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { mainMenu } from '@/menu'

describe('handleSizeSelection', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session = {}
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    // Provide from.id
    ctx.from = { id: 'uid', language_code: 'ru' } as any
  })

  it('handles neuro_photo mode in Russian', async () => {
    (isRussian as jest.Mock).mockReturnValue(true)
    ctx.session.mode = 'neuro_photo'
    await handleSizeSelection(ctx as any, '16:9')
    expect(setAspectRatio).toHaveBeenCalledWith('uid', '16:9')
    expect(ctx.session.selectedSize).toBe('16:9')
    expect(ctx.reply).toHaveBeenCalledWith('✅ Вы выбрали размер: 16:9')
    expect(ctx.scene.enter).toHaveBeenCalledWith('neuro_photo')
  })

  it('handles text_to_image mode in English', async () => {
    (isRussian as jest.Mock).mockReturnValue(false)
    ctx.session.mode = 'text_to_image'
    ctx.from.language_code = 'en'
    await handleSizeSelection(ctx as any, '1:1')
    expect(setAspectRatio).toHaveBeenCalledWith('uid', '1:1')
    expect(ctx.reply).toHaveBeenCalledWith('✅ You selected size: 1:1')
    expect(ctx.scene.enter).toHaveBeenCalledWith('text_to_image')
  })

  it('calls mainMenu when mode unknown and user exists', async () => {
    (isRussian as jest.Mock).mockReturnValue(false)
    ctx.session.mode = 'unknown'
    // Mock referals
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValue({
      count: 5,
      subscription: 'sub',
      level: 2,
      isExist: true,
    })
    await handleSizeSelection(ctx as any, '4:3')
    expect(setAspectRatio).toHaveBeenCalledWith('uid', '4:3')
    expect(getReferalsCountAndUserData).toHaveBeenCalledWith('uid')
    expect(mainMenu).toHaveBeenCalledWith({
      isRu: false,
      inviteCount: 5,
      subscription: 'sub',
      ctx,
      level: 2,
    })
  })

  it('enters helpScene when mode unknown and user does not exist', async () => {
    (isRussian as jest.Mock).mockReturnValue(true)
    ctx.session.mode = 'other'
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValue({
      count: 0,
      subscription: '',
      level: 0,
      isExist: false,
    })
    await handleSizeSelection(ctx as any, '2:1')
    expect(ctx.scene.enter).toHaveBeenCalledWith('helpScene')
  })
})
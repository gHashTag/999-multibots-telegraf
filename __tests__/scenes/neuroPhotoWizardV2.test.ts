/**
 * Tests for neuroPhotoWizardV2
 */
import { neuroPhotoWizardV2 } from '../../src/scenes/neuroPhotoWizardV2'
import makeMockContext from '../utils/mockTelegrafContext'
import { Composer } from 'telegraf'
import * as menu from '@/menu'
import * as handlers from '@/handlers'
import * as supabase from '@/core/supabase'

// Mock dependencies
jest.mock('@/handlers/getUserInfo', () => ({
  getUserInfo: jest.fn(() => ({ telegramId: '1' })),
}))
jest.mock('@/core/supabase', () => ({
  getLatestUserModel: jest.fn(),
  getReferalsCountAndUserData: jest.fn(),
}))
jest.mock('@/menu', () => ({
  sendPhotoDescriptionRequest: jest.fn(),
  mainMenu: jest
    .fn()
    .mockResolvedValue({ reply_markup: { keyboard: [['Next']] } }),
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('@/services/generateNeuroImageV2', () => ({
  generateNeuroImageV2: jest.fn(),
}))
jest.mock('@/handlers', () => ({ handleMenu: jest.fn() }))

import {
  getLatestUserModel,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { sendPhotoDescriptionRequest, mainMenu } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { generateNeuroImageV2 } from '@/services/generateNeuroImageV2'
import { handleMenu } from '@/handlers'

describe('neuroPhotoWizardV2', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from.language_code = 'en'
    ctx.session = {}
  })

  it('step 0: no model replies and leaves', async () => {
    const mockLatest = getLatestUserModel as jest.Mock
    mockLatest.mockResolvedValueOnce(null)
    const mockReferals = getReferalsCountAndUserData as jest.Mock
    mockReferals.mockResolvedValueOnce({ count: 0, subscription: '', level: 0 })
    const createKb = jest
      .spyOn(menu, 'createHelpCancelKeyboard')
      .mockReturnValue({} as any)

    const step0 = Composer.unwrap(neuroPhotoWizardV2.steps[0])
    await step0(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("You don't have any trained models"),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: with model sends description request and next()', async () => {
    const usrModel = { finetune_id: 'fid', trigger_word: 'tw' }
    const mockLatest = getLatestUserModel as jest.Mock
    mockLatest.mockResolvedValueOnce(usrModel)
    const mockReferals = getReferalsCountAndUserData as jest.Mock
    mockReferals.mockResolvedValueOnce({ count: 0, subscription: '', level: 0 })
    const mockCancel = handleHelpCancel as jest.Mock
    mockCancel.mockResolvedValueOnce(false)
    const createKb = jest
      .spyOn(menu, 'createHelpCancelKeyboard')
      .mockReturnValue({} as any)

    const step0 = Composer.unwrap(neuroPhotoWizardV2.steps[0])
    await step0(ctx, async () => {})
    expect(ctx.session.userModel).toEqual(usrModel)
    expect(sendPhotoDescriptionRequest).toHaveBeenCalledWith(
      ctx,
      false,
      'neuro_photo'
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: valid prompt generates image and leaves', async () => {
    ctx.message = { text: 'desc' }
    ctx.session.userModel = { trigger_word: 'x' }
    const handleHelpCancel = jest
      .spyOn(handlers, 'handleHelpCancel')
      .mockResolvedValue(false)
    const getModel = jest
      .spyOn(supabase, 'getModel')
      .mockResolvedValue('some_model')

    const step1 = Composer.unwrap(neuroPhotoWizardV2.steps[1])
    await step1(ctx, async () => {})
    expect(handleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(generateNeuroImageV2).toHaveBeenCalledWith(
      `Fashionable x, desc`,
      1,
      ctx.from.id.toString(),
      ctx,
      ctx.botInfo?.username
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })
})

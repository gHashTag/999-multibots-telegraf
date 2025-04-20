/**
 * Tests for neuroPhotoWizardV2
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { neuroPhotoWizardV2 } from '../../src/scenes/neuroPhotoWizardV2'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/handlers/getUserInfo', () => ({ getUserInfo: jest.fn(() => ({ telegramId: '1' })) }))
jest.mock('@/core/supabase', () => ({ getLatestUserModel: jest.fn(), getReferalsCountAndUserData: jest.fn() }))
jest.mock('@/menu', () => ({
  sendPhotoDescriptionRequest: jest.fn(),
  mainMenu: jest.fn().mockResolvedValue({ reply_markup: { keyboard: [['Next']] } }),
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
jest.mock('@/services/generateNeuroImageV2', () => ({ generateNeuroImageV2: jest.fn() }))
jest.mock('@/handlers', () => ({ handleMenu: jest.fn() }))

import { getLatestUserModel, getReferalsCountAndUserData } from '@/core/supabase'
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
    const mockLatest = getLatestUserModel as jest.Mock;
    mockLatest.mockResolvedValueOnce(null);
    const mockReferals = getReferalsCountAndUserData as jest.Mock;
    mockReferals.mockResolvedValueOnce({ count: 0, subscription: '', level: 0 });
    // @ts-ignore
    const step0 = neuroPhotoWizardV2.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("You don't have any trained models"),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: with model sends description request and next()', async () => {
    const usrModel = { finetune_id: 'fid', trigger_word: 'tw' };
    const mockLatest = getLatestUserModel as jest.Mock;
    mockLatest.mockResolvedValueOnce(usrModel);
    const mockReferals = getReferalsCountAndUserData as jest.Mock;
    mockReferals.mockResolvedValueOnce({ count: 0, subscription: '', level: 0 });
    const mockCancel = handleHelpCancel as jest.Mock;
    mockCancel.mockResolvedValueOnce(false);
    // @ts-ignore
    const step0 = neuroPhotoWizardV2.steps[0]
    await step0(ctx)
    expect(ctx.session.userModel).toEqual(usrModel)
    expect(sendPhotoDescriptionRequest).toHaveBeenCalledWith(ctx, false, 'neuro_photo')
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: valid prompt generates image and leaves', async () => {
    ctx.message = { text: 'desc' };
    ctx.session.userModel = { trigger_word: 'x' };
    (handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    // @ts-ignore
    const step1 = neuroPhotoWizardV2.steps[1]
    await step1(ctx)
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
// Мокаем handleHelpCancel
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
// import { selectPaymentOptionStep } from '../../src/scenes/getEmailWizard/index' // Закомментировано
import { getEmailWizard } from '../../src/scenes/getEmailWizard/index'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'
import { paymentOptions } from '../../src/scenes/getRuBillWizard/helper'
import { isRussian } from '../../src/helpers'

describe('selectPaymentOptionStep', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Устанавливаем контекст русского языка
    ctx.from = { id: 1, language_code: 'ru' }
  })

  it('leaves scene if no text message', async () => {
    // ctx.message undefined by default
    await getEmailWizard(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('leaves scene on cancellation', async () => {
    ctx.message = { text: 'anything' } as any
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    await getEmailWizard(ctx)
    expect(handleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('enters getRuBillWizard on valid subscription', async () => {
    const subscription = paymentOptions[0].subscription
    ctx.message = { text: 'whatever' } as any
    ctx.session.subscription = subscription
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    await getEmailWizard(ctx)
    expect(ctx.session.selectedPayment).toEqual(
      paymentOptions.find(opt => opt.subscription === subscription)
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith('getRuBillWizard')
  })

  it('replies with error on invalid subscription', async () => {
    ctx.message = { text: 'text' } as any
    ctx.session.subscription = 'invalid'
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    await getEmailWizard(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Пожалуйста, выберите корректную сумму.'
    )
  })
})

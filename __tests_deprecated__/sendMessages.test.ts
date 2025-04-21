import makeMockContext from '../utils/mockTelegrafContext'
import { sendBalanceMessage } from '../../src/price/helpers/sendBalanceMessage'
import { sendCostMessage } from '../../src/price/helpers/sendCostMessage'
import { sendCurrentBalanceMessage } from '../../src/price/helpers/sendCurrentBalanceMessage'
import { sendInsufficientStarsMessage } from '../../src/price/helpers/sendInsufficientStarsMessage'
import { sendPaymentNotification } from '../../src/price/helpers/sendPaymentNotification'

describe('Price message helpers', () => {
  let ctx = makeMockContext()
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('sendBalanceMessage (ru)', async () => {
    ctx.from.language_code = 'ru'
    await sendBalanceMessage(ctx, 50, 10, true)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      'Стоимость: 10.00 ⭐️\nВаш баланс: 50.00 ⭐️'
    )
  })

  it('sendCostMessage (en)', async () => {
    ctx.from.language_code = 'en'
    await sendCostMessage(ctx, 7.5, false)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      'Cost: 7.50 ⭐️'
    )
  })

  it('sendCurrentBalanceMessage (en)', async () => {
    ctx.from.language_code = 'en'
    await sendCurrentBalanceMessage(ctx, 123, false, 88)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      123,
      'Your current balance: 88.00 ⭐️'
    )
  })

  it('sendInsufficientStarsMessage (en)', async () => {
    ctx.from.language_code = 'en'
    await sendInsufficientStarsMessage(ctx, 3, false)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      'Insufficient stars for image generation. Your balance: 3 stars. Top up your balance by calling the /buy command.'
    )
  })

  it('sendPaymentNotification (ru)', async () => {
    ctx.from.language_code = 'ru'
    const sendSpy = jest
      .spyOn(ctx.telegram, 'sendMessage')
      .mockResolvedValue(undefined)
    await sendPaymentNotification(ctx, 200, 20, '789', 'ru', 'ivan')
    expect(sendSpy).toHaveBeenCalledWith(
      '-4166575919',
      '💸 Пользователь @ivan (Telegram ID: 789) оплатил 200 рублей и получил 20 звезд.'
    )
  })
})

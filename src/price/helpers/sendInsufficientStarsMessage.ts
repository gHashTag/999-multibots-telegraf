import { MyContext } from '@/interfaces'
import { standardButtons } from '@/navigation/helpers/actionButtons'
import { track } from '@/services/trackEvent'

export const sendInsufficientStarsMessage = async (
  ctx: MyContext,
  currentBalance: number,
  isRu: boolean
) => {
  try {
    const chatId = ctx.from?.id?.toString()
    if (!chatId) {
      console.error('Chat ID not found for insufficient stars message')
      return
    }

    /*
     * THE REFUSAL THAT NAMES THE PRICE MUST OFFER THE WAY TO PAY IT.
     *
     * This is the one message in the product where a person has already asked
     * for a paid thing and been told the only obstacle is money -- the moment
     * of highest intent to pay in the whole tree. It went out through
     * `sendMessage(chatId, message)`: two arguments, so no keyboard of any
     * kind, and the copy pointed at "the main menu" IN WORDS. That prose is
     * the tell: the author knew a next step was needed and wrote it as a
     * sentence instead of a button.
     *
     * Fixed in the shared helper rather than at its call sites, because all
     * three of them (checkBalanceScene twice, checkUserBalance once, and
     * checkUserBalance has callers of its own) send exactly this.
     *
     * The copy no longer names a destination, since the destination is now
     * under the message. `standardButtons` puts top-up first for exactly this
     * reason -- see actionButtonsAreLive.test.ts.
     */
    const message = isRu
      ? `Недостаточно звезд. Ваш баланс: ${currentBalance} ⭐. Пополните — и продолжим.`
      : `Not enough stars. Your balance: ${currentBalance} ⭐. Top up and we continue.`

    // The moment of highest intent to pay: worth counting, never worth waiting for.
    void track(ctx as any, 'refused_no_balance', { balance: currentBalance })
    await ctx.telegram.sendMessage(chatId, message, standardButtons(isRu))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Проверяем, является ли это ошибкой "chat not found"
    if (errorMessage.includes('chat not found')) {
      console.warn(
        '⚠️ Chat not found - user may have blocked bot or deleted chat:',
        {
          chatId: ctx.from?.id,
          balance: currentBalance,
          note: 'This is not critical - main functionality continues',
        }
      )
    } else {
      console.error('❌ Error sending insufficient stars message:', {
        error: errorMessage,
        chatId: ctx.from?.id,
        balance: currentBalance,
      })
    }
    // Не выбрасываем ошибку, чтобы не прерывать основной поток
  }
}

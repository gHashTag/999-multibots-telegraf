import { logger } from '@/utils/logger'

/**
 * WHAT IS LEFT, SHOWN WHERE THE VALUE LANDS.
 *
 * The result screens said what the generation COST and never what remained.
 * Measured against production on 2026-09-08, organic arrivals only: 18.2% of
 * them ever generate anything and 3.2% ever reach a price. Running out is the
 * moment this market converts on -- the credit balance is the prompt, not the
 * product page -- and three of the four result paths were silent about it.
 *
 * THE RESULT MUST NEVER BE LOST TO THIS. A person who paid for a generation is
 * owed the generation; a balance read is a nicety on top. Every failure here --
 * a database hiccup, a null, a string where a number was expected -- returns an
 * empty string, so the caller sends the picture with a shorter caption instead
 * of throwing on the way to delivering it. That is the whole reason this is a
 * function rather than three inline awaits.
 */
export async function remainingBalanceLine(
  telegramId: string,
  isRu: boolean
): Promise<string> {
  try {
    /*
     * IMPORTED WHEN CALLED, NOT WHEN LOADED. getUserBalance reaches the
     * '@/core/supabase' barrel, which reaches the scene index, which evaluates
     * emailWizard at module load. Importing it at the top of this file made an
     * unrelated service test fail on a '@/config' mock that never needed
     * getMerchantLogin before. A caption helper should not drag that graph into
     * everything that shows a caption.
     */
    const { getUserBalance } = await import('@/core/supabase/getUserBalance')
    const balance = await getUserBalance(telegramId)
    if (typeof balance !== 'number' || !Number.isFinite(balance)) return ''
    const shown = balance.toFixed(2).replace(/\.00$/, '')
    return isRu ? `\n💰 Осталось: ${shown} ⭐` : `\n💰 Left: ${shown} ⭐`
  } catch (error) {
    logger.warn('remainingBalanceLine: could not read the balance', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

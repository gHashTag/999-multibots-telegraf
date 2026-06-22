import { MyContext } from '@/interfaces'

/**
 * Stub for checkSubscriptionGuard
 * Returns true to allow access (subscription check bypassed)
 * TODO: Implement proper subscription checking
 */
export async function checkSubscriptionGuard(
  ctx: MyContext,
  commandName: string
): Promise<boolean> {
  console.log(`[SubscriptionGuard] ${commandName}: bypassed (stub)`)
  return true
}

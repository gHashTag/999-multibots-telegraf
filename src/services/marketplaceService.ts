/**
 * WARNING: this module does not move money — but its scene IS reachable now.
 *
 * Correction to the previous header: its claim of "zero real importers" is no
 * longer true. purchaseItem is imported by the marketplaceWizard scene, and
 * that scene is registered
 * (ModeEnum.Marketplace, src/navigation/registerCommands.ts, an entry in
 * categories.config.ts). A person CAN enter the scene. Money safety therefore
 * no longer rests on "nobody imports it" — it rests on two pillars, both
 * checkable:
 *   1) the marketplace_items / marketplace_purchases tables do not exist in
 *      the database (PostgREST 42P01), so getItem returns null and
 *      purchaseItem returns item_not_found BEFORE its single deduct runs;
 *   2) the item-existence check sits BEFORE updateUserBalance — pinned by
 *      src/__tests__/money/marketplace-deduct-guarded.test.ts: if the deduct
 *      ever moves above the check, that test goes red.
 *
 * Latent debt, surfaces the day the owner creates the tables: the author
 * credit (95%) ignores the updateUserBalance return (tracked as 1 in
 * unchecked-money-result.test.ts), and there is no duplicate-purchase guard.
 * Both are about money — fix them together with enabling the feature, not
 * blindly now.
 *
 * Measured: docs/audit/table-seams.md, docs/audit/unregistered-functions.md.
 * Tools: scripts/probe-table-seams.cjs, scripts/probe-reachability.cjs.
 *
 * Not deleting: this may be unfinished work rather than dead code — the call
 * on its fate is the owner's. The note exists so the next reader does not take
 * the code for working and lose time, the way an earlier reader did.
 */
/**
 * Marketplace Service
 *
 * Browse, buy, and sell prompt packs, styles, and LoRA models.
 * Tables may not exist yet in Supabase -- all queries gracefully return
 * empty arrays / null on error.
 */

import { supabase } from '@/core/supabase'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'

// In-flight guard against a double purchase: a buyer double-tapping "Buy" (or
// racing callbacks) would run purchaseItem twice and be charged twice for one
// item (author paid twice). Keyed by `${buyerId}:${itemId}`, claimed before the
// charge and released on every exit -- so a failed charge does not block a retry.
// Self-bounding (entries are deleted on completion). In-process (resets on
// restart); the durable key is the marketplace_purchases row.
const purchasesInFlight = new Set<string>()

export type MarketplaceItemType =
  | 'prompt_pack'
  | 'style'
  | 'lora_model'
  | 'skill_pack'

export interface MarketplaceItem {
  id: string
  author_id: string
  title: string
  description: string
  type: MarketplaceItemType
  content: string
  price_stars: number
  created_at?: string
}

export interface MarketplacePurchase {
  id: string
  buyer_id: string
  item_id: string
  price_stars: number
  created_at?: string
}

/** Fetch items from marketplace_items, optionally filtered by type. */
export async function listMarketplaceItems(
  type?: string,
  limit = 20
): Promise<MarketplaceItem[]> {
  try {
    let query = supabase
      .from('marketplace_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as MarketplaceItem[]) ?? []
  } catch (err) {
    logger.warn('marketplace listItems failed (table may not exist)', {
      error: String(err),
    })
    return []
  }
}

/** Fetch a single item with author info. */
export async function getItem(id: string): Promise<MarketplaceItem | null> {
  try {
    const { data, error } = await supabase
      .from('marketplace_items')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as MarketplaceItem
  } catch (err) {
    logger.warn('marketplace getItem failed', { id, error: String(err) })
    return null
  }
}

/** Purchase an item: deduct stars from buyer, credit 95% to author. */
export async function purchaseItem(
  buyerId: string,
  itemId: string,
  botName: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const item = await getItem(itemId)
  if (!item) return { success: false, error: 'item_not_found' }

  if (item.author_id === buyerId) {
    return { success: false, error: 'cannot_buy_own' }
  }

  const purchaseKey = `${buyerId}:${itemId}`
  if (purchasesInFlight.has(purchaseKey)) {
    // A concurrent purchase of the same item is already charging; deliver the
    // content without charging again.
    return { success: true, content: item.content }
  }
  purchasesInFlight.add(purchaseKey)

  // try/finally, because the key means "a purchase is in flight RIGHT NOW"
  // and only a finally keeps that true. Without it a throw between the charge
  // and the delete leaves the key set forever, and every later purchase of
  // this item by this buyer takes the early return above -- content delivered,
  // nobody charged, the author never paid. Two awaits live in that window.
  try {
    // Deduct from buyer
    const deducted = await updateUserBalance(
      buyerId,
      item.price_stars,
      PaymentType.MONEY_OUTCOME,
      `Marketplace: ${item.title}`,
      {
        bot_name: botName,
        service_type: 'marketplace',
        modePrice: item.price_stars,
      }
    )
    if (!deducted) {
      return { success: false, error: 'insufficient_balance' }
    }

    // Credit 95% to author. updateUserBalance returns false on a failed credit
    // (it does not throw); the buyer has already been charged and will receive the
    // content, so complete the sale but log a CRITICAL alert -- a failed author
    // payout must be reconciled manually, not vanish silently.
    const authorCredit = Math.floor(item.price_stars * 0.95)
    const authorCredited = await updateUserBalance(
      item.author_id,
      authorCredit,
      PaymentType.MONEY_INCOME,
      `Marketplace sale: ${item.title}`,
      { bot_name: botName, stars: authorCredit }
    )
    if (!authorCredited) {
      logger.error(
        '💸❌ Marketplace author NOT credited -- reconcile manually',
        {
          alert: 'AUTHOR PAYOUT FAILED',
          author_id: item.author_id,
          buyer_id: buyerId,
          item_id: itemId,
          author_credit: authorCredit,
          price_stars: item.price_stars,
        }
      )
    }

    // Record purchase
    try {
      await supabase.from('marketplace_purchases').insert({
        buyer_id: buyerId,
        item_id: itemId,
        price_stars: item.price_stars,
      })
    } catch {
      /* table may not exist */
    }

    return { success: true, content: item.content }
  } finally {
    purchasesInFlight.delete(purchaseKey)
  }
}

/** Create a new listing. */
export async function createItem(
  authorId: string,
  title: string,
  description: string,
  type: string,
  content: string,
  priceStars: number
): Promise<MarketplaceItem | null> {
  try {
    const { data, error } = await supabase
      .from('marketplace_items')
      .insert({
        author_id: authorId,
        title,
        description,
        type,
        content,
        price_stars: priceStars,
      })
      .select()
      .single()
    if (error) throw error
    return data as MarketplaceItem
  } catch (err) {
    logger.warn('marketplace createItem failed', { error: String(err) })
    return null
  }
}

/** Items the author is selling. */
export async function getMyItems(authorId: string): Promise<MarketplaceItem[]> {
  try {
    const { data, error } = await supabase
      .from('marketplace_items')
      .select('*')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as MarketplaceItem[]) ?? []
  } catch {
    return []
  }
}

/** Sales history for an author. */
export async function getMySales(
  authorId: string
): Promise<MarketplacePurchase[]> {
  try {
    const { data, error } = await supabase
      .from('marketplace_purchases')
      .select('*, marketplace_items!inner(author_id)')
      .eq('marketplace_items.author_id', authorId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as MarketplacePurchase[]) ?? []
  } catch {
    return []
  }
}

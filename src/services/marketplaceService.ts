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

export type MarketplaceItemType = 'prompt_pack' | 'style' | 'lora_model' | 'skill_pack'

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
  limit = 20,
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
    logger.warn('marketplace listItems failed (table may not exist)', { error: String(err) })
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
  botName: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  const item = await getItem(itemId)
  if (!item) return { success: false, error: 'item_not_found' }

  if (item.author_id === buyerId) {
    return { success: false, error: 'cannot_buy_own' }
  }

  // Deduct from buyer
  const deducted = await updateUserBalance(
    buyerId,
    item.price_stars,
    PaymentType.MONEY_OUTCOME,
    `Marketplace: ${item.title}`,
    { bot_name: botName, service_type: 'marketplace', modePrice: item.price_stars },
  )
  if (!deducted) return { success: false, error: 'insufficient_balance' }

  // Credit 95% to author
  const authorCredit = Math.floor(item.price_stars * 0.95)
  await updateUserBalance(
    item.author_id,
    authorCredit,
    PaymentType.MONEY_INCOME,
    `Marketplace sale: ${item.title}`,
    { bot_name: botName, stars: authorCredit },
  )

  // Record purchase
  try {
    await supabase.from('marketplace_purchases').insert({
      buyer_id: buyerId,
      item_id: itemId,
      price_stars: item.price_stars,
    })
  } catch { /* table may not exist */ }

  return { success: true, content: item.content }
}

/** Create a new listing. */
export async function createItem(
  authorId: string,
  title: string,
  description: string,
  type: string,
  content: string,
  priceStars: number,
): Promise<MarketplaceItem | null> {
  try {
    const { data, error } = await supabase
      .from('marketplace_items')
      .insert({ author_id: authorId, title, description, type, content, price_stars: priceStars })
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
export async function getMySales(authorId: string): Promise<MarketplacePurchase[]> {
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

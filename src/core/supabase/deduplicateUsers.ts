import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * 🧹 BEST PRACTICE: Database cleanup utility
 * Removes duplicate users keeping the most recent one
 */
export async function deduplicateUsers(telegramId: string): Promise<boolean> {
  try {
    logger.info(`[deduplicateUsers] Starting deduplication for telegramId ${telegramId}`)

    // Get all users for this telegram_id
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false }) // Most recent first

    if (error) {
      logger.error(`[deduplicateUsers] Error fetching users:`, error)
      return false
    }

    if (!users || users.length <= 1) {
      logger.info(`[deduplicateUsers] No duplicates found for telegramId ${telegramId}`)
      return true
    }

    logger.warn(`[deduplicateUsers] Found ${users.length} duplicate users for telegramId ${telegramId}`)

    // Keep the most recent user (index 0), delete the rest
    const userToKeep = users[0]
    const usersToDelete = users.slice(1)

    logger.info(`[deduplicateUsers] Keeping user ${userToKeep.id}, deleting ${usersToDelete.length} duplicates`)

    // Delete duplicate users
    const deletePromises = usersToDelete.map(user => 
      supabase
        .from('users')
        .delete()
        .eq('id', user.id)
    )

    const deleteResults = await Promise.allSettled(deletePromises)
    
    let successCount = 0
    let errorCount = 0

    deleteResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++
        logger.info(`[deduplicateUsers] Successfully deleted user ${usersToDelete[index].id}`)
      } else {
        errorCount++
        logger.error(`[deduplicateUsers] Failed to delete user ${usersToDelete[index].id}:`, result.reason)
      }
    })

    logger.info(`[deduplicateUsers] Deduplication complete: ${successCount} deleted, ${errorCount} errors`)

    return errorCount === 0
  } catch (error) {
    logger.error(`[deduplicateUsers] Unexpected error:`, error)
    return false
  }
}

/**
 * 🔍 BEST PRACTICE: Find all users with duplicates
 */
export async function findAllDuplicateUsers(): Promise<string[]> {
  try {
    const { data: duplicates, error } = await supabase
      .from('users')
      .select('telegram_id')
      .not('telegram_id', 'is', null)

    if (error) {
      logger.error(`[findAllDuplicateUsers] Error:`, error)
      return []
    }

    if (!duplicates) return []

    // Count occurrences of each telegram_id
    const counts: Record<string, number> = {}
    duplicates.forEach(user => {
      counts[user.telegram_id] = (counts[user.telegram_id] || 0) + 1
    })

    // Return only telegram_ids with duplicates
    const duplicateIds = Object.keys(counts).filter(id => counts[id] > 1)
    
    logger.info(`[findAllDuplicateUsers] Found ${duplicateIds.length} telegram_ids with duplicates`)
    
    return duplicateIds
  } catch (error) {
    logger.error(`[findAllDuplicateUsers] Unexpected error:`, error)
    return []
  }
}
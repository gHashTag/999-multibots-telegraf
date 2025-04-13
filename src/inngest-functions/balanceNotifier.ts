import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { BalanceNotifierService } from '@/services/balanceNotifierService'

// Get bot names from environment or use defaults
const getBotNames = (): string[] => {
  // If BALANCE_NOTIFICATION_BOTS is defined in environment, use it
  const envBots = process.env.BALANCE_NOTIFICATION_BOTS
  if (envBots) {
    return envBots.split(',').map(bot => bot.trim()).filter(bot => bot.length > 0)
  }
  
  // Default bot names if not specified in env
  return ['main', 'MetaMuse_Manifest_bot', 'neuro_blogger_bot']
}

// Max attempts to retry a bot's balance check if it fails
const MAX_RETRY_ATTEMPTS = 3

/**
 * Scheduled function to check all users' balances and send notifications
 * This runs once a day to notify users with low balances
 */
export const balanceNotifierScheduledTask = inngest.createFunction(
  {
    id: 'balance-notification-daily-check',
    name: 'Daily Balance Notification Check',
  },
  // Schedule to run once a day at 12:00 UTC
  { cron: '0 12 * * *' },
  async ({ step }) => {
    const startTime = new Date()
    logger.info({
      message: '🔔 Starting scheduled balance notification check',
      description: 'Running daily balance notification check for all users',
      timestamp: startTime.toISOString(),
    })

    try {
      // Get bot names to check
      const botNames = getBotNames()
      logger.info({
        message: `🤖 Processing ${botNames.length} bots for balance notifications`,
        description: 'Bots to process for balance notifications',
        bots: botNames,
      })
      
      if (botNames.length === 0) {
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: 'No bots configured for balance notifications',
        }
      }

      const results = []
      const errors = []

      for (const botName of botNames) {
        // Run a separate step for each bot to improve reliability
        try {
          const botResult = await step.run(`check-balances-${botName}`, async () => {
            logger.info({
              message: `🔍 Checking balances for ${botName} bot`,
              description: `Running balance checks for ${botName}`,
              bot_name: botName,
            })

            let attempts = 0
            let lastError = null
            
            // Retry logic for individual bot
            while (attempts < MAX_RETRY_ATTEMPTS) {
              try {
                attempts++
                
                // Use the existing service to check all user balances and send notifications
                const result = await BalanceNotifierService.checkAllUsersBalances(botName)
                
                logger.info({
                  message: `✅ Balance check complete for ${botName}`,
                  description: `Balance check results for ${botName}`,
                  bot_name: botName,
                  checked: result.checked,
                  notified: result.notified,
                  attempt: attempts,
                })
                
                return {
                  ...result,
                  success: true,
                }
              } catch (error) {
                lastError = error
                
                // Only log a warning and retry if we haven't exceeded max attempts
                if (attempts < MAX_RETRY_ATTEMPTS) {
                  logger.warn({
                    message: `⚠️ Attempt ${attempts} failed for ${botName}`,
                    description: `Retrying balance check for ${botName}`,
                    bot_name: botName,
                    error: error instanceof Error ? error.message : String(error),
                    attempt: attempts,
                  })
                  
                  // Wait a short time before retrying
                  await new Promise(resolve => setTimeout(resolve, 500 * attempts))
                } else {
                  throw error
                }
              }
            }
            
            // If we got here, all attempts failed
            throw lastError
          })

          results.push({
            bot_name: botName,
            ...botResult,
            status: 'success',
          })
        } catch (botError) {
          // Log the error but continue with other bots
          logger.error({
            message: `❌ Failed to check balances for ${botName}`,
            description: `Balance check failed for ${botName} after ${MAX_RETRY_ATTEMPTS} attempts`,
            bot_name: botName,
            error: botError instanceof Error ? botError.message : String(botError),
            stack: botError instanceof Error ? botError.stack : undefined,
          })
          
          errors.push({
            bot_name: botName,
            error: botError instanceof Error ? botError.message : String(botError),
            timestamp: new Date().toISOString(),
          })
          
          // Add to results with failure status
          results.push({
            bot_name: botName,
            checked: 0,
            notified: 0,
            status: 'error',
            error: botError instanceof Error ? botError.message : String(botError),
          })
        }
      }

      // Summarize results
      const totalChecked = results.reduce((sum, result) => sum + (result.checked || 0), 0)
      const totalNotified = results.reduce((sum, result) => sum + (result.notified || 0), 0)
      const successfulBots = results.filter(r => r.status === 'success').length
      const failedBots = results.filter(r => r.status === 'error').length
      const endTime = new Date()
      const duration = (endTime.getTime() - startTime.getTime()) / 1000 // in seconds

      logger.info({
        message: '📊 Balance notification check complete',
        description: 'Scheduled balance notification check completed',
        total_checked: totalChecked,
        total_notified: totalNotified,
        successful_bots: successfulBots,
        failed_bots: failedBots,
        duration_seconds: duration,
        timestamp: endTime.toISOString(),
        per_bot_results: results,
      })

      return {
        success: errors.length === 0,
        timestamp: new Date().toISOString(),
        totalCheckedUsers: totalChecked,
        totalNotifiedUsers: totalNotified,
        successfulBots,
        failedBots,
        duration_seconds: duration,
        errors: errors.length > 0 ? errors : undefined,
        results,
      }
    } catch (error) {
      const endTime = new Date()
      const duration = (endTime.getTime() - startTime.getTime()) / 1000 // in seconds
      
      logger.error({
        message: '❌ Critical error in balance notification check',
        description: 'Scheduled balance notification check failed with critical error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration_seconds: duration,
      })

      return {
        success: false,
        timestamp: endTime.toISOString(),
        duration_seconds: duration,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
) 
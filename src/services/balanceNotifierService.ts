import { logger } from '@/utils/logger';
import { supabase } from '@/core/supabase';
import { getUserSettings } from '@/core/supabase/getUserSettings';
import { getBotByName } from '@/core/bot';
import { normalizeTelegramId, TelegramId } from '@/interfaces/telegram.interface';

/**
 * Service for checking user balances and sending notifications
 * when balance falls below user-defined threshold
 */
export class BalanceNotifierService {
  /**
   * Check if user should be notified of low balance
   * @param telegramId User's Telegram ID
   * @param balance Current user balance
   * @param notificationSettings User's notification settings
   * @returns boolean - true if notification should be sent
   */
  static shouldNotifyUser(
    telegramId: string,
    balance: number,
    notificationSettings: { enabled: boolean; threshold: number }
  ): boolean {
    // Don't notify if notifications are disabled
    if (!notificationSettings.enabled) {
      return false;
    }

    // Don't notify if balance is above threshold
    if (balance >= notificationSettings.threshold) {
      return false;
    }

    logger.info({
      message: '📊 Detected low balance for notification',
      description: 'User balance below threshold',
      telegram_id: telegramId,
      balance,
      threshold: notificationSettings.threshold,
    });

    return true;
  }

  /**
   * Get user's notification settings from database
   * @param telegramId User's Telegram ID
   * @returns Notification settings or default settings
   */
  static async getUserNotificationSettings(telegramId: string): Promise<{ enabled: boolean; threshold: number }> {
    try {
      // Get user settings from database
      const userSettings = await getUserSettings(telegramId as TelegramId);
      
      // If user has notification settings, return them
      if (userSettings?.balanceNotifications) {
        return {
          enabled: userSettings.balanceNotifications.enabled || false,
          threshold: userSettings.balanceNotifications.threshold || 10
        };
      }
      
      // Return default settings if not configured
      return {
        enabled: false,
        threshold: 10
      };
    } catch (error) {
      logger.error({
        message: '❌ Error getting notification settings',
        description: error instanceof Error ? error.message : String(error),
        telegram_id: telegramId
      });
      
      // Return default settings in case of error
      return {
        enabled: false,
        threshold: 10
      };
    }
  }
  
  /**
   * Send notification about low balance to user
   * @param telegramId User's Telegram ID
   * @param balance Current balance
   * @param threshold Notification threshold
   * @param isRu Whether user prefers Russian language
   * @param botName Bot name to use for sending message
   */
  static async sendLowBalanceNotification(
    telegramId: string,
    balance: number,
    threshold: number,
    isRu: boolean,
    botName: string
  ): Promise<boolean> {
    try {
      const bot = getBotByName(botName);
      if (!bot?.bot) {
        logger.error({
          message: '❌ Bot not found',
          description: `Bot ${botName} not found for notification`,
          telegram_id: telegramId,
          botName
        });
        return false;
      }
      
      const message = isRu
        ? `⚠️ <b>Предупреждение о низком балансе</b>\n\n` +
          `Ваш текущий баланс: <b>${balance.toFixed(2)}</b> ⭐️\n` +
          `Порог уведомления: <b>${threshold}</b> ⭐️\n\n` +
          `Рекомендуем пополнить баланс для бесперебойной работы. Используйте /topup для пополнения.`
        : `⚠️ <b>Low Balance Alert</b>\n\n` +
          `Your current balance: <b>${balance.toFixed(2)}</b> ⭐️\n` +
          `Notification threshold: <b>${threshold}</b> ⭐️\n\n` +
          `We recommend adding funds to ensure uninterrupted service. Use /topup to add more stars.`;
      
      await bot.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML'
      });
      
      logger.info({
        message: '✅ Low balance notification sent',
        description: 'User notified about low balance',
        telegram_id: telegramId,
        balance,
        threshold
      });
      
      return true;
    } catch (error) {
      logger.error({
        message: '❌ Error sending notification',
        description: error instanceof Error ? error.message : String(error),
        telegram_id: telegramId
      });
      return false;
    }
  }
  
  /**
   * Check all users' balances and send notifications if needed
   * @param botName Bot name to use for sending notifications
   */
  static async checkAllUsersBalances(botName: string = 'main'): Promise<{ checked: number; notified: number }> {
    logger.info({
      message: '🔄 Starting balance notification check',
      description: 'Checking all users balances for notification',
      botName
    });
    
    try {
      // Get all users directly from database
      const { data: users, error } = await supabase.from('users').select('*');
      
      if (error) {
        throw new Error(`Error fetching users: ${error.message}`);
      }
      
      let checkedUsers = 0;
      let notifiedUsers = 0;
      
      for (const user of users || []) {
        try {
          checkedUsers++;
          const telegramId = normalizeTelegramId(user.telegram_id);
          
          // Skip users without telegram_id
          if (!telegramId) continue;
          
          // Get notification settings
          const notificationSettings = await this.getUserNotificationSettings(telegramId);
          
          // Skip if notifications disabled
          if (!notificationSettings.enabled) continue;
          
          // Check if user should be notified
          if (this.shouldNotifyUser(telegramId, user.balance || 0, notificationSettings)) {
            // Send notification
            const notificationSent = await this.sendLowBalanceNotification(
              telegramId,
              user.balance || 0,
              notificationSettings.threshold,
              user.is_ru || false,
              botName
            );
            
            if (notificationSent) {
              notifiedUsers++;
            }
          }
        } catch (userError) {
          // Continue with other users if one fails
          logger.error({
            message: '❌ Error processing user',
            description: userError instanceof Error ? userError.message : String(userError),
            user_id: user.id
          });
          continue;
        }
      }
      
      logger.info({
        message: '✅ Balance notification check completed',
        description: 'Finished checking user balances',
        checked: checkedUsers,
        notified: notifiedUsers
      });
      
      return { checked: checkedUsers, notified: notifiedUsers };
    } catch (error) {
      logger.error({
        message: '❌ Error checking balances',
        description: error instanceof Error ? error.message : String(error)
      });
      return { checked: 0, notified: 0 };
    }
  }

  /**
   * Check specific user's balance and send notification if needed
   * @param userId User ID to check
   * @param botName Bot name to use for sending notification
   * @returns Result of the check with notification status
   */
  static async checkUserBalanceById(userId: string, botName: string = 'main'): Promise<{ 
    checked: boolean; 
    notified: boolean; 
    balance?: number;
    threshold?: number;
    error?: string;
  }> {
    logger.info({
      message: '🔍 Checking balance for specific user',
      description: 'Manual balance check for user',
      user_id: userId,
      bot_name: botName
    });
    
    try {
      // Get user from database
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        throw new Error(`Error fetching user: ${error.message}`);
      }
      
      if (!user) {
        throw new Error(`User not found with ID: ${userId}`);
      }
      
      const telegramId = normalizeTelegramId(user.telegram_id);
      
      // Skip users without telegram_id
      if (!telegramId) {
        throw new Error(`User ${userId} has no valid Telegram ID`);
      }
      
      // Get notification settings
      const notificationSettings = await this.getUserNotificationSettings(telegramId);
      
      // Check if user should be notified
      const shouldNotify = this.shouldNotifyUser(telegramId, user.balance || 0, notificationSettings);
      
      let notified = false;
      
      if (shouldNotify) {
        // Send notification
        notified = await this.sendLowBalanceNotification(
          telegramId,
          user.balance || 0,
          notificationSettings.threshold,
          user.is_ru || false,
          botName
        );
      }
      
      logger.info({
        message: '✅ Manual balance check completed',
        description: 'Individual user balance check result',
        user_id: userId,
        balance: user.balance || 0,
        threshold: notificationSettings.threshold,
        notifications_enabled: notificationSettings.enabled,
        notified
      });
      
      return { 
        checked: true, 
        notified, 
        balance: user.balance || 0,
        threshold: notificationSettings.threshold
      };
    } catch (error) {
      logger.error({
        message: '❌ Error checking user balance',
        description: error instanceof Error ? error.message : String(error),
        user_id: userId
      });
      
      return { 
        checked: false, 
        notified: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
} 
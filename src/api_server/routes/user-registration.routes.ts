import { Router } from 'express'
import { createUser } from '@/core/supabase/createUser'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { logger } from '@/utils/logger'

const router: any = Router()

// Интерфейс для данных регистрации
interface RegistrationData {
  telegram_id: string
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
  inviter?: string
}

// POST /api/register - Регистрация нового пользователя
const handleUserRegistration = async (req: any, res: any): Promise<void> => {
  try {
    const {
      telegram_id,
      username,
      first_name,
      last_name,
      language_code,
      inviter
    }: RegistrationData = req.body

    // Валидация обязательных полей
    if (!telegram_id) {
      res.status(400).json({
        success: false,
        error: 'telegram_id is required',
        message: 'Telegram ID is required for registration'
      })
      return
    }

    // Конвертируем telegram_id в строку
    const telegramIdStr = telegram_id.toString()

    logger.info({
      message: 'API: Попытка регистрации пользователя',
      telegramId: telegram_id,
      username,
      function: 'handleUserRegistration'
    })

    // Создаем пользователя
    const [wasCreated, user] = await createUser({
      telegram_id: telegramIdStr,
      username: username || telegramIdStr,
      first_name: first_name || '',
      last_name: last_name || '',
      is_bot: false,
      language_code: language_code || 'ru',
      photo_url: '',
      chat_id: parseInt(telegramIdStr),
      mode: 'neuro_photo_v2',
      model: 'dall-e-3',
      count: 1,
      aspect_ratio: '1:1',
      inviter: inviter || null,
      bot_name: 'neuro_blogger_bot'
    })

    if (!user) {
      res.status(500).json({
        success: false,
        error: 'Failed to create user',
        message: 'Internal server error during user creation'
      })
      return
    }

    // Получаем детали пользователя
    const userDetails = await getUserDetailsSubscription(telegramIdStr)

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          created_at: user.created_at,
          updated_at: user.updated_at
        },
        userDetails: {
          isExist: userDetails.isExist,
          stars: userDetails.stars,
          subscriptionType: userDetails.subscriptionType,
          isSubscriptionActive: userDetails.isSubscriptionActive,
          subscriptionStartDate: userDetails.subscriptionStartDate
        },
        wasCreated,
        message: wasCreated ? 'User created successfully' : 'User already exists'
      }
    })

    logger.info({
      message: 'API: Регистрация пользователя завершена успешно',
      telegramId: telegram_id,
      userId: user.id,
      wasCreated,
      function: 'handleUserRegistration_success'
    })

  } catch (error: any) {
    logger.error({
      message: 'API: Ошибка при регистрации пользователя',
      error: error.message,
      stack: error.stack,
      function: 'handleUserRegistration_error'
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
}

// GET /api/user/:telegram_id - Получение информации о пользователе
const handleGetUser = async (req: any, res: any): Promise<void> => {
  try {
    const telegram_id = req.params.telegram_id

    if (!telegram_id) {
      res.status(400).json({
        success: false,
        error: 'Invalid telegram_id',
        message: 'Telegram ID is required'
      })
      return
    }

    logger.info({
      message: 'API: Запрос информации о пользователе',
      telegramId: telegram_id,
      function: 'handleGetUser'
    })

    // Получаем детали пользователя
    const userDetails = await getUserDetailsSubscription(telegram_id)

    res.status(200).json({
      success: true,
      data: {
        telegram_id,
        isExist: userDetails.isExist,
        stars: userDetails.stars,
        subscriptionType: userDetails.subscriptionType,
        isSubscriptionActive: userDetails.isSubscriptionActive,
        subscriptionStartDate: userDetails.subscriptionStartDate
      }
    })

  } catch (error: any) {
    logger.error({
      message: 'API: Ошибка при получении информации о пользователе',
      error: error.message,
      stack: error.stack,
      function: 'handleGetUser_error'
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
}

// POST /api/check-user - Проверка существования пользователя
const handleCheckUser = async (req: any, res: any): Promise<void> => {
  try {
    const { telegram_id }: { telegram_id: string } = req.body

    if (!telegram_id) {
      res.status(400).json({
        success: false,
        error: 'telegram_id is required',
        message: 'Telegram ID is required'
      })
      return
    }

    logger.info({
      message: 'API: Проверка существования пользователя',
      telegramId: telegram_id,
      function: 'handleCheckUser'
    })

    // Получаем детали пользователя
    const userDetails = await getUserDetailsSubscription(telegram_id)

    res.status(200).json({
      success: true,
      data: {
        telegram_id,
        exists: userDetails.isExist,
        stars: userDetails.stars,
        subscriptionType: userDetails.subscriptionType,
        isSubscriptionActive: userDetails.isSubscriptionActive,
        subscriptionStartDate: userDetails.subscriptionStartDate
      }
    })

  } catch (error: any) {
    logger.error({
      message: 'API: Ошибка при проверке пользователя',
      error: error.message,
      stack: error.stack,
      function: 'handleCheckUser_error'
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
}

// Регистрация маршрутов
router.post('/register', handleUserRegistration)
router.get('/user/:telegram_id', handleGetUser)
router.post('/check-user', handleCheckUser)

export default router

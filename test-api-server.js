const express = require('express')
const { createUser } = require('./dist/core/supabase/createUser')
const { getUserDetailsSubscription } = require('./dist/core/supabase/getUserDetailsSubscription')

const app = express()
const PORT = 3999

// Middleware для парсинга JSON
app.use(express.json())

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[API] ${new Date().toISOString()} | ${req.method} ${req.url}`)
  next()
})

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    message: 'User Registration API is running'
  })
})

// POST /api/register - Регистрация нового пользователя
app.post('/api/register', async (req, res) => {
  try {
    const {
      telegram_id,
      username,
      first_name,
      last_name,
      language_code,
      inviter
    } = req.body

    // Валидация обязательных полей
    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'telegram_id is required',
        message: 'Telegram ID is required for registration'
      })
    }

    console.log(`[API] Попытка регистрации пользователя: ${telegram_id}`)

    // Конвертируем telegram_id в строку
    const telegramIdStr = telegram_id.toString()

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
      return res.status(500).json({
        success: false,
        error: 'Failed to create user',
        message: 'Internal server error during user creation'
      })
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

    console.log(`[API] Регистрация пользователя завершена успешно: ${telegram_id}, wasCreated: ${wasCreated}`)

  } catch (error) {
    console.error('[API] Ошибка при регистрации пользователя:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

// GET /api/user/:telegram_id - Получение информации о пользователе
app.get('/api/user/:telegram_id', async (req, res) => {
  try {
    const telegram_id = req.params.telegram_id

    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid telegram_id',
        message: 'Telegram ID is required'
      })
    }

    console.log(`[API] Запрос информации о пользователе: ${telegram_id}`)

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

  } catch (error) {
    console.error('[API] Ошибка при получении информации о пользователе:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

// POST /api/check-user - Проверка существования пользователя
app.post('/api/check-user', async (req, res) => {
  try {
    const { telegram_id } = req.body

    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'telegram_id is required',
        message: 'Telegram ID is required'
      })
    }

    console.log(`[API] Проверка существования пользователя: ${telegram_id}`)

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

  } catch (error) {
    console.error('[API] Ошибка при проверке пользователя:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 User Registration API Server запущен на порту ${PORT}`)
  console.log(`📡 Доступен по адресу: http://localhost:${PORT}`)
  console.log(`🌐 Публичный доступ: http://185.161.67.53:${PORT}`)
  console.log(`📋 Endpoints:`)
  console.log(`   GET  /api/health - Проверка состояния`)
  console.log(`   POST /api/register - Регистрация пользователя`)
  console.log(`   GET  /api/user/:telegram_id - Информация о пользователе`)
  console.log(`   POST /api/check-user - Проверка существования пользователя`)
})

const { createClient } = require('@supabase/supabase-js')

// Получаем переменные окружения из .env файла
require('dotenv').config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют переменные SUPABASE_URL или SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkUserAspectRatio(telegramId) {
  try {
    console.log(`🔍 Проверяем aspect_ratio для пользователя ${telegramId}...`)

    const { data, error } = await supabase
      .from('users')
      .select('telegram_id, aspect_ratio, created_at')
      .eq('telegram_id', telegramId)
      .single()

    if (error) {
      console.error('❌ Ошибка запроса:', error.message)
      return
    }

    if (!data) {
      console.log('❌ Пользователь не найден')
      return
    }

    console.log('✅ Данные пользователя:')
    console.log(`   Telegram ID: ${data.telegram_id}`)
    console.log(`   Aspect Ratio: ${data.aspect_ratio || 'НЕ УСТАНОВЛЕН'}`)
    console.log(`   Создан: ${data.created_at}`)

    // Показываем какой дефолт будет использоваться
    const effectiveAspectRatio = data.aspect_ratio ?? '9:16'
    console.log(`   Эффективный aspect_ratio: ${effectiveAspectRatio}`)

    if (!data.aspect_ratio) {
      console.log(
        'ℹ️  Aspect ratio не установлен, будет использован дефолт 9:16'
      )
    }
  } catch (error) {
    console.error('❌ Неожиданная ошибка:', error.message)
  }
}

// Запускаем проверку для вашего пользователя
checkUserAspectRatio('144022504')
  .then(() => {
    console.log('✅ Проверка завершена')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Ошибка:', error)
    process.exit(1)
  })

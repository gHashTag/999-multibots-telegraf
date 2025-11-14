import { supabaseAdmin } from '@/core/supabase/client'
import { readFileSync } from 'fs'
import { join } from 'path'

async function applyWelcomeTranslations() {
  console.log('🚀 Применение миграции welcome переводов...')

  const translations = [
    // Русский для neuro_blogger_bot
    {
      key: 'welcome',
      language_code: 'ru',
      bot_name: 'neuro_blogger_bot',
      translation: `👋 Привет, {name}!

🤖 Добро пожаловать в {botName}!

✨ Я помогу тебе создавать удивительный контент с помощью ИИ:
📸 Создание уникальных изображений
🎬 Генерация видео с помощью Sora
🎨 Обработка и улучшение фотографий

🎯 Выберите нужную функцию из меню ниже:`,
      url: '',
      buttons: null
    },
    // Английский для neuro_blogger_bot
    {
      key: 'welcome',
      language_code: 'en',
      bot_name: 'neuro_blogger_bot',
      translation: `👋 Hello, {name}!

🤖 Welcome to {botName}!

✨ I will help you create amazing content with AI:
📸 Create unique images
🎬 Generate videos with Sora
🎨 Process and enhance photos

🎯 Select the function you need from the menu below:`,
      url: '',
      buttons: null
    },
    // Русский для common (fallback)
    {
      key: 'welcome',
      language_code: 'ru',
      bot_name: 'common',
      translation: `👋 Привет, {name}!

🤖 Добро пожаловать в {botName}!

🎯 Выберите нужную функцию из меню ниже:`,
      url: '',
      buttons: null
    },
    // Английский для common (fallback)
    {
      key: 'welcome',
      language_code: 'en',
      bot_name: 'common',
      translation: `👋 Hello, {name}!

🤖 Welcome to {botName}!

🎯 Select the function you need from the menu below:`,
      url: '',
      buttons: null
    }
  ]

  for (const translation of translations) {
    console.log(`\n📝 Добавление перевода: ${translation.bot_name} (${translation.language_code})`)

    const { data, error } = await supabaseAdmin
      .from('translations')
      .upsert(translation, {
        onConflict: 'key,language_code,bot_name'
      })

    if (error) {
      console.error(`❌ Ошибка для ${translation.bot_name} (${translation.language_code}):`, error.message)
    } else {
      console.log(`✅ Успешно добавлено`)
    }
  }

  console.log('\n✅ Миграция завершена!')
}

applyWelcomeTranslations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error)
    process.exit(1)
  })

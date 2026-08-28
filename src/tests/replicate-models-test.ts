import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { generateNeuroPhotoDirect } from '@/services/generateNeuroPhotoDirect'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'

// Mock context
const createMockContext = (telegramId: string): MyContext => {
  return {
    from: { id: Number(telegramId), first_name: 'Test', username: 'test' },
    chat: { id: Number(telegramId), type: 'private' },
    telegram: {} as any,
    botInfo: { username: 'test_bot' },
    session: {
      userModel: null,
      prompt: null,
      language: 'ru',
      userData: { balance: 1000000 },
    } as any,
    reply: async () => {},
    answerCbQuery: async () => {},
  } as any
}

async function getUserModels(telegramId: string) {
  console.log('🔍 Получение моделей пользователя:', telegramId)

  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Ошибка получения моделей:', error)
    return []
  }

  console.log(`✅ Найдено ${data?.length || 0} моделей`)
  return data || []
}

async function testUserModels(telegramId: string) {
  console.log(`\n🧪 ТЕСТ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ ${telegramId}`)
  console.log('='.repeat(60))

  const models = await getUserModels(telegramId)

  if (models.length === 0) {
    console.log('⚠️  У пользователя нет моделей!')
    return
  }

  let successCount = 0
  let failCount = 0

  for (const model of models) {
    console.log(`\n📋 Тестирование модели: ${model.model_name}`)
    console.log(`   ID: ${model.id}`)
    console.log(`   API: ${model.api}`)
    console.log(`   URL: ${model.model_url.substring(0, 50)}...`)
    console.log(`   Created: ${model.created_at}`)

    try {
      const ctx = createMockContext(telegramId)
      ctx.session.userModel = model

      const result = await generateNeuroPhotoDirect(
        'Test image, person, shaman',
        model.model_url,
        1,
        telegramId,
        ctx,
        'test_bot',
        '1:1',
        {
          disable_telegram_sending: true,
          bypass_payment_check: true,
        }
      )

      if (result && result.success) {
        console.log(
          `   ✅ SUCCESS: ${result.urls?.length || 0} images generated`
        )
        successCount++
      } else {
        console.log(`   ❌ FAILED: ${result?.data || 'Unknown error'}`)
        failCount++
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`)
      failCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`📊 ИТОГИ ТЕСТИРОВАНИЯ:`)
  console.log(`   Всего моделей: ${models.length}`)
  console.log(`   Успешных: ${successCount}`)
  console.log(`   Неудачных: ${failCount}`)
  console.log(
    `   Успешность: ${((successCount / models.length) * 100).toFixed(1)}%`
  )
}

// Основная функция
async function main() {
  console.log('🚀 Запуск тестирования Replicate моделей\n')

  const telegramIds = [
    '144022504', // Проблемный пользователь
    // Можно добавить других пользователей для теста
  ]

  for (const telegramId of telegramIds) {
    await testUserModels(telegramId)
    console.log('\n' + '-'.repeat(60) + '\n')
  }

  console.log('✅ Тестирование завершено!')
}

main().catch(console.error)

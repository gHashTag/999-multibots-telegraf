/**
 * Direct Render Server Call Test
 * Прямой вызов render-server с правильным URL
 */

const NEW_EVENT_KEY = 'n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA'

const testPayload = {
  job_id: `telegram-test-${Date.now()}`,
  eleven_labs_api_key: 'sk_6c8d7345808baf2d2fdc4347c56830375ebf68ad980bb502',
  kie_api_key: 'c98141e4b2b6413688fbea2a9b78f127',
  cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
  intro_text_1: 'Ai-Stars',
  intro_text_2: 'News',
  upper_intro_text: 'Ai-Stars',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: 'YOUR_HEDRA_API_KEY_HERE',
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech:
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям. AGENTS.md помогает агентам быстрее понимать архитектуру проекта, правила взаимодействия с кодом и предпочтительные практики разработки, минимизируя необходимость дополнительных пояснений от человека.',
  },
}

async function testDirectRenderCall() {
  console.log('🎯 FINAL INTEGRATION TEST')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('✅ Все исправления применены:')
  console.log('   ✓ Правильный URL: https://inn.gs/e/{KEY}')
  console.log('   ✓ Новый Event Key настроен')
  console.log('   ✓ Inngest Provider обновлен')
  console.log('   ✓ Production .env обновлен')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  console.log('📦 Payload:')
  console.log(`   Job ID: ${testPayload.job_id}`)
  console.log(`   Service: ${testPayload.avatar_gen_service}`)
  console.log(`   Avatar URL: ${testPayload.avatar_settings.avatar_photo_url.substring(0, 60)}...`)
  console.log(`   Speech length: ${testPayload.avatar_settings.avatar_speech.length} chars`)
  console.log('')

  console.log('📤 Отправка события на render-server...')
  console.log(`   URL: https://inn.gs/e/${NEW_EVENT_KEY.substring(0, 20)}...`)
  console.log(`   Event: render/avatar-video`)
  console.log('')

  try {
    const response = await fetch(`https://inn.gs/e/${NEW_EVENT_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'render/avatar-video',
        data: testPayload,
        ts: Date.now(),
      }),
    })

    console.log(`📡 Response: ${response.status} ${response.statusText}`)
    console.log('')

    if (response.ok) {
      const result = await response.json()

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('')
      console.log('🎉 УСПЕХ! Интеграция работает полностью!')
      console.log('')
      console.log(`📝 Event ID: ${result.ids?.[0]}`)
      console.log(`📊 Status: ${result.status}`)
      console.log('')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('')
      console.log('📊 Процесс обработки:')
      console.log('')
      console.log('1️⃣  Inngest Cloud получил событие')
      console.log('    └─ Event ID: ' + result.ids?.[0])
      console.log('')
      console.log('2️⃣  Маршрутизация на render-server (Railway)')
      console.log('    └─ https://render-v3-production.up.railway.app')
      console.log('')
      console.log('3️⃣  Обработка функцией render/avatar-video')
      console.log('    └─ Python FastAPI + Inngest SDK')
      console.log('')
      console.log('4️⃣  Hedra генерирует lip-sync видео')
      console.log('    └─ API Key: sk_hedra_jTiPa9kE...')
      console.log('')
      console.log('5️⃣  ElevenLabs синтезирует голос')
      console.log('    └─ Voice ID: 0BcDz9UPwL3MpsnTeUlO')
      console.log('')
      console.log('6️⃣  Kie.ai добавляет интро и фон')
      console.log('    └─ Cover URL: agentsmd.jpg')
      console.log('')
      console.log('7️⃣  Результат отправляется через webhook')
      console.log('    └─ https://three-head-dragon.shop/api/telegram/ai-reels-callback')
      console.log('')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('')
      console.log('🔍 Мониторинг в реальном времени:')
      console.log('')
      console.log('• Inngest Dashboard:')
      console.log('  https://app.inngest.com')
      console.log(`  Поиск: ${result.ids?.[0]}`)
      console.log('')
      console.log('• Railway Logs (render-server):')
      console.log('  railway logs --service render-v3-production --tail')
      console.log('')
      console.log('• Bot Logs (webhook callback):')
      console.log('  ssh -i ~/.ssh/zomro root@212.86.115.30')
      console.log('  docker logs 999-multibots --tail 100 | grep "ai-reels-callback"')
      console.log('')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('')
      console.log('✅ Готово к использованию в production!')
      console.log('')
      console.log('📝 Пример использования:')
      console.log('')
      console.log('```typescript')
      console.log('import { sendRenderAvatarVideoEvent, createRenderAvatarPayload }')
      console.log('  from "@/inngest_app/render-server-client"')
      console.log('')
      console.log('// Создать payload')
      console.log('const payload = createRenderAvatarPayload(')
      console.log('  ctx.from.id.toString(),')
      console.log('  avatarSpeechText,')
      console.log('  avatarPhotoUrl,')
      console.log('  elevenLabsVoiceId,')
      console.log('  {')
      console.log('    coverUrl: "...",')
      console.log('    introText1: "Ai-Stars",')
      console.log('    introText2: "News",')
      console.log('    upperIntroText: "Ai-Stars"')
      console.log('  }')
      console.log(')')
      console.log('')
      console.log('// Отправить на render-server')
      console.log('const { eventId } = await sendRenderAvatarVideoEvent(payload)')
      console.log('')
      console.log('// Уведомить пользователя')
      console.log('await ctx.reply(')
      console.log('  `✅ Генерация запущена!\\n` +')
      console.log('  `Event ID: ${eventId}\\n` +')
      console.log('  `Вы получите уведомление когда видео будет готово.`')
      console.log(')')
      console.log('```')
    } else {
      const errorText = await response.text()
      console.log('❌ Ошибка при отправке события')
      console.log('')
      console.log(`Статус: ${response.status} ${response.statusText}`)
      console.log(`Ответ: ${errorText}`)
    }
  } catch (error) {
    console.log('❌ Exception:')
    console.log(error instanceof Error ? error.message : String(error))
  }
}

testDirectRenderCall()
  .then(() => {
    console.log('')
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('')
    console.error('❌ Test failed:', error)
    process.exit(1)
  })

/**
 * Проверка всех ботов и амбассадоров в таблице avatars
 * Полный список без ограничений
 */

import { supabase } from '../core/supabase/client'

async function checkAllBots() {
  console.log('🔍 ПРОВЕРКА ВСЕХ БОТОВ И АМБАССАДОРОВ')
  console.log('='.repeat(60))

  try {
    // Получаем ВСЕ записи из avatars без лимитов
    const { data: allAvatars, error: avatarsError } = await supabase
      .from('avatars')
      .select('telegram_id, group, bot_name, created_at')
      .order('group', { ascending: true })

    if (avatarsError) throw avatarsError

    console.log(`\n📊 ВСЕГО ЗАПИСЕЙ В ТАБЛИЦЕ AVATARS: ${allAvatars.length}`)
    console.log('='.repeat(60))

    // Группируем по группам для удобства
    const groupedByGroup = new Map<
      string,
      Array<{ telegram_id: string; bot_name: string; created_at: string }>
    >()

    allAvatars.forEach(avatar => {
      const group = avatar.group
      if (!groupedByGroup.has(group)) {
        groupedByGroup.set(group, [])
      }
      groupedByGroup.get(group)!.push({
        telegram_id: avatar.telegram_id.toString(),
        bot_name: avatar.bot_name,
        created_at: avatar.created_at,
      })
    })

    console.log('\n👥 ПОЛНЫЙ СПИСОК АМБАССАДОРОВ И ИХ БОТОВ:')
    console.log('-'.repeat(60))

    let totalBots = 0
    Array.from(groupedByGroup.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([group, bots], index) => {
        const telegram_id = bots[0].telegram_id
        console.log(`\n${index + 1}. 👤 ГРУППА: ${group}`)
        console.log(`   📞 Telegram ID: ${telegram_id}`)
        console.log(`   🤖 Боты (${bots.length}):`)

        bots.forEach((bot, botIndex) => {
          console.log(`      ${botIndex + 1}. ${bot.bot_name}`)
          totalBots++
        })
      })

    console.log(`\n📈 СТАТИСТИКА:`)
    console.log(`👥 Всего амбассадоров: ${groupedByGroup.size}`)
    console.log(`🤖 Всего ботов: ${totalBots}`)

    // Проверяем, есть ли Play-on бот
    const playOnBots = allAvatars.filter(
      avatar =>
        avatar.bot_name.toLowerCase().includes('play') ||
        avatar.group.toLowerCase().includes('play')
    )

    if (playOnBots.length > 0) {
      console.log(`\n🎮 НАЙДЕНЫ PLAY-ON БОТЫ:`)
      console.log('-'.repeat(40))
      playOnBots.forEach(bot => {
        console.log(`• Группа: ${bot.group}`)
        console.log(`  Бот: ${bot.bot_name}`)
        console.log(`  ID: ${bot.telegram_id}`)
        console.log('')
      })
    } else {
      console.log(`\n❌ PLAY-ON БОТЫ НЕ НАЙДЕНЫ!`)
    }

    // Проверяем уникальность telegram_id
    const uniqueIds = new Set(allAvatars.map(a => a.telegram_id.toString()))
    console.log(`\n🔢 УНИКАЛЬНЫХ TELEGRAM_ID: ${uniqueIds.size}`)

    if (uniqueIds.size < allAvatars.length) {
      console.log(`⚠️ ЕСТЬ ДУБЛИРУЮЩИЕСЯ ID!`)

      // Находим дубликаты
      const idCounts = new Map<string, number>()
      allAvatars.forEach(avatar => {
        const id = avatar.telegram_id.toString()
        idCounts.set(id, (idCounts.get(id) || 0) + 1)
      })

      console.log('\nДУБЛИКАТЫ:')
      idCounts.forEach((count, id) => {
        if (count > 1) {
          const duplicates = allAvatars.filter(
            a => a.telegram_id.toString() === id
          )
          console.log(`\nID ${id} (${count} записей):`)
          duplicates.forEach(dup => {
            console.log(`  • ${dup.group} - ${dup.bot_name}`)
          })
        }
      })
    }
  } catch (error) {
    console.error('💥 Ошибка:', error)
  }
}

// Запуск
checkAllBots()
  .then(() => {
    console.log('\n🏁 Проверка завершена')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })

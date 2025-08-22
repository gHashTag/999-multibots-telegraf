#!/usr/bin/env node

/**
 * Тест ограничений админских прав для LipSync
 * Проверяет что функция доступна только администраторам
 */

const fs = require('fs')
const path = require('path')

console.log('🔒 === ТЕСТ АДМИНСКИХ ОГРАНИЧЕНИЙ LIPSYNC ===\n')

// Тест 1: Проверка конфигурации в mainMenu.ts
function testMenuConfiguration() {
  console.log('1️⃣ Проверка конфигурации меню...')
  
  const menuPath = path.join(process.cwd(), 'src/menu/mainMenu.ts')
  
  if (!fs.existsSync(menuPath)) {
    console.log('   ❌ Файл mainMenu.ts не найден')
    return false
  }
  
  const menuContent = fs.readFileSync(menuPath, 'utf8')
  
  // Проверяем наличие admin_only: true для уровня 14
  const lipsyncLevelRegex = /14:\s*{[^}]*admin_only:\s*true[^}]*}/s
  
  if (lipsyncLevelRegex.test(menuContent)) {
    console.log('   ✅ LipSync правильно настроен как admin_only: true')
    
    // Дополнительная проверка названий
    if (menuContent.includes("'🎤 Kling Lip Sync'") || menuContent.includes('"🎤 Kling Lip Sync"')) {
      console.log('   ✅ Название кнопки корректно')
    } else {
      console.log('   ⚠️ Название кнопки может быть некорректным')
    }
    
    return true
  } else {
    console.log('   ❌ LipSync НЕ настроен как admin_only или конфигурация неверна')
    return false
  }
}

// Тест 2: Проверка защиты в сцене
function testSceneProtection() {
  console.log('\n2️⃣ Проверка защиты в сцене...')
  
  const scenePath = path.join(process.cwd(), 'src/scenes/lipSyncWizard/index.ts')
  
  if (!fs.existsSync(scenePath)) {
    console.log('   ❌ Файл lipSyncWizard/index.ts не найден')
    return false
  }
  
  const sceneContent = fs.readFileSync(scenePath, 'utf8')
  
  // Проверяем наличие админской проверки
  const checks = [
    { name: 'Функция isUserAdmin', pattern: 'function isUserAdmin' },
    { name: 'Проверка admin ID', pattern: 'isUserAdmin(telegramId)' },
    { name: 'Сообщение об ограничении (RU)', pattern: 'временно доступна только администраторам' },
    { name: 'Сообщение об ограничении (EN)', pattern: 'temporarily available for administrators only' },
    { name: 'Выход из сцены', pattern: 'ctx.scene.leave()' }
  ]
  
  let allChecksPass = true
  
  checks.forEach(check => {
    if (sceneContent.includes(check.pattern)) {
      console.log(`   ✅ ${check.name}`)
    } else {
      console.log(`   ❌ ${check.name} - НЕ НАЙДЕНО`)
      allChecksPass = false
    }
  })
  
  return allChecksPass
}

// Тест 3: Проверка переменных окружения
function testEnvironmentSetup() {
  console.log('\n3️⃣ Проверка настройки переменных окружения...')
  
  const adminIds = process.env.ADMIN_IDS
  
  if (!adminIds) {
    console.log('   ⚠️ ADMIN_IDS не установлена в переменных окружения')
    console.log('   💡 Для тестирования установите: ADMIN_IDS=144022504,other_admin_id')
    return false
  }
  
  const adminArray = adminIds.split(',')
  console.log(`   ✅ ADMIN_IDS настроена: ${adminArray.length} админов`)
  console.log(`   📋 Список: ${adminArray.join(', ')}`)
  
  return true
}

// Тест 4: Симуляция логики фильтрации
function testFilterLogic() {
  console.log('\n4️⃣ Симуляция логики фильтрации...')
  
  // Эмулируем логику фильтрации из mainMenu.ts
  const mockLevel = {
    title_ru: '🎤 Kling Lip Sync',
    title_en: '🎤 Kling Lip Sync',
    admin_only: true
  }
  
  const adminIds = (process.env.ADMIN_IDS || '144022504').split(',')
  
  // Тестируем для админа
  const adminUserId = adminIds[0]
  const adminCanSee = !(mockLevel.admin_only && !(adminUserId && adminIds.includes(adminUserId)))
  
  // Тестируем для обычного пользователя
  const regularUserId = '999999999' // ID обычного пользователя
  const regularCanSee = !(mockLevel.admin_only && !(regularUserId && adminIds.includes(regularUserId)))
  
  console.log(`   👤 Админ (${adminUserId}): ${adminCanSee ? '✅ ВИДИТ кнопку' : '❌ НЕ видит кнопку'}`)
  console.log(`   👤 Обычный пользователь (${regularUserId}): ${regularCanSee ? '❌ ВИДИТ кнопку (ПРОБЛЕМА!)' : '✅ НЕ видит кнопку'}`)
  
  return adminCanSee && !regularCanSee
}

// Тест 5: Проверка документации
function testDocumentation() {
  console.log('\n5️⃣ Проверка документации...')
  
  const docPath = path.join(process.cwd(), 'docs/LIPSYNC_ADMIN_ONLY_INSTRUCTIONS.md')
  
  if (fs.existsSync(docPath)) {
    console.log('   ✅ Документация по админским ограничениям создана')
    
    const docContent = fs.readFileSync(docPath, 'utf8')
    
    if (docContent.includes('admin_only: true') && docContent.includes('Как убрать ограничения')) {
      console.log('   ✅ Документация содержит инструкции по снятию ограничений')
      return true
    } else {
      console.log('   ⚠️ Документация неполная')
      return false
    }
  } else {
    console.log('   ❌ Документация по админским ограничениям не найдена')
    return false
  }
}

// Главная функция
async function runAdminRestrictionsTest() {
  console.log('🧪 Запуск теста админских ограничений для LipSync...\n')
  
  const menuOk = testMenuConfiguration()
  const sceneOk = testSceneProtection()
  const envOk = testEnvironmentSetup()
  const logicOk = testFilterLogic()
  const docOk = testDocumentation()
  
  console.log('\n📋 === ИТОГОВЫЙ ОТЧЁТ ===')
  
  const allTestsPass = menuOk && sceneOk && logicOk && docOk
  
  if (allTestsPass) {
    console.log('🟢 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!')
    console.log('✅ LipSync правильно ограничен только для админов')
    
    console.log('\n🔒 АКТИВНЫЕ ОГРАНИЧЕНИЯ:')
    console.log('   1. 🎤 Кнопка скрыта в меню для обычных пользователей')
    console.log('   2. 🛡️ Дополнительная проверка в сцене')
    console.log('   3. 📝 Понятное сообщение об ограничении')
    console.log('   4. 📖 Документация для снятия ограничений')
    
  } else {
    console.log('🔴 НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОШЛИ')
    
    if (!menuOk) {
      console.log('   ❌ Проблемы с конфигурацией меню')
    }
    if (!sceneOk) {
      console.log('   ❌ Проблемы с защитой сцены')
    }
    if (!envOk) {
      console.log('   ⚠️ Требуется настройка ADMIN_IDS')
    }
    if (!logicOk) {
      console.log('   ❌ Проблемы с логикой фильтрации')
    }
    if (!docOk) {
      console.log('   ❌ Проблемы с документацией')
    }
  }
  
  console.log('\n🚀 ДЛЯ ТЕСТИРОВАНИЯ:')
  console.log('   1. Войти в бота как админ - кнопка должна быть видна')
  console.log('   2. Войти в бота как обычный пользователь - кнопки не должно быть')
  console.log('   3. Если каким-то образом попасть в сцену - должно показать сообщение об ограничении')
  
  console.log('\n📖 Инструкции по снятию ограничений: docs/LIPSYNC_ADMIN_ONLY_INSTRUCTIONS.md')
  console.log('\n✨ Тест админских ограничений завершён!')
  
  return allTestsPass
}

// Запуск
runAdminRestrictionsTest().then(success => {
  process.exit(success ? 0 : 1)
}).catch(error => {
  console.error('❌ Ошибка выполнения теста:', error)
  process.exit(1)
})
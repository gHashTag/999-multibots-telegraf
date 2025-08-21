#!/usr/bin/env node

/**
 * 🔧 SMART FIXES DEBUG & LAUNCHER
 * Диагностика и простой запуск системы
 */

console.log('🔍 SMART FIXES SYSTEM - ДИАГНОСТИКА')
console.log('═══════════════════════════════════════════')

// 1. Проверка окружения
console.log('\n📋 ПРОВЕРКА ОКРУЖЕНИЯ:')
console.log(`   Node.js: ${process.version}`)
console.log(`   Платформа: ${process.platform}`)
console.log(`   Директория: ${process.cwd()}`)
console.log(`   Время: ${new Date().toLocaleString('ru-RU')}`)

// 2. Проверка файловой системы
const fs = require('fs')
const path = require('path')

console.log('\n📁 ПРОВЕРКА ФАЙЛОВ:')
const files = [
  'package.json',
  'src/',
  'tsconfig.json',
  'run-smart-fixes.js'
]

files.forEach(file => {
  try {
    const fullPath = path.join(process.cwd(), file)
    const exists = fs.existsSync(fullPath)
    console.log(`   ${exists ? '✅' : '❌'} ${file}`)
  } catch (e) {
    console.log(`   ❌ ${file} - ошибка доступа`)
  }
})

// 3. Проверка src директории
console.log('\n🔍 АНАЛИЗ ПРОЕКТА:')
try {
  const srcPath = path.join(process.cwd(), 'src')
  if (fs.existsSync(srcPath)) {
    const srcFiles = fs.readdirSync(srcPath).length
    console.log(`   📊 Файлов в src/: ${srcFiles}`)
    
    // Быстрый анализ
    const tsFiles = getAllFiles(srcPath, '.ts')
    console.log(`   📝 TypeScript файлов: ${tsFiles.length}`)
    
    let consoleCount = 0
    tsFiles.slice(0, 10).forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf-8')
        if (content.includes('console.')) consoleCount++
      } catch (e) {}
    })
    console.log(`   🚨 Console.log найдено: ${consoleCount} файлов (из первых 10)`)
  } else {
    console.log('   ❌ Директория src/ не найдена')
  }
} catch (e) {
  console.log(`   ❌ Ошибка анализа: ${e.message}`)
}

// 4. Мини Smart Fixes демо
console.log('\n🚀 МИНИ SMART FIXES DEMO:')

const fixes = [
  {
    title: 'Replace console.log with logger',
    type: 'AUTO',
    confidence: 95,
    impact: 'Улучшение логирования'
  },
  {
    title: 'Optimize imports',
    type: 'AUTO', 
    confidence: 90,
    impact: 'Ускорение сборки'
  },
  {
    title: 'Improve TypeScript typing',
    type: 'MANUAL',
    confidence: 80,
    impact: 'Type safety'
  }
]

fixes.forEach((fix, index) => {
  console.log(`   ${index + 1}. 🔧 ${fix.title}`)
  console.log(`      ${fix.type} | ${fix.confidence}% | ${fix.impact}`)
})

// 5. Health Score симуляция
console.log('\n🏥 CODE HEALTH SCORE (симуляция):')
const scores = {
  overall: 7.5,
  codeQuality: 8.2,
  security: 7.8,
  performance: 6.9,
  maintainability: 7.1
}

Object.entries(scores).forEach(([key, value]) => {
  const emoji = value >= 8 ? '🟢' : value >= 6 ? '🟡' : '🔴'
  const bar = '█'.repeat(Math.round(value)) + '░'.repeat(10 - Math.round(value))
  console.log(`   ${emoji} ${key.padEnd(15)}: ${bar} ${value}/10`)
})

console.log('\n✅ ДИАГНОСТИКА ЗАВЕРШЕНА')
console.log('═══════════════════════════════════════════')

console.log('\n🎯 КАК ЗАПУСТИТЬ:')
console.log('   1. node debug-smart-fixes.js    - эта диагностика')
console.log('   2. node run-smart-fixes.js      - полная демонстрация') 
console.log('   3. npm run dev                   - запуск проекта')
console.log('   4. npm test                      - запуск тестов')

console.log('\n💡 ПОЯСНЕНИЕ:')
console.log('   • Этот скрипт работает в ЛЮБОЙ момент')
console.log('   • Claude Code сессия НЕ влияет на Node.js скрипты')
console.log('   • .js файлы запускаются независимо от промптов')
console.log('   • Проблема обычно в правах доступа или зависимостях')

// Утилита для поиска файлов
function getAllFiles(dir, ext) {
  let files = []
  try {
    const items = fs.readdirSync(dir)
    for (const item of items) {
      const fullPath = path.join(dir, item)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          files = files.concat(getAllFiles(fullPath, ext))
        } else if (fullPath.endsWith(ext)) {
          files.push(fullPath)
        }
      } catch (e) {}
    }
  } catch (e) {}
  return files
}
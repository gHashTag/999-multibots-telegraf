#!/usr/bin/env ts-node

import { config } from 'dotenv'
import { generateRobokassaUrl } from '../src/scenes/getRuBillWizard/helper'

// Загружаем переменные окружения
config()

const MERCHANT_LOGIN = process.env.MERCHANT_LOGIN || 'neuroblogger'
const ROBOKASSA_PASSWORD_1 = process.env.ROBOKASSA_PASSWORD_1

if (!ROBOKASSA_PASSWORD_1) {
  console.error('❌ ROBOKASSA_PASSWORD_1 не установлен в .env')
  process.exit(1)
}

// Тестовые параметры
const testCases = [
  {
    name: 'Тестовый платеж 100 руб',
    amount: 100,
    invId: Math.floor(Math.random() * 1000000),
    description: 'Тестовый платеж',
  },
  {
    name: 'НейроФото (1110 руб / 476 звезд)',
    amount: 1110,
    invId: Math.floor(Math.random() * 1000000),
    description: 'Покупка подписки НейроФото',
  },
  {
    name: 'НейроВидео (2999 руб / 1303 звезды)',
    amount: 2999,
    invId: Math.floor(Math.random() * 1000000),
    description: 'Покупка подписки НейроВидео',
  },
]

console.log('='.repeat(70))
console.log('🔗 ГЕНЕРАЦИЯ ССЫЛОК ДЛЯ ROBOKASSA (С ИСПРАВЛЕННОЙ ПОДПИСЬЮ)')
console.log('='.repeat(70))

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`)
  console.log('-'.repeat(50))

  const url = generateRobokassaUrl(
    MERCHANT_LOGIN,
    testCase.amount,
    testCase.invId,
    testCase.description,
    ROBOKASSA_PASSWORD_1
  )

  console.log(`   📋 InvId: ${testCase.invId}`)
  console.log(`   💰 Сумма: ${testCase.amount} руб.`)
  console.log(`   📝 Описание: ${testCase.description}`)
  console.log(`\n   🌐 Ссылка для оплаты:`)
  console.log(`   ${url}`)
})

console.log('\n' + '='.repeat(70))
console.log('✅ ИСПРАВЛЕНИЯ:')
console.log('1. Подпись теперь формируется БЕЗ включения ResultURL')
console.log('2. Параметр ResultUrl2 заменен на стандартный ResultURL')
console.log(
  '3. Webhook отправляется на: https://ai-server-u14194.vm.elestio.app/payment-success'
)
console.log('='.repeat(70))
console.log('\n💡 Откройте любую ссылку в браузере для проверки работы платежа')

// Загрузка TypeScript и путей
require('ts-node/register')
require('tsconfig-paths/register')

// Запуск тестов платежных чеков
require('./runPaymentReceiptTestsOnly.ts')

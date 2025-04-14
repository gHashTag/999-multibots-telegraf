#!/usr/bin/env node

import { runTests } from './test-utils'

async function main() {
  try {
    await runTests()
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов:', error)
    process.exit(1)
  }
}

main()

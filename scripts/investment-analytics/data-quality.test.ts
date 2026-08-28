import { existsSync } from 'fs'
/**
 * 📊 DATA QUALITY TEST
 * Детальная проверка качества данных с классификацией аномалий
 *
 * Функциональность:
 * 1. Анализ структуры данных
 * 2. Выявление всех типов аномалий
 * 3. Классификация по критичности
 * 4. Статистика с примерами
 * 5. Рекомендации по очистке
 */

import fs from 'fs'

interface DataAnomaly {
  type: string
  count: number
  percentage: number
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  examples: any[]
}

interface QualityReport {
  totalRecords: number
  validRecords: number
  problematicRecords: number
  dataQualityScore: number
  anomalies: DataAnomaly[]
  currencyDistribution: { [key: string]: number }
  typeDistribution: { [key: string]: number }
  botActivity: { [key: string]: number }
  topUsers: Array<{ id: number; count: number }>
}

// Этот файл — не юнит-тест, а аналитика по выгрузке payments_data.json,
// которой в репозитории нет (она делается локально). Раньше он просто падал
// с ENOENT у всех. Теперь прогон происходит ТОЛЬКО при наличии выгрузки:
// у кого файл есть — анализ отработает, у остальных честно отметится как
// пропущенный, а не как поломка.
const HAS_PAYMENTS_DUMP = existsSync('payments_data.json')

describe.skipIf(!HAS_PAYMENTS_DUMP)('📊 DATA QUALITY ANALYSIS', () => {
  test('Should perform comprehensive data quality analysis', async () => {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 ДЕТАЛЬНАЯ ПРОВЕРКА КАЧЕСТВА ДАННЫХ')
    console.log('='.repeat(80) + '\n')

    const startTime = Date.now()

    // 1. ЗАГРУЗКА ДАННЫХ
    console.log('📥 Этап 1: Загрузка данных...')
    const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'))
    console.log(`   ✅ Загружено: ${rawData.length} записей\n`)

    // 2. АНАЛИЗ СТРУКТУРЫ
    console.log('🔬 Этап 2: Анализ структуры данных...')
    const sample = rawData[0] || {}
    const fields = Object.keys(sample)
    console.log(`   ✅ Поля: ${fields.join(', ')}`)
    console.log(
      `   ✅ Типы: ${JSON.stringify(fields.map(f => typeof sample[f]))}\n`
    )

    // 3. ВЫЯВЛЕНИЕ АНОМАЛИЙ
    console.log('🚨 Этап 3: Выявление аномалий...\n')

    const anomalies: DataAnomaly[] = []

    // АНОМАЛИЯ 1: ПОЛНЫЕ ДУБЛИКАТЫ
    console.log('   1️⃣  Поиск полных дубликатов...')
    const fullDuplicates = new Map<string, any[]>()
    rawData.forEach((row, index) => {
      const key = JSON.stringify({
        telegram_id: row.telegram_id,
        bot_name: row.bot_name,
        amount: row.amount,
        currency: row.currency,
        type: row.type,
        created_at: row.created_at,
        description: row.description,
      })
      if (!fullDuplicates.has(key)) fullDuplicates.set(key, [])
      fullDuplicates.get(key)!.push(index)
    })

    const duplicateGroups = Array.from(fullDuplicates.values()).filter(
      group => group.length > 1
    )
    const totalFullDuplicates = duplicateGroups.reduce(
      (sum, group) => sum + (group.length - 1),
      0
    )
    const duplicateExamples = duplicateGroups
      .slice(0, 5)
      .map(group => rawData[group[0]])

    if (totalFullDuplicates > 0) {
      anomalies.push({
        type: 'FULL_DUPLICATES',
        count: totalFullDuplicates,
        percentage: (totalFullDuplicates / rawData.length) * 100,
        severity: 'CRITICAL',
        description: `Записи, полностью идентичные друг другу (встречаются ${duplicateGroups.length} групп)`,
        examples: duplicateExamples,
      })
    }
    console.log(
      `      ⚠️  Найдено: ${totalFullDuplicates} дубликатов в ${duplicateGroups.length} группах\n`
    )

    // АНОМАЛИЯ 2: ЧАСТИЧНЫЕ ДУБЛИКАТЫ
    console.log('   2️⃣  Поиск частичных дубликатов...')
    const partialDuplicates = new Map<string, any[]>()
    rawData.forEach((row, index) => {
      const key = `${row.telegram_id}_${row.bot_name}_${row.created_at}`
      if (!partialDuplicates.has(key)) partialDuplicates.set(key, [])
      partialDuplicates.get(key)!.push(index)
    })

    const partialGroups = Array.from(partialDuplicates.values()).filter(
      group => group.length > 1
    )
    const totalPartialDuplicates = partialGroups.reduce(
      (sum, group) => sum + (group.length - 1),
      0
    )
    const partialExamples = partialGroups
      .slice(0, 5)
      .map(group => rawData[group[0]])

    if (totalPartialDuplicates > 0) {
      anomalies.push({
        type: 'PARTIAL_DUPLICATES',
        count: totalPartialDuplicates,
        percentage: (totalPartialDuplicates / rawData.length) * 100,
        severity: 'CRITICAL',
        description: `Записи с одинаковыми telegram_id + bot_name + created_at (${partialGroups.length} групп)`,
        examples: partialExamples,
      })
    }
    console.log(
      `      ⚠️  Найдено: ${totalPartialDuplicates} частичных дубликатов\n`
    )

    // АНОМАЛИЯ 3: ЛОГИЧЕСКИЕ ОШИБКИ (тип + сумма)
    console.log('   3️⃣  Поиск логических ошибок в типах...')
    const typeAmountErrors = rawData.filter((row: any) => {
      const amount = parseFloat(row.amount) || 0
      // MONEY_OUTCOME с положительной суммой - ошибка!
      if (row.type === 'MONEY_OUTCOME' && amount > 0) return true
      // MONEY_INCOME с отрицательной суммой - ошибка!
      if (row.type === 'MONEY_INCOME' && amount < 0) return true
      return false
    })

    const typeErrorExamples = typeAmountErrors.slice(0, 5)

    if (typeAmountErrors.length > 0) {
      anomalies.push({
        type: 'TYPE_AMOUNT_MISMATCH',
        count: typeAmountErrors.length,
        percentage: (typeAmountErrors.length / rawData.length) * 100,
        severity: 'CRITICAL',
        description: 'Несоответствие типа операции и знака суммы',
        examples: typeErrorExamples,
      })
    }
    console.log(
      `      ⚠️  Найдено: ${typeAmountErrors.length} логических ошибок\n`
    )

    // АНОМАЛИЯ 4: НУЛЕВЫЕ СУММЫ
    console.log('   4️⃣  Поиск нулевых сумм...')
    const zeroAmounts = rawData.filter(
      (row: any) => parseFloat(row.amount) === 0
    )
    const zeroExamples = zeroAmounts.slice(0, 5)

    if (zeroAmounts.length > 0) {
      anomalies.push({
        type: 'ZERO_AMOUNTS',
        count: zeroAmounts.length,
        percentage: (zeroAmounts.length / rawData.length) * 100,
        severity: 'MEDIUM',
        description: 'Операции с нулевой суммой (системные операции)',
        examples: zeroExamples,
      })
    }
    console.log(`      ⚠️  Найдено: ${zeroAmounts.length} нулевых сумм\n`)

    // АНОМАЛИЯ 5: ОТРИЦАТЕЛЬНЫЕ СУММЫ
    console.log('   5️⃣  Поиск отрицательных сумм...')
    const negativeAmounts = rawData.filter(
      (row: any) => parseFloat(row.amount) < 0
    )
    const negativeExamples = negativeAmounts.slice(0, 5)

    if (negativeAmounts.length > 0) {
      anomalies.push({
        type: 'NEGATIVE_AMOUNTS',
        count: negativeAmounts.length,
        percentage: (negativeAmounts.length / rawData.length) * 100,
        severity: 'LOW',
        description: 'Операции с отрицательной суммой (возвраты, списания)',
        examples: negativeExamples,
      })
    }
    console.log(
      `      ⚠️  Найдено: ${negativeAmounts.length} отрицательных сумм\n`
    )

    // АНОМАЛИЯ 6: НЕИЗВЕСТНЫЕ ТИПЫ
    console.log('   6️⃣  Поиск неизвестных типов операций...')
    const validTypes = ['MONEY_INCOME', 'MONEY_OUTCOME']
    const unknownTypes = rawData.filter(
      (row: any) => !validTypes.includes(row.type)
    )
    const unknownTypeGroups = unknownTypes.reduce((acc: any, row: any) => {
      acc[row.type] = (acc[row.type] || 0) + 1
      return acc
    }, {})

    if (unknownTypes.length > 0) {
      anomalies.push({
        type: 'UNKNOWN_TYPES',
        count: unknownTypes.length,
        percentage: (unknownTypes.length / rawData.length) * 100,
        severity: 'MEDIUM',
        description: `Неизвестные типы операций: ${JSON.stringify(unknownTypeGroups)}`,
        examples: unknownTypes.slice(0, 5),
      })
    }
    console.log(
      `      ⚠️  Найдено: ${unknownTypes.length} записей с неизвестными типами\n`
    )

    // АНОМАЛИЯ 7: НЕКОРРЕКТНЫЕ ВАЛЮТЫ
    console.log('   7️⃣  Поиск некорректных валют...')
    const validCurrencies = ['XTR', 'STARS', 'RUB']
    const invalidCurrencies = rawData.filter(
      (row: any) => !validCurrencies.includes(row.currency)
    )
    const currencyGroups = invalidCurrencies.reduce((acc: any, row: any) => {
      acc[row.currency] = (acc[row.currency] || 0) + 1
      return acc
    }, {})

    if (invalidCurrencies.length > 0) {
      anomalies.push({
        type: 'INVALID_CURRENCIES',
        count: invalidCurrencies.length,
        percentage: (invalidCurrencies.length / rawData.length) * 100,
        severity: 'MEDIUM',
        description: `Некорректные валюты: ${JSON.stringify(currencyGroups)}`,
        examples: invalidCurrencies.slice(0, 5),
      })
    }
    console.log(
      `      ⚠️  Найдено: ${invalidCurrencies.length} записей с некорректными валютами\n`
    )

    // АНОМАЛИЯ 8: ОЧЕНЬ БОЛЬШИЕ СУММЫ
    console.log('   8️⃣  Поиск аномально больших сумм...')
    const maxAmount = Math.max(
      ...rawData.map((row: any) => Math.abs(parseFloat(row.amount) || 0))
    )
    const largeThreshold = 10000
    const largeAmounts = rawData.filter(
      (row: any) => Math.abs(parseFloat(row.amount) || 0) > largeThreshold
    )
    const largeExamples = largeAmounts.slice(0, 5)

    if (largeAmounts.length > 0) {
      anomalies.push({
        type: 'LARGE_AMOUNTS',
        count: largeAmounts.length,
        percentage: (largeAmounts.length / rawData.length) * 100,
        severity: 'LOW',
        description: `Суммы больше ${largeThreshold} (максимум: ${maxAmount})`,
        examples: largeExamples,
      })
    }
    console.log(`      ⚠️  Найдено: ${largeAmounts.length} больших сумм\n`)

    // 4. РАСЧЕТ СТАТИСТИК
    console.log('📊 Этап 4: Расчет статистики...\n')

    // Валюты
    const currencyDistribution = rawData.reduce((acc: any, row: any) => {
      acc[row.currency] = (acc[row.currency] || 0) + 1
      return acc
    }, {})

    console.log('   💱 Распределение по валютам:')
    Object.entries(currencyDistribution).forEach(([curr, count]) => {
      const percent = (((count as number) / rawData.length) * 100).toFixed(1)
      console.log(`      ${curr}: ${count} (${percent}%)`)
    })
    console.log('')

    // Типы операций
    const typeDistribution = rawData.reduce((acc: any, row: any) => {
      acc[row.type] = (acc[row.type] || 0) + 1
      return acc
    }, {})

    console.log('   💰 Распределение по типам:')
    Object.entries(typeDistribution).forEach(([type, count]) => {
      const percent = (((count as number) / rawData.length) * 100).toFixed(1)
      console.log(`      ${type}: ${count} (${percent}%)`)
    })
    console.log('')

    // Активность ботов
    const botActivity = rawData.reduce((acc: any, row: any) => {
      acc[row.bot_name] = (acc[row.bot_name] || 0) + 1
      return acc
    }, {})

    const topBots = Object.entries(botActivity)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)

    console.log('   🤖 Топ-5 ботов по активности:')
    topBots.forEach(([bot, count], i) => {
      const percent = (((count as number) / rawData.length) * 100).toFixed(1)
      console.log(`      ${i + 1}. ${bot}: ${count} (${percent}%)`)
    })
    console.log('')

    // Топ пользователей
    const userActivity = rawData.reduce((acc: any, row: any) => {
      acc[row.telegram_id] = (acc[row.telegram_id] || 0) + 1
      return acc
    }, {})

    const topUsers = Object.entries(userActivity)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id: parseInt(id), count }))

    console.log('   👥 Топ-5 пользователей по активности:')
    topUsers.forEach((user, i) => {
      console.log(`      ${i + 1}. ID: ${user.id} - ${user.count} операций`)
    })
    console.log('')

    // 5. РАСЧЕТ QUALITY SCORE
    console.log('🎯 Этап 5: Расчет Quality Score...\n')

    const criticalWeight = 10
    const highWeight = 5
    const mediumWeight = 2
    const lowWeight = 1

    let totalPenalty = 0
    anomalies.forEach(anomaly => {
      const weight =
        anomaly.severity === 'CRITICAL'
          ? criticalWeight
          : anomaly.severity === 'HIGH'
            ? highWeight
            : anomaly.severity === 'MEDIUM'
              ? mediumWeight
              : lowWeight
      totalPenalty += anomaly.count * weight
    })

    const maxPossiblePenalty = rawData.length * criticalWeight
    const qualityScore = Math.max(
      0,
      100 - (totalPenalty / maxPossiblePenalty) * 100
    )

    const totalProblematic = anomalies.reduce((sum, a) => sum + a.count, 0)
    const validRecords = rawData.length - totalProblematic

    const qualityReport: QualityReport = {
      totalRecords: rawData.length,
      validRecords,
      problematicRecords: totalProblematic,
      dataQualityScore: Math.round(qualityScore * 100) / 100,
      anomalies,
      currencyDistribution,
      typeDistribution,
      botActivity: Object.fromEntries(topBots),
      topUsers,
    }

    console.log(`   📊 Total Records: ${qualityReport.totalRecords}`)
    console.log(`   ✅ Valid Records: ${qualityReport.validRecords}`)
    console.log(
      `   ❌ Problematic Records: ${qualityReport.problematicRecords}`
    )
    console.log(`   📈 Quality Score: ${qualityReport.dataQualityScore}/100`)

    // Статус качества
    let status = 'EXCELLENT'
    let statusIcon = '🟢'
    if (qualityScore < 50) {
      status = 'POOR'
      statusIcon = '🔴'
    } else if (qualityScore < 70) {
      status = 'FAIR'
      statusIcon = '🟡'
    } else if (qualityScore < 85) {
      status = 'GOOD'
      statusIcon = '🟠'
    }

    console.log(`   ${statusIcon} Status: ${status}\n`)

    // 6. СОХРАНЕНИЕ ОТЧЕТА
    console.log('💾 Этап 6: Сохранение отчета...')
    const reportPath = 'DATA_QUALITY_REPORT.json'
    fs.writeFileSync(reportPath, JSON.stringify(qualityReport, null, 2))
    console.log(`   ✅ Отчет сохранен: ${reportPath}\n`)

    // 7. ИТОГОВАЯ СТАТИСТИКА
    console.log('='.repeat(80))
    console.log('✅ АНАЛИЗ КАЧЕСТВА ДАННЫХ ЗАВЕРШЕН')
    console.log('='.repeat(80))
    console.log(`\n📊 КЛЮЧЕВЫЕ МЕТРИКИ:`)
    console.log(`   📄 Отчет: ${reportPath}`)
    console.log(`   📈 Quality Score: ${qualityReport.dataQualityScore}/100`)
    console.log(
      `   📊 Общие записи: ${qualityReport.totalRecords.toLocaleString()}`
    )
    console.log(
      `   ✅ Корректные: ${qualityReport.validRecords.toLocaleString()}`
    )
    console.log(
      `   ❌ Проблемные: ${qualityReport.problematicRecords.toLocaleString()}`
    )
    console.log(
      `   🚨 Критические аномалии: ${anomalies.filter(a => a.severity === 'CRITICAL').length}`
    )
    console.log(
      `\n⏱️  Время выполнения: ${((Date.now() - startTime) / 1000).toFixed(2)} сек`
    )
    console.log('='.repeat(80) + '\n')

    // 8. ПРОВЕРКИ
    expect(qualityReport.totalRecords).toBeGreaterThan(0)
    expect(qualityReport.dataQualityScore).toBeGreaterThanOrEqual(0)
    expect(qualityReport.dataQualityScore).toBeLessThanOrEqual(100)

    // Возвращаем отчет
    return qualityReport
  }, 300000)
})

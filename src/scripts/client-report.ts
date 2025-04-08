import { supabase } from '@/core/supabase'
import { Logger as logger } from '@/utils/logger'
import fs from 'fs'
import path from 'path'

import * as Excel from 'exceljs'

/**
 * Скрипт для формирования детального отчета по операциям клиента
 * Запуск: ts-node -r tsconfig-paths/register src/scripts/client-report.ts
 */

interface PaymentInfo {
  payment_id: number
  payment_date: string
  amount: number
  stars: number
  description: string
  status: string
  type: string
  payment_method: string
  currency: string
  service_type: string
  metadata?: Record<string, any>
}

interface DailyOperationSummary {
  date: string
  operations: PaymentInfo[]
  totalSpent: number
  totalImages: number
  byServiceType: Record<string, { count: number; stars: number }>
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const SERVICE_TYPES_MAP: Record<string, string> = {
  text_to_image: 'Генерация изображений по тексту',
  neuro_photo: 'Нейрофото',
  image_to_prompt: 'Анализ изображения',
  text_to_video: 'Генерация видео по тексту',
  image_to_video: 'Анимация изображения',
  voice: 'Голосовой помощник',
  text_to_speech: 'Озвучка текста',
  lip_sync: 'Синхронизация губ',
  digital_avatar_body: 'Цифровой аватар',
  digital_avatar_body_v2: 'Цифровой аватар v2',
  avatar: 'Аватар',
  chat_with_avatar: 'Чат с аватаром',
  select_model: 'Выбор модели',
  select_model_wizard: 'Мастер выбора модели',
}

async function generateClientReport(telegramId: string) {
  try {
    logger.info('🚀 Формирование отчета для клиента', {
      description: 'Generating client report',
      telegram_id: telegramId,
    })

    // Получаем все поступления средств
    const { data: incomeData, error: incomeError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'COMPLETED')
      .eq('type', 'money_income')
      .order('payment_date', { ascending: true })

    if (incomeError) {
      logger.error('❌ Ошибка при получении данных о поступлениях:', {
        description: 'Error getting income data',
        error: incomeError.message,
      })
      throw incomeError
    }

    // Получаем все расходы средств
    const { data: expenseData, error: expenseError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'COMPLETED')
      .eq('type', 'money_expense')
      .order('payment_date', { ascending: true })

    if (expenseError) {
      logger.error('❌ Ошибка при получении данных о расходах:', {
        description: 'Error getting expense data',
        error: expenseError.message,
      })
      throw expenseError
    }

    // Получаем текущий баланс
    const { data: balanceData, error: balanceError } = await supabase
      .from('users')
      .select('balance, first_name, last_name, username')
      .eq('telegram_id', telegramId)
      .single()

    if (balanceError) {
      logger.error('❌ Ошибка при получении данных о балансе:', {
        description: 'Error getting balance data',
        error: balanceError.message,
      })
      throw balanceError
    }

    // Формируем данные по дням
    const dailyOperations: Record<string, DailyOperationSummary> = {}

    // Обрабатываем расходы по дням
    expenseData?.forEach(payment => {
      const date = new Date(payment.payment_date).toISOString().split('T')[0]

      if (!dailyOperations[date]) {
        dailyOperations[date] = {
          date,
          operations: [],
          totalSpent: 0,
          totalImages: 0,
          byServiceType: {},
        }
      }

      dailyOperations[date].operations.push(payment)
      dailyOperations[date].totalSpent += Math.abs(payment.amount)

      // Определяем тип сервиса
      const serviceType = payment.metadata?.service_type || 'unknown'

      if (!dailyOperations[date].byServiceType[serviceType]) {
        dailyOperations[date].byServiceType[serviceType] = {
          count: 0,
          stars: 0,
        }
      }

      dailyOperations[date].byServiceType[serviceType].count += 1
      dailyOperations[date].byServiceType[serviceType].stars += Math.abs(
        payment.amount
      )

      // Подсчет изображений
      if (
        serviceType === 'text_to_image' ||
        serviceType === 'neuro_photo' ||
        serviceType === 'image_generation'
      ) {
        dailyOperations[date].totalImages += 1
      }
    })

    // Форматируем отчет
    let report = `# Детальный отчет по операциям клиента (ID: ${telegramId})\n\n`

    // Информация о клиенте
    const username = balanceData?.username
      ? `@${balanceData.username}`
      : 'Не указан'
    const fullName =
      `${balanceData?.first_name || ''} ${
        balanceData?.last_name || ''
      }`.trim() || 'Не указано'

    report += `## Информация о клиенте\n\n`
    report += `- 👤 ID: ${telegramId}\n`
    report += `- 📝 Имя: ${fullName}\n`
    report += `- 🔖 Username: ${username}\n\n`

    // Общая статистика
    const totalIncome =
      incomeData?.reduce((sum, payment) => sum + payment.amount, 0) || 0
    const totalExpense =
      expenseData?.reduce(
        (sum, payment) => sum + Math.abs(payment.amount),
        0
      ) || 0
    const currentBalance = balanceData?.balance || 0

    report += `## Общая статистика\n\n`
    report += `- 💰 Всего поступило средств: ${totalIncome.toFixed(2)} звезд\n`
    report += `- 💸 Всего потрачено средств: ${totalExpense.toFixed(2)} звезд\n`
    report += `- ⭐ Текущий баланс: ${currentBalance.toFixed(2)} звезд\n\n`

    // Сводка по типам сервисов
    const serviceTypeSummary: Record<string, { count: number; stars: number }> =
      {}

    Object.values(dailyOperations).forEach(day => {
      Object.entries(day.byServiceType).forEach(([service, data]) => {
        if (!serviceTypeSummary[service]) {
          serviceTypeSummary[service] = { count: 0, stars: 0 }
        }
        serviceTypeSummary[service].count += data.count
        serviceTypeSummary[service].stars += data.stars
      })
    })

    report += `## Распределение расходов по типам сервисов\n\n`
    report += `| Сервис | Количество операций | Потрачено звезд | % от общих расходов |\n`
    report += `|--------|---------------------|-----------------|--------------------|\n`

    Object.entries(serviceTypeSummary)
      .sort((a, b) => b[1].stars - a[1].stars)
      .forEach(([service, data]) => {
        const serviceName = SERVICE_TYPES_MAP[service] || service
        const percentage = ((data.stars / totalExpense) * 100).toFixed(2)

        report += `| ${serviceName} | ${data.count} | ${data.stars.toFixed(
          2
        )} | ${percentage}% |\n`
      })

    report += `\n`

    // Детализация поступлений
    report += `## Поступления средств\n\n`
    report += `| Дата | Сумма (руб) | Звезды | Описание | Способ оплаты |\n`
    report += `|------|------------|--------|----------|---------------|\n`

    incomeData?.forEach(payment => {
      const date = formatDate(new Date(payment.payment_date))
      const amount = payment.currency === 'RUB' ? payment.amount : '-'
      const stars = payment.stars || payment.amount

      report += `| ${date} | ${amount} | ${stars} | ${payment.description} | ${
        payment.payment_method || 'Не указан'
      } |\n`
    })

    report += `\n## Расходы по дням\n\n`

    // Сортируем дни
    const sortedDays = Object.keys(dailyOperations).sort().reverse()

    sortedDays.forEach(date => {
      const dayData = dailyOperations[date]
      const formattedDate = formatDate(new Date(date))

      report += `### ${formattedDate}\n\n`
      report += `- 💸 Всего потрачено: ${dayData.totalSpent.toFixed(2)} звезд\n`
      report += `- 🖼️ Всего создано изображений: ${dayData.totalImages}\n\n`

      // Детализация по типам сервисов за день
      report += `#### Использование по сервисам\n\n`
      report += `| Сервис | Количество | Потрачено звезд |\n`
      report += `|--------|------------|----------------|\n`

      Object.entries(dayData.byServiceType)
        .sort((a, b) => b[1].stars - a[1].stars)
        .forEach(([service, data]) => {
          const serviceName = SERVICE_TYPES_MAP[service] || service

          report += `| ${serviceName} | ${data.count} | ${data.stars.toFixed(
            2
          )} |\n`
        })

      report += `\n#### Детализация операций\n\n`
      report += `| Время | Операция | Стоимость (звезд) |\n`
      report += `|-------|----------|-------------------|\n`

      dayData.operations.forEach(op => {
        const time = new Date(op.payment_date).toLocaleTimeString('ru-RU')
        const description = op.description.replace(/^❌ /, '')

        report += `| ${time} | ${description} | ${Math.abs(op.amount).toFixed(
          2
        )} |\n`
      })

      report += `\n`
    })

    // Сохраняем отчет в файл
    const reportFileName = `client-report-${telegramId}-${
      new Date().toISOString().split('T')[0]
    }.md`
    const reportPath = path.join(process.cwd(), 'reports', reportFileName)

    // Создаем директорию, если она не существует
    if (!fs.existsSync(path.join(process.cwd(), 'reports'))) {
      fs.mkdirSync(path.join(process.cwd(), 'reports'))
    }

    fs.writeFileSync(reportPath, report)

    logger.info('✅ Отчет в формате MD успешно сформирован и сохранен', {
      description: 'Markdown report generated and saved successfully',
      path: reportPath,
    })

    // Создаем Excel отчет
    await createExcelReport({
      telegramId,
      incomeData,
      expenseData,
      balanceData,
      dailyOperations,
      totalIncome,
      totalExpense,
      currentBalance,
      serviceTypeSummary,
    })

    return reportPath
  } catch (error) {
    logger.error('❌ Ошибка при формировании отчета:', {
      description: 'Error generating report',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: telegramId,
    })
    throw error
  }
}

/**
 * Создает отчет в формате Excel
 */
async function createExcelReport(data: {
  telegramId: string
  incomeData: any[]
  expenseData: any[]
  balanceData: any
  dailyOperations: Record<string, DailyOperationSummary>
  totalIncome: number
  totalExpense: number
  currentBalance: number
  serviceTypeSummary: Record<string, { count: number; stars: number }>
}) {
  const {
    telegramId,
    incomeData,
    expenseData,
    balanceData,
    dailyOperations,
    totalIncome,
    totalExpense,
    currentBalance,
    serviceTypeSummary,
  } = data

  // Создаем новую книгу Excel
  const workbook = new Excel.Workbook()

  // Информация о документе
  workbook.creator = 'NeuroLenaAssistant_bot'
  workbook.lastModifiedBy = 'NeuroLenaAssistant_bot'
  workbook.created = new Date()
  workbook.modified = new Date()

  // 1. Лист с общей информацией
  const summarySheet = workbook.addWorksheet('Сводная информация')

  // Форматирование заголовка
  summarySheet.mergeCells('A1:E1')
  const titleCell = summarySheet.getCell('A1')
  titleCell.value = `Детальный отчет по операциям клиента (ID: ${telegramId})`
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'center' }

  // Информация о клиенте
  const username = balanceData?.username
    ? `@${balanceData.username}`
    : 'Не указан'
  const fullName =
    `${balanceData?.first_name || ''} ${balanceData?.last_name || ''}`.trim() ||
    'Не указано'

  summarySheet.addRow([''])
  summarySheet.addRow(['Информация о клиенте:', ''])
  summarySheet.addRow(['ID:', telegramId])
  summarySheet.addRow(['Имя:', fullName])
  summarySheet.addRow(['Username:', username])

  // Общая статистика
  summarySheet.addRow([''])
  summarySheet.addRow(['Общая статистика:', ''])
  summarySheet.addRow([
    'Всего поступило средств:',
    `${totalIncome.toFixed(2)} звезд`,
  ])
  summarySheet.addRow([
    'Всего потрачено средств:',
    `${totalExpense.toFixed(2)} звезд`,
  ])
  summarySheet.addRow(['Текущий баланс:', `${currentBalance.toFixed(2)} звезд`])

  // Сводка по типам сервисов
  summarySheet.addRow([''])
  summarySheet.addRow(['Распределение расходов по типам сервисов:', ''])

  // Заголовки таблицы
  const serviceHeader = summarySheet.addRow([
    'Сервис',
    'Количество операций',
    'Потрачено звезд',
    '% от общих расходов',
  ])
  serviceHeader.eachCell(cell => {
    cell.font = { bold: true }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    }
  })

  // Данные таблицы
  Object.entries(serviceTypeSummary)
    .sort((a, b) => b[1].stars - a[1].stars)
    .forEach(([service, data]) => {
      const serviceName = SERVICE_TYPES_MAP[service] || service
      const percentage = ((data.stars / totalExpense) * 100).toFixed(2)

      const row = summarySheet.addRow([
        serviceName,
        data.count,
        data.stars.toFixed(2),
        `${percentage}%`,
      ])

      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })

  // Автоматическая ширина столбцов
  summarySheet.columns.forEach(column => {
    column.width = 25
  })

  // 2. Лист с поступлениями
  const incomeSheet = workbook.addWorksheet('Поступления средств')

  // Заголовок
  incomeSheet.mergeCells('A1:F1')
  const incomeTitle = incomeSheet.getCell('A1')
  incomeTitle.value = 'Поступления средств'
  incomeTitle.font = { bold: true, size: 14 }
  incomeTitle.alignment = { horizontal: 'center' }

  // Заголовки таблицы
  const incomeHeader = incomeSheet.addRow([
    'Дата',
    'Время',
    'Сумма (руб)',
    'Звезды',
    'Описание',
    'Способ оплаты',
  ])

  incomeHeader.eachCell(cell => {
    cell.font = { bold: true }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    }
  })

  // Данные таблицы
  incomeData?.forEach(payment => {
    const paymentDate = new Date(payment.payment_date)
    const date = formatDate(paymentDate)
    const time = paymentDate.toLocaleTimeString('ru-RU')
    const amount = payment.currency === 'RUB' ? payment.amount : '-'
    const stars = payment.stars || payment.amount

    const row = incomeSheet.addRow([
      date,
      time,
      amount,
      stars,
      payment.description,
      payment.payment_method || 'Не указан',
    ])

    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
  })

  // Автоматическая ширина столбцов
  incomeSheet.columns.forEach(column => {
    column.width = 25
  })

  // 3. Лист с расходами
  const expenseSheet = workbook.addWorksheet('Расходы по дням')

  // Заголовок
  expenseSheet.mergeCells('A1:E1')
  const expenseTitle = expenseSheet.getCell('A1')
  expenseTitle.value = 'Расходы по дням'
  expenseTitle.font = { bold: true, size: 14 }
  expenseTitle.alignment = { horizontal: 'center' }

  // Заголовки таблицы
  const expenseHeader = expenseSheet.addRow([
    'Дата',
    'Время',
    'Операция',
    'Тип сервиса',
    'Стоимость (звезд)',
  ])

  expenseHeader.eachCell(cell => {
    cell.font = { bold: true }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    }
  })

  // Данные таблицы
  expenseData?.forEach(payment => {
    const paymentDate = new Date(payment.payment_date)
    const date = formatDate(paymentDate)
    const time = paymentDate.toLocaleTimeString('ru-RU')
    const description = payment.description.replace(/^❌ /, '')
    const serviceType = payment.metadata?.service_type || 'unknown'
    const serviceName = SERVICE_TYPES_MAP[serviceType] || serviceType

    const row = expenseSheet.addRow([
      date,
      time,
      description,
      serviceName,
      Math.abs(payment.amount).toFixed(2),
    ])

    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
  })

  // Автоматическая ширина столбцов
  expenseSheet.columns.forEach(column => {
    column.width = 35
  })

  // 4. Лист с ежедневной статистикой
  const dailyStatsSheet = workbook.addWorksheet('Ежедневная статистика')

  // Заголовок
  dailyStatsSheet.mergeCells('A1:D1')
  const dailyStatsTitle = dailyStatsSheet.getCell('A1')
  dailyStatsTitle.value = 'Ежедневная статистика'
  dailyStatsTitle.font = { bold: true, size: 14 }
  dailyStatsTitle.alignment = { horizontal: 'center' }

  // Заголовки таблицы
  const dailyStatsHeader = dailyStatsSheet.addRow([
    'Дата',
    'Всего операций',
    'Всего создано изображений',
    'Всего потрачено звезд',
  ])

  dailyStatsHeader.eachCell(cell => {
    cell.font = { bold: true }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    }
  })

  // Данные таблицы
  Object.keys(dailyOperations)
    .sort()
    .reverse()
    .forEach(date => {
      const dayData = dailyOperations[date]
      const formattedDate = formatDate(new Date(date))

      const row = dailyStatsSheet.addRow([
        formattedDate,
        dayData.operations.length,
        dayData.totalImages,
        dayData.totalSpent.toFixed(2),
      ])

      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })

  // Автоматическая ширина столбцов
  dailyStatsSheet.columns.forEach(column => {
    column.width = 30
  })

  // Сохраняем файл
  const excelFileName = `client-report-${telegramId}-${
    new Date().toISOString().split('T')[0]
  }.xlsx`
  const excelPath = path.join(process.cwd(), 'reports', excelFileName)

  await workbook.xlsx.writeFile(excelPath)

  logger.info('✅ Отчет в формате Excel успешно сформирован и сохранен', {
    description: 'Excel report generated and saved successfully',
    path: excelPath,
  })

  console.log(`✅ Excel отчет успешно сформирован и сохранен: ${excelPath}`)

  return excelPath
}

// Запускаем генерацию отчета для клиента с ID 2086031075
generateClientReport('2086031075')
  .then(reportPath => {
    console.log(`📊 Отчет готов! Путь к файлу: ${reportPath}`)
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Ошибка при формировании отчета:', error)
    process.exit(1)
  })

/**
 * Генератор отчетов о результатах тестирования
 *
 * Этот класс отвечает за создание отчетов о результатах тестирования
 * в различных форматах (HTML, JSON) для удобного анализа и интеграции
 * с другими инструментами.
 */

import fs from 'fs'
import path from 'path'
import { TestResult, TestStatus } from '../types'
import { logger } from '@/utils/logger'

/**
 * Формат генерируемого отчета
 */
export enum ReportFormat {
  JSON = 'json',
  HTML = 'html',
}

/**
 * Опции генерации отчета
 */
export interface ReportOptions {
  /** Директория для сохранения отчетов */
  outputDir: string
  /** Название файла отчета (без расширения) */
  reportName: string
  /** Добавлять ли временную метку к имени файла */
  addTimestamp: boolean
  /** Генерировать подробный отчет с деталями каждого теста */
  detailed: boolean
}

/**
 * Структура данных отчета
 */
interface ReportData {
  /** Общая статистика */
  summary: {
    /** Общее количество тестов */
    total: number
    /** Количество успешных тестов */
    success: number
    /** Количество неудачных тестов */
    failed: number
    /** Количество пропущенных тестов */
    skipped: number
    /** Дата и время формирования отчета */
    timestamp: string
    /** Процент успешных тестов */
    successRate: number
  }
  /** Категоризированные результаты тестов */
  categories: Record<
    string,
    {
      /** Общее количество тестов в категории */
      total: number
      /** Количество успешных тестов в категории */
      success: number
      /** Количество неудачных тестов в категории */
      failed: number
      /** Количество пропущенных тестов в категории */
      skipped: number
      /** Процент успешных тестов в категории */
      successRate: number
      /** Результаты отдельных тестов */
      tests: TestResult[]
    }
  >
}

/**
 * Класс генератора отчетов о тестировании
 */
export class ReportGenerator {
  private options: ReportOptions

  /**
   * Конструктор класса ReportGenerator
   * @param options Опции генерации отчетов
   */
  constructor(options: Partial<ReportOptions> = {}) {
    this.options = {
      outputDir: options.outputDir || 'test-reports',
      reportName: options.reportName || 'test-report',
      addTimestamp:
        options.addTimestamp !== undefined ? options.addTimestamp : true,
      detailed: options.detailed !== undefined ? options.detailed : true,
    }

    // Создаем директорию для отчетов, если она не существует
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true })
      logger.info({
        message: `📁 Создана директория для отчетов: ${this.options.outputDir}`,
        description: 'Created directory for reports',
      })
    }
  }

  /**
   * Генерирует отчет о результатах тестирования
   * @param results Результаты тестирования
   * @param format Формат отчета
   * @returns Путь к созданному файлу отчета
   */
  async generateReport(
    results: TestResult[],
    format: ReportFormat = ReportFormat.HTML
  ): Promise<string> {
    // Форматируем данные отчета из результатов тестов
    const reportData = this.formatReportData(results)

    // Генерируем отчет в указанном формате
    if (format === ReportFormat.JSON) {
      return this.generateJsonReport(reportData)
    } else {
      return this.generateHtmlReport(reportData)
    }
  }

  /**
   * Генерирует отчет в формате JSON
   * @param reportData Данные отчета
   * @returns Путь к созданному файлу отчета
   */
  private async generateJsonReport(reportData: ReportData): Promise<string> {
    const timestamp = this.options.addTimestamp ? this.getTimestamp() : ''
    const fileName = `${this.options.reportName}${timestamp}.json`
    const filePath = path.join(this.options.outputDir, fileName)

    // Записываем данные в файл JSON
    const jsonContent = JSON.stringify(reportData, null, 2)
    await fs.promises.writeFile(filePath, jsonContent, 'utf8')

    logger.info({
      message: `📊 Создан JSON отчет: ${filePath}`,
      description: 'Created JSON report',
      filePath,
    })

    return filePath
  }

  /**
   * Генерирует отчет в формате HTML
   * @param reportData Данные отчета
   * @returns Путь к созданному файлу отчета
   */
  private async generateHtmlReport(reportData: ReportData): Promise<string> {
    const timestamp = this.options.addTimestamp ? this.getTimestamp() : ''
    const fileName = `${this.options.reportName}${timestamp}.html`
    const filePath = path.join(this.options.outputDir, fileName)

    // Создаем HTML-отчет
    const htmlContent = this.convertToHtml(reportData)
    await fs.promises.writeFile(filePath, htmlContent, 'utf8')

    logger.info({
      message: `📊 Создан HTML отчет: ${filePath}`,
      description: 'Created HTML report',
      filePath,
    })

    return filePath
  }

  /**
   * Форматирует данные отчета из результатов тестов
   * @param results Результаты тестирования
   * @returns Структурированные данные отчета
   */
  private formatReportData(results: TestResult[]): ReportData {
    // Обрабатываем общую статистику
    const total = results.length
    const success = results.filter(r => r.status === TestStatus.Success).length
    const failed = results.filter(r => r.status === TestStatus.Failed).length
    const skipped = results.filter(r => r.status === TestStatus.Skipped).length
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0

    // Группируем результаты по категориям
    const categoriesMap: Record<string, TestResult[]> = {}

    for (const result of results) {
      const category = result.category || 'Uncategorized'
      if (!categoriesMap[category]) {
        categoriesMap[category] = []
      }
      categoriesMap[category].push(result)
    }

    // Формируем структуру категорий
    const categories: ReportData['categories'] = {}

    for (const [category, tests] of Object.entries(categoriesMap)) {
      const categoryTotal = tests.length
      const categorySuccess = tests.filter(
        r => r.status === TestStatus.Success
      ).length
      const categoryFailed = tests.filter(
        r => r.status === TestStatus.Failed
      ).length
      const categorySkipped = tests.filter(
        r => r.status === TestStatus.Skipped
      ).length
      const categorySuccessRate =
        categoryTotal > 0
          ? Math.round((categorySuccess / categoryTotal) * 100)
          : 0

      categories[category] = {
        total: categoryTotal,
        success: categorySuccess,
        failed: categoryFailed,
        skipped: categorySkipped,
        successRate: categorySuccessRate,
        tests,
      }
    }

    return {
      summary: {
        total,
        success,
        failed,
        skipped,
        timestamp: new Date().toISOString(),
        successRate,
      },
      categories,
    }
  }

  /**
   * Преобразует данные отчета в HTML-формат
   * @param reportData Данные отчета
   * @returns HTML-представление отчета
   */
  private convertToHtml(reportData: ReportData): string {
    const { summary, categories } = reportData

    // Начало HTML-документа со стилями
    let html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Отчет о тестировании</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f7;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          padding: 30px;
        }
        h1 {
          color: #333;
          border-bottom: 2px solid #eee;
          padding-bottom: 10px;
          margin-top: 0;
        }
        h2 {
          margin-top: 30px;
          color: #444;
          border-bottom: 1px solid #eee;
          padding-bottom: 5px;
        }
        .summary {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          margin: 20px 0;
          gap: 15px;
        }
        .card {
          background-color: white;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          padding: 15px;
          flex: 1;
          min-width: 200px;
          text-align: center;
        }
        .card-title {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
        }
        .card-value {
          font-size: 28px;
          font-weight: bold;
        }
        .success { color: #34c759; }
        .failed { color: #ff3b30; }
        .skipped { color: #ff9500; }
        .total { color: #007aff; }
        
        .category {
          margin-bottom: 30px;
          background-color: white;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }
        .category-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          background-color: #f9f9f9;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }
        .category-name {
          font-weight: bold;
          color: #333;
        }
        .category-stats {
          display: flex;
          gap: 15px;
        }
        .category-stat {
          display: flex;
          align-items: center;
          font-size: 14px;
        }
        .category-stat-value {
          font-weight: bold;
          margin-left: 5px;
        }
        .category-content {
          padding: 0 15px;
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-in-out;
        }
        .category-content.expanded {
          max-height: 2000px;
          padding: 15px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        th, td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #eee;
        }
        th {
          background-color: #f5f5f7;
          font-weight: 500;
        }
        .test-name {
          font-weight: 500;
        }
        .test-status {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        .status-success {
          background-color: rgba(52, 199, 89, 0.1);
          color: #34c759;
        }
        .status-failed {
          background-color: rgba(255, 59, 48, 0.1);
          color: #ff3b30;
        }
        .status-skipped {
          background-color: rgba(255, 149, 0, 0.1);
          color: #ff9500;
        }
        .timestamp {
          color: #666;
          font-size: 14px;
          margin-top: 5px;
        }
        .progress-bar {
          height: 6px;
          background-color: #eeeeee;
          border-radius: 3px;
          overflow: hidden;
          margin-top: 5px;
        }
        .progress-fill {
          height: 100%;
          background-color: #34c759;
        }
        
        /* Стили для кнопок раскрытия */
        .toggle-button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: #007aff;
        }
        
        /* Анимация для стрелок */
        .arrow {
          display: inline-block;
          transition: transform 0.3s;
        }
        .expanded .arrow {
          transform: rotate(90deg);
        }
        
        /* Адаптивность */
        @media (max-width: 768px) {
          .summary {
            flex-direction: column;
          }
          .card {
            width: 100%;
          }
          .category-stats {
            flex-direction: column;
            gap: 5px;
          }
          .category-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Отчет о тестировании</h1>
        <div class="timestamp">Сгенерирован: ${new Date(summary.timestamp).toLocaleString()}</div>
        
        <div class="summary">
          <div class="card">
            <div class="card-title">Всего тестов</div>
            <div class="card-value total">${summary.total}</div>
          </div>
          <div class="card">
            <div class="card-title">Успешных</div>
            <div class="card-value success">${summary.success}</div>
          </div>
          <div class="card">
            <div class="card-title">Неудачных</div>
            <div class="card-value failed">${summary.failed}</div>
          </div>
          <div class="card">
            <div class="card-title">Пропущенных</div>
            <div class="card-value skipped">${summary.skipped}</div>
          </div>
          <div class="card">
            <div class="card-title">Успешность</div>
            <div class="card-value ${summary.successRate > 80 ? 'success' : summary.successRate > 50 ? 'skipped' : 'failed'}">${summary.successRate}%</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${summary.successRate}%"></div>
            </div>
          </div>
        </div>
        
        <h2>Результаты по категориям</h2>
    `

    // Добавляем разделы для каждой категории
    for (const [categoryName, category] of Object.entries(categories)) {
      html += `
        <div class="category">
          <div class="category-header" onclick="toggleCategory(this.parentElement)">
            <div class="category-name">
              <span class="arrow">▶</span> ${categoryName}
            </div>
            <div class="category-stats">
              <div class="category-stat">
                Всего: <span class="category-stat-value total">${category.total}</span>
              </div>
              <div class="category-stat">
                Успешно: <span class="category-stat-value success">${category.success}</span>
              </div>
              <div class="category-stat">
                Неудачно: <span class="category-stat-value failed">${category.failed}</span>
              </div>
              <div class="category-stat">
                Пропущено: <span class="category-stat-value skipped">${category.skipped}</span>
              </div>
              <div class="category-stat">
                Успешность: <span class="category-stat-value ${category.successRate > 80 ? 'success' : category.successRate > 50 ? 'skipped' : 'failed'}">${category.successRate}%</span>
              </div>
            </div>
          </div>
          <div class="category-content">
            <table>
              <thead>
                <tr>
                  <th>Название теста</th>
                  <th>Статус</th>
                  <th>Время (мс)</th>
                  ${this.options.detailed ? '<th>Сообщение</th>' : ''}
                </tr>
              </thead>
              <tbody>
      `

      // Добавляем строку для каждого теста в категории
      for (const test of category.tests) {
        const statusClass =
          test.status === TestStatus.Success
            ? 'status-success'
            : test.status === TestStatus.Failed
              ? 'status-failed'
              : 'status-skipped'

        const statusText =
          test.status === TestStatus.Success
            ? 'Успешно'
            : test.status === TestStatus.Failed
              ? 'Неудачно'
              : 'Пропущено'

        html += `
                <tr>
                  <td class="test-name">${test.name}</td>
                  <td><span class="test-status ${statusClass}">${statusText}</span></td>
                  <td>${test.durationMs !== undefined ? test.durationMs.toFixed(2) : '-'}</td>
                  ${this.options.detailed ? `<td>${test.message || '-'}</td>` : ''}
                </tr>
        `
      }

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `
    }

    // Закрываем HTML-документ и добавляем JavaScript для интерактивности
    html += `
        <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
          Сгенерировано автоматически системой тестирования v1.0
        </div>
      </div>
      
      <script>
        function toggleCategory(categoryElement) {
          const content = categoryElement.querySelector('.category-content');
          content.classList.toggle('expanded');
          const arrow = categoryElement.querySelector('.arrow');
          arrow.style.transform = content.classList.contains('expanded') ? 'rotate(90deg)' : 'rotate(0)';
        }
        
        // Раскрываем категории с ошибками по умолчанию
        document.addEventListener('DOMContentLoaded', function() {
          const categoriesWithErrors = document.querySelectorAll('.category');
          categoriesWithErrors.forEach(category => {
            const failedStat = category.querySelector('.failed');
            if (failedStat && parseInt(failedStat.textContent) > 0) {
              toggleCategory(category);
            }
          });
        });
      </script>
    </body>
    </html>
    `

    return html
  }

  /**
   * Генерирует временную метку для имени файла
   * @returns Строка с временной меткой
   */
  private getTimestamp(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')

    return `-${year}${month}${day}-${hours}${minutes}`
  }
}

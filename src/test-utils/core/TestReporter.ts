import fs from 'fs';
import path from 'path';
import { TestResult } from './types';
import { logger } from '@/utils/logger';

/**
 * Класс для генерации отчетов о тестировании
 */
export class TestReporter {
  /**
   * Формат отчета
   */
  private format: 'text' | 'json' | 'html';

  /**
   * Путь к файлу отчета
   */
  private outputPath?: string;

  /**
   * Результаты тестов
   */
  private results: TestResult[];

  /**
   * Время начала выполнения тестов
   */
  private startTime: number;

  /**
   * Время окончания выполнения тестов
   */
  private endTime: number;

  /**
   * Создает экземпляр репортера
   * 
   * @param format Формат отчета
   * @param outputPath Путь к файлу отчета (опционально)
   */
  constructor(format: 'text' | 'json' | 'html' = 'text', outputPath?: string) {
    this.format = format;
    this.outputPath = outputPath;
    this.results = [];
    this.startTime = Date.now();
    this.endTime = Date.now();
  }

  /**
   * Устанавливает время начала выполнения тестов
   * 
   * @param time Время начала в миллисекундах
   */
  setStartTime(time: number): void {
    this.startTime = time;
  }

  /**
   * Устанавливает время окончания выполнения тестов
   * 
   * @param time Время окончания в миллисекундах
   */
  setEndTime(time: number): void {
    this.endTime = time;
  }

  /**
   * Добавляет результаты тестов
   * 
   * @param results Результаты тестов
   */
  addResults(results: TestResult[]): void {
    this.results.push(...results);
  }

  /**
   * Генерирует отчет
   */
  async generateReport(): Promise<string> {
    switch (this.format) {
      case 'json':
        return this.generateJsonReport();
      case 'html':
        return this.generateHtmlReport();
      case 'text':
      default:
        return this.generateTextReport();
    }
  }

  /**
   * Сохраняет отчет в файл
   * 
   * @param content Содержимое отчета
   */
  async saveReport(content: string): Promise<void> {
    if (!this.outputPath) {
      return;
    }

    try {
      // Создаем директорию, если она не существует
      const dir = path.dirname(this.outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Записываем отчет в файл
      fs.writeFileSync(this.outputPath, content);
      logger.info(`📊 Report saved to ${this.outputPath}`);
    } catch (error) {
      logger.error(`❌ Error saving report to ${this.outputPath}:`, error);
    }
  }

  /**
   * Генерирует текстовый отчет
   */
  private generateTextReport(): string {
    const successful = this.results.filter(r => r.success || r.passed).length;
    const failed = this.results.length - successful;
    const totalTime = this.endTime - this.startTime;

    // Группируем тесты по категориям
    const groupedTests = this.groupByCategory(this.results);

    let report = `
📊 Test Report
==================================
✓ Passed: ${successful}
✗ Failed: ${failed}
Total: ${this.results.length}
Duration: ${this.formatDuration(totalTime)}
Started: ${new Date(this.startTime).toISOString()}
Finished: ${new Date(this.endTime).toISOString()}
==================================

`;

    // Добавляем детали по категориям
    for (const [category, tests] of Object.entries(groupedTests)) {
      const categoryPassed = tests.filter(t => t.success || t.passed).length;
      const categoryFailed = tests.length - categoryPassed;

      report += `
Category: ${category} (${categoryPassed}/${tests.length} passed)
----------------------------------
`;

      // Добавляем информацию о каждом тесте
      for (const test of tests) {
        const status = test.success || test.passed ? '✓' : '✗';
        const duration = test.duration ? ` [${this.formatDuration(test.duration)}]` : '';
        report += `${status} ${test.name}${duration}\n`;

        // Если тест не прошел, добавляем информацию об ошибке
        if (!(test.success || test.passed)) {
          const errorMessage = test.error instanceof Error 
            ? test.error.message 
            : test.error || test.message || 'Unknown error';
          report += `   Error: ${errorMessage}\n`;
        }
      }
    }

    return report;
  }

  /**
   * Генерирует JSON отчет
   */
  private generateJsonReport(): string {
    const successful = this.results.filter(r => r.success || r.passed).length;
    const failed = this.results.length - successful;
    const totalTime = this.endTime - this.startTime;

    // Группируем тесты по категориям
    const groupedTests = this.groupByCategory(this.results);

    const report = {
      summary: {
        total: this.results.length,
        passed: successful,
        failed: failed,
        duration: totalTime,
        startTime: this.startTime,
        endTime: this.endTime
      },
      categories: Object.entries(groupedTests).map(([category, tests]) => ({
        name: category,
        total: tests.length,
        passed: tests.filter(t => t.success || t.passed).length,
        tests: tests.map(test => ({
          name: test.name,
          success: test.success || test.passed,
          duration: test.duration,
          message: test.message,
          error: test.error instanceof Error 
            ? test.error.message 
            : test.error
        }))
      }))
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Генерирует HTML отчет
   */
  private generateHtmlReport(): string {
    const successful = this.results.filter(r => r.success || r.passed).length;
    const failed = this.results.length - successful;
    const totalTime = this.endTime - this.startTime;

    // Группируем тесты по категориям
    const groupedTests = this.groupByCategory(this.results);

    // Базовый HTML
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.4;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      margin-top: 0;
    }
    .summary {
      background: #f8f9fa;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .category {
      margin-bottom: 30px;
      border: 1px solid #e9ecef;
      border-radius: 5px;
      overflow: hidden;
    }
    .category-header {
      background: #f1f3f5;
      padding: 15px;
      border-bottom: 1px solid #e9ecef;
    }
    .test-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .test-item {
      padding: 10px 15px;
      border-bottom: 1px solid #e9ecef;
    }
    .test-item:last-child {
      border-bottom: none;
    }
    .test-name {
      font-weight: 500;
      display: flex;
      align-items: center;
    }
    .test-status {
      display: inline-block;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      margin-right: 10px;
      text-align: center;
      line-height: 20px;
      color: white;
      font-weight: bold;
    }
    .test-status.success {
      background: #37b24d;
    }
    .test-status.fail {
      background: #f03e3e;
    }
    .test-details {
      margin-left: 30px;
      margin-top: 5px;
      color: #666;
    }
    .test-error {
      margin-left: 30px;
      margin-top: 5px;
      padding: 10px;
      background: #fff5f5;
      border-left: 3px solid #f03e3e;
      color: #e03131;
    }
    .progress-bar {
      height: 30px;
      border-radius: 15px;
      background: #e9ecef;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .progress-value {
      height: 100%;
      background: #37b24d;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }
    .badge {
      display: inline-block;
      padding: 3px 7px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      margin-left: 5px;
    }
    .badge.success {
      background: #37b24d;
      color: white;
    }
    .badge.fail {
      background: #f03e3e;
      color: white;
    }
    .timestamp {
      color: #868e96;
      font-size: 0.9em;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <h1>Test Report</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <div class="progress-bar">
      <div class="progress-value" style="width: ${successful / this.results.length * 100}%">
        ${successful} / ${this.results.length} (${Math.round(successful / this.results.length * 100)}%)
      </div>
    </div>
    <p>
      <strong>Total:</strong> ${this.results.length} tests
      <span class="badge success">✓ ${successful} passed</span>
      <span class="badge fail">✗ ${failed} failed</span>
    </p>
    <p><strong>Duration:</strong> ${this.formatDuration(totalTime)}</p>
    <p class="timestamp">
      <strong>Started:</strong> ${new Date(this.startTime).toISOString()}<br>
      <strong>Finished:</strong> ${new Date(this.endTime).toISOString()}
    </p>
  </div>
`;

    // Добавляем детали по категориям
    for (const [category, tests] of Object.entries(groupedTests)) {
      const categoryPassed = tests.filter(t => t.success || t.passed).length;
      const categoryFailed = tests.length - categoryPassed;

      html += `
  <div class="category">
    <div class="category-header">
      <h3>${category}</h3>
      <p>
        <strong>Total:</strong> ${tests.length} tests
        <span class="badge success">✓ ${categoryPassed} passed</span>
        <span class="badge fail">✗ ${categoryFailed} failed</span>
      </p>
    </div>
    <ul class="test-list">
`;

      // Добавляем информацию о каждом тесте
      for (const test of tests) {
        const isSuccess = test.success || test.passed;
        const status = isSuccess ? 'success' : 'fail';
        const statusSymbol = isSuccess ? '✓' : '✗';
        const duration = test.duration ? this.formatDuration(test.duration) : 'N/A';

        html += `
      <li class="test-item">
        <div class="test-name">
          <span class="test-status ${status}">${statusSymbol}</span>
          ${test.name}
        </div>
        <div class="test-details">
          Duration: ${duration}
        </div>
`;

        // Если тест не прошел, добавляем информацию об ошибке
        if (!isSuccess) {
          const errorMessage = test.error instanceof Error 
            ? test.error.message 
            : test.error || test.message || 'Unknown error';
          html += `
        <div class="test-error">
          <strong>Error:</strong> ${errorMessage}
        </div>
`;
        }

        html += `
      </li>
`;
      }

      html += `
    </ul>
  </div>
`;
    }

    html += `
</body>
</html>
`;

    return html;
  }

  /**
   * Группирует тесты по категориям
   */
  private groupByCategory(tests: TestResult[]): Record<string, TestResult[]> {
    const grouped: Record<string, TestResult[]> = {};

    for (const test of tests) {
      const category = test.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(test);
    }

    return grouped;
  }

  /**
   * Форматирует длительность из миллисекунд в читаемый формат
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    const remainingMs = ms % 1000;

    if (seconds < 60) {
      return `${seconds}.${remainingMs.toString().padStart(3, '0')}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}.${remainingMs.toString().padStart(3, '0')}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m ${remainingSeconds}.${remainingMs.toString().padStart(3, '0')}s`;
  }
} 
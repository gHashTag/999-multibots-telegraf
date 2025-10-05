#!/usr/bin/env node

/**
 * Claude Code Custom Slash Command: /check
 *
 * Быстрая проверка JavaScript ошибок в продакшн логах:
 * - Подключается к серверу 185.161.67.53
 * - Анализирует логи Docker контейнера 999-multibots
 * - Ищет только JavaScript/TypeScript ошибки
 * - Предлагает быстрые исправления
 * - НЕ выполняет полное развертывание
 */

const { execSync } = require('child_process');

// Конфигурация
const CONFIG = {
  PRODUCTION_SERVER: {
    HOST: '185.161.67.53',
    USER: 'root',
    SSH_KEY: '~/.ssh/selectel',
    CONTAINER: '999-multibots'
  },
  COLORS: {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    CYAN: '\x1b[36m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
  },
  // JavaScript error patterns
  JS_ERROR_PATTERNS: [
    'TypeError:',
    'ReferenceError:',
    'SyntaxError:',
    'Cannot find module',
    'MODULE_NOT_FOUND',
    'ENOENT:',
    'UnhandledPromiseRejectionWarning',
    'Error:',
    'throw new'
  ]
};

class JSErrorChecker {
  constructor() {
    this.errorsFound = [];
    this.criticalErrors = [];
  }

  log(message, color = CONFIG.COLORS.RESET) {
    console.log(`${color}${message}${CONFIG.COLORS.RESET}`);
  }

  logSuccess(message) {
    this.log(`✅ ${message}`, CONFIG.COLORS.GREEN);
  }

  logWarning(message) {
    this.log(`⚠️  ${message}`, CONFIG.COLORS.YELLOW);
  }

  logError(message) {
    this.log(`❌ ${message}`, CONFIG.COLORS.RED);
  }

  exec(command) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output: result.trim() };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stdout || error.stderr || ''
      };
    }
  }

  async checkContainerStatus() {
    this.log('\n🔍 Проверка статуса продакшн контейнера...', CONFIG.COLORS.BLUE);

    const sshCommand = `ssh -i ${CONFIG.PRODUCTION_SERVER.SSH_KEY} ${CONFIG.PRODUCTION_SERVER.USER}@${CONFIG.PRODUCTION_SERVER.HOST} "docker ps --filter 'name=${CONFIG.PRODUCTION_SERVER.CONTAINER}' --format 'table {{.Names}}\t{{.Status}}'"`;

    const result = this.exec(sshCommand);

    if (!result.success || !result.output.includes(CONFIG.PRODUCTION_SERVER.CONTAINER)) {
      this.logError(`Контейнер ${CONFIG.PRODUCTION_SERVER.CONTAINER} не запущен!`);
      return false;
    }

    this.logSuccess(`Контейнер работает: ${result.output.split('\n')[1] || 'Up'}`);
    return true;
  }

  async analyzeJSErrors() {
    this.log('\n🐛 Анализ JavaScript ошибок в логах...', CONFIG.COLORS.BLUE);

    // Получаем последние 200 строк логов
    const sshCommand = `ssh -i ${CONFIG.PRODUCTION_SERVER.SSH_KEY} ${CONFIG.PRODUCTION_SERVER.USER}@${CONFIG.PRODUCTION_SERVER.HOST} "docker logs ${CONFIG.PRODUCTION_SERVER.CONTAINER} --tail 200 2>&1"`;

    const result = this.exec(sshCommand);

    if (!result.success) {
      this.logError('Не удалось получить логи контейнера');
      return false;
    }

    const logs = result.output;
    const logLines = logs.split('\n');

    // Анализируем каждую строку на наличие JavaScript ошибок
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];

      for (const pattern of CONFIG.JS_ERROR_PATTERNS) {
        if (line.includes(pattern)) {
          const errorInfo = {
            pattern,
            line: line.trim(),
            lineNumber: i + 1,
            context: this.getErrorContext(logLines, i)
          };

          this.errorsFound.push(errorInfo);

          // Определяем критические ошибки
          if (this.isCriticalError(pattern)) {
            this.criticalErrors.push(errorInfo);
          }

          break; // Избегаем дублирования одной строки
        }
      }
    }

    return true;
  }

  getErrorContext(logLines, errorIndex) {
    // Получаем 2 строки до и после ошибки для контекста
    const start = Math.max(0, errorIndex - 2);
    const end = Math.min(logLines.length, errorIndex + 3);
    return logLines.slice(start, end).join('\n');
  }

  isCriticalError(pattern) {
    const criticalPatterns = [
      'Cannot find module',
      'MODULE_NOT_FOUND',
      'TypeError:',
      'ReferenceError:',
      'SyntaxError:',
      'UnhandledPromiseRejectionWarning'
    ];
    return criticalPatterns.includes(pattern);
  }

  displayResults() {
    this.log('\n📊 РЕЗУЛЬТАТЫ АНАЛИЗА', CONFIG.COLORS.BOLD);
    this.log('='.repeat(50), CONFIG.COLORS.CYAN);

    if (this.errorsFound.length === 0) {
      this.logSuccess('JavaScript ошибок не обнаружено! 🎉');
      this.log('Продакшн система работает стабильно.');
      return;
    }

    // Статистика
    this.log(`📈 Всего JavaScript ошибок: ${this.errorsFound.length}`, CONFIG.COLORS.YELLOW);
    this.log(`🚨 Критических ошибок: ${this.criticalErrors.length}`, CONFIG.COLORS.RED);

    // Показываем критические ошибки
    if (this.criticalErrors.length > 0) {
      this.log('\n🚨 КРИТИЧЕСКИЕ ОШИБКИ:', CONFIG.COLORS.RED);
      this.criticalErrors.slice(0, 3).forEach((error, index) => {
        this.log(`\n${index + 1}. ${error.pattern}`, CONFIG.COLORS.RED);
        this.log(`   ${error.line}`, CONFIG.COLORS.YELLOW);
      });
    }

    // Показываем остальные ошибки
    const otherErrors = this.errorsFound.filter(e => !this.isCriticalError(e.pattern));
    if (otherErrors.length > 0) {
      this.log('\n⚠️  ДРУГИЕ ОШИБКИ:', CONFIG.COLORS.YELLOW);
      otherErrors.slice(0, 3).forEach((error, index) => {
        this.log(`\n${index + 1}. ${error.pattern}`, CONFIG.COLORS.YELLOW);
        this.log(`   ${error.line}`);
      });
    }
  }

  suggestFixes() {
    if (this.errorsFound.length === 0) return;

    this.log('\n💡 РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ:', CONFIG.COLORS.BLUE);
    this.log('='.repeat(50), CONFIG.COLORS.CYAN);

    const hasModuleErrors = this.errorsFound.some(e => e.pattern.includes('Cannot find module'));
    const hasTypeErrors = this.errorsFound.some(e => e.pattern.includes('TypeError'));
    const hasReferenceErrors = this.errorsFound.some(e => e.pattern.includes('ReferenceError'));

    if (hasModuleErrors) {
      this.log('🔧 Для ошибок модулей:', CONFIG.COLORS.YELLOW);
      this.log('   npm run build:alias && npm run deploy');
    }

    if (hasTypeErrors || hasReferenceErrors) {
      this.log('🔧 Для ошибок типов/ссылок:', CONFIG.COLORS.YELLOW);
      this.log('   npm run typecheck && npm run build');
    }

    this.log('\n🚀 Быстрая перестройка контейнера:', CONFIG.COLORS.BLUE);
    this.log('   ssh -i ~/.ssh/selectel root@185.161.67.53');
    this.log('   cd /root/999-agents-telegraf');
    this.log('   docker stop 999-multibots && docker rm 999-multibots');
    this.log('   docker build --no-cache -t 999-multibots .');
    this.log('   docker run -d --name 999-multibots --restart=always -p 3001:3001 -v /root/999-agents-telegraf/.env:/app/.env:ro 999-multibots');

    this.log('\n📋 Автоматические команды:', CONFIG.COLORS.CYAN);
    this.log('   npm run deploy:check:fix    # Анализ с авто-исправлениями');
    this.log('   npm run deploy:check:quick  # Быстрая повторная проверка');
  }

  async check() {
    this.log('\n🔍 БЫСТРАЯ ПРОВЕРКА JAVASCRIPT ОШИБОК', CONFIG.COLORS.BOLD);
    this.log('Claude Code Slash Command: /check\n', CONFIG.COLORS.CYAN);

    try {
      if (!(await this.checkContainerStatus())) return false;
      if (!(await this.analyzeJSErrors())) return false;

      this.displayResults();
      this.suggestFixes();

      // Возвращаем статус
      const hasCritical = this.criticalErrors.length > 0;
      if (hasCritical) {
        this.log('\n❌ ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ ОШИБКИ - ТРЕБУЕТСЯ ВМЕШАТЕЛЬСТВО', CONFIG.COLORS.RED);
        return false;
      } else if (this.errorsFound.length > 0) {
        this.log('\n⚠️  Обнаружены некритические ошибки - рекомендуется исправление', CONFIG.COLORS.YELLOW);
        return true;
      } else {
        this.log('\n✅ ВСЕ В ПОРЯДКЕ - JAVASCRIPT ОШИБОК НЕ ОБНАРУЖЕНО', CONFIG.COLORS.GREEN);
        return true;
      }

    } catch (error) {
      this.logError(`Критическая ошибка: ${error.message}`);
      return false;
    }
  }
}

// Главная функция
async function main() {
  const checker = new JSErrorChecker();
  const success = await checker.check();

  process.exit(success ? 0 : 1);
}

// Запуск
if (require.main === module) {
  main().catch(error => {
    console.error('Необработанная ошибка:', error);
    process.exit(1);
  });
}

module.exports = { JSErrorChecker };
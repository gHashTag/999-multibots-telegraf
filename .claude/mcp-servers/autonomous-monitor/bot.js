#!/usr/bin/env node
/**
 * Autonomous Monitor Admin Telegram Bot
 * Clean JavaScript version without TypeScript complications
 */

const { Telegraf, Markup } = require('telegraf');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { InfisicalClient } = require('@infisical/sdk');
const Anthropic = require('@anthropic-ai/sdk');

const execAsync = promisify(exec);

// ============================================================================
// LOAD SECRETS FROM INFISICAL
// ============================================================================

async function loadSecrets() {
  console.log('🔐 Loading secrets from Infisical...');

  try {
    // Create Infisical client (v1.2.11 API)
    const client = new InfisicalClient({
      clientId: process.env.INFISICAL_CLIENT_ID,
      clientSecret: process.env.INFISICAL_CLIENT_SECRET
    });

    console.log('✅ Client created');

    // List all secrets from project (v1.2.11 uses direct listSecrets)
    const secrets = await client.listSecrets({
      projectId: process.env.INFISICAL_PROJECT_ID,
      environment: process.env.INFISICAL_ENVIRONMENT || 'prod',
      path: '/'
    });

    // Set environment variables from Infisical
    secrets.forEach((secret) => {
      if (!process.env[secret.secretKey]) {
        process.env[secret.secretKey] = secret.secretValue;
      }
    });

    console.log(`✅ Loaded ${secrets.length} secrets from Infisical`);
  } catch (error) {
    console.error('⚠️  Failed to load from Infisical:', error.message);
    console.log('ℹ️  Falling back to environment variables');
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  container: process.env.DOCKER_CONTAINER || '999-multibots',
  host: '212.86.115.30',
  snapshotsDir: '/root/snapshots',
  botFarmDir: '/root/bot-farm',
  conversationsFile: '/root/autonomous-monitor/conversations.json',
};

// ============================================================================
// CONVERSATION HISTORY (JSON FILE)
// ============================================================================

function loadConversations() {
  try {
    if (fs.existsSync(CONFIG.conversationsFile)) {
      const data = fs.readFileSync(CONFIG.conversationsFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Failed to load conversations:', error.message);
  }
  return {};
}

function saveConversations(conversations) {
  try {
    fs.writeFileSync(CONFIG.conversationsFile, JSON.stringify(conversations, null, 2));
  } catch (error) {
    console.error('Failed to save conversations:', error.message);
  }
}

let conversations = loadConversations();

function getConversationHistory(userId, limit = 20) {
  const userConversation = conversations[userId] || [];
  return userConversation.slice(-limit);
}

function saveMessage(userId, role, content) {
  if (!conversations[userId]) {
    conversations[userId] = [];
  }
  conversations[userId].push({ role, content, timestamp: new Date().toISOString() });

  // Keep only last 50 messages per user
  if (conversations[userId].length > 50) {
    conversations[userId] = conversations[userId].slice(-50);
  }

  saveConversations(conversations);
}

function clearConversation(userId) {
  conversations[userId] = [];
  saveConversations(conversations);
}

// ============================================================================
// HELPER FUNCTIONS - LOCAL DOCKER COMMANDS
// ============================================================================

async function getDockerLogs(lines = 50) {
  const { stdout } = await execAsync(`docker logs ${CONFIG.container} --tail ${lines} 2>&1`);
  return stdout;
}

async function getContainerStats() {
  const { stdout } = await execAsync(`docker stats ${CONFIG.container} --no-stream --format "{{.CPUPerc}},{{.MemPerc}},{{.MemUsage}},{{.NetIO}}"`);
  const [cpu, memory, memUsage, netIO] = stdout.trim().split(',');

  return {
    cpu: cpu.replace('%', '').trim(),
    memory: memory.replace('%', '').trim(),
    memUsage: memUsage.trim(),
    netIO: netIO.trim(),
  };
}

async function getContainerStatus() {
  const { stdout } = await execAsync(`docker ps --filter name=${CONFIG.container} --format "{{.Status}}"`);
  return stdout.trim();
}

async function listSnapshots() {
  const { stdout } = await execAsync(`ls -lht ${CONFIG.snapshotsDir}/*.tar.gz 2>/dev/null || echo ""`);
  if (!stdout.trim()) return [];

  const lines = stdout.trim().split('\n');
  return lines.map(line => {
    const parts = line.split(/\s+/);
    const size = parts[4];
    const filename = parts[8];
    const basename = filename.split('/').pop();

    // Parse format 1: v0.0.5-stable-20251104_193925.tar.gz
    const match1 = basename.match(/^v?([\d.]+)-(\w+)-(\d{8}_\d{6})\.tar\.gz$/);
    if (match1) {
      const [, version, type, timestamp] = match1;
      const dateStr = timestamp.substring(0, 8); // 20251104
      const timeStr = timestamp.substring(9, 15); // 193925
      const date = `${dateStr.substring(6, 8)}.${dateStr.substring(4, 6)}.${dateStr.substring(0, 4)} ${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;

      return { filename: basename, size, version, type, date, timestamp };
    }

    // Parse format 2: docker-snapshot-prod-stable-20251110_053132.tar.gz
    const match2 = basename.match(/^docker-snapshot-(\w+)-(\w+)-(\d{8}_\d{6})\.tar\.gz$/);
    if (match2) {
      const [, env, type, timestamp] = match2;
      const dateStr = timestamp.substring(0, 8); // 20251110
      const timeStr = timestamp.substring(9, 15); // 053132
      const date = `${dateStr.substring(6, 8)}.${dateStr.substring(4, 6)}.${dateStr.substring(0, 4)} ${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;

      return { filename: basename, size, version: env, type, date, timestamp };
    }

    // Unknown format
    return { filename: basename, size, version: 'unknown', type: 'unknown', date: 'unknown', timestamp: '' };
  });
}

async function restoreSnapshot(filename) {
  const snapshotPath = `${CONFIG.snapshotsDir}/${filename}`;

  // Stop container
  await execAsync(`docker stop ${CONFIG.container}`);

  // Backup current state
  const backupName = `backup-before-restore-${Date.now()}.tar.gz`;
  await execAsync(`cd ${CONFIG.botFarmDir} && tar -czf ${CONFIG.snapshotsDir}/${backupName} .`);

  // Clear current directory
  await execAsync(`rm -rf ${CONFIG.botFarmDir}/*`);

  // Extract snapshot
  await execAsync(`tar -xzf ${snapshotPath} -C ${CONFIG.botFarmDir}`);

  // Start container
  await execAsync(`docker start ${CONFIG.container}`);

  return backupName;
}

function createProgressBar(value, length = 10) {
  const percent = Math.min(Math.max(parseFloat(value) || 0, 0), 100);
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  const emoji = percent > 80 ? '🔴' : percent > 60 ? '🟡' : '🟢';
  return `${emoji} ${'▓'.repeat(filled)}${'░'.repeat(empty)} ${percent.toFixed(1)}%`;
}

// ============================================================================
// MAIN BOT SETUP
// ============================================================================

async function startBot() {
  // Load secrets first
  await loadSecrets();

  const BOT_TOKEN = process.env.AGENT_TELEGRAM_BOT;
  const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID || '0');
  const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

  if (!BOT_TOKEN) {
    console.error('❌ AGENT_TELEGRAM_BOT not set in Infisical');
    console.log('ℹ️  Add AGENT_TELEGRAM_BOT to Infisical:');
    console.log('   Dashboard → 999-agents-telegraf → dev');
    console.log('   Secret: AGENT_TELEGRAM_BOT = <your-bot-token>');
    process.exit(1);
  }

  if (!MINIMAX_API_KEY) {
    console.warn('⚠️  MINIMAX_API_KEY not set - AI features disabled');
  }

  console.log(`🤖 Starting bot...`);
  console.log(`🔑 Admin ID: ${ADMIN_ID || 'Not set (will allow first user)'}`);
  console.log(`🧠 MiniMax AI: ${MINIMAX_API_KEY ? 'Enabled' : 'Disabled'}`);

  const bot = new Telegraf(BOT_TOKEN);
  const anthropic = MINIMAX_API_KEY ? new Anthropic({
    apiKey: MINIMAX_API_KEY,
    baseURL: 'https://api.minimax.io/anthropic'
  }) : null;

  console.log('✅ Conversation history initialized');

  // ============================================================================
  // AUTHORIZATION MIDDLEWARE
  // ============================================================================

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!ADMIN_ID) {
      console.log(`ℹ️  First user ${userId} will be allowed as admin`);
      console.log(`ℹ️  Add to Infisical: ADMIN_TELEGRAM_ID=${userId}`);
      return next();
    }

    if (userId !== ADMIN_ID) {
      await ctx.reply('❌ Unauthorized. This bot is for admin use only.');
      return;
    }

    return next();
  });

  // ============================================================================
  // SETUP BOT COMMANDS MENU
  // ============================================================================

  await bot.telegram.setMyCommands([
    { command: 'start', description: '🏠 Главное меню' },
    { command: 'status', description: '📊 Статус системы' },
    { command: 'logs', description: '📋 Просмотр логов' },
    { command: 'errors', description: '🚨 Последние ошибки' },
    { command: 'metrics', description: '📈 Метрики сервера' },
    { command: 'snapshots', description: '💾 Снапшоты' },
    { command: 'restart', description: '🔄 Перезапустить контейнер' },
    { command: 'clear', description: '🧹 Очистить историю разговора' },
    { command: 'help', description: '❓ Помощь' },
  ]);

  console.log('✅ Bot menu configured');

  // ============================================================================
  // COMMANDS
  // ============================================================================

  // /start
  bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Статус', 'cmd_status'),
        Markup.button.callback('📋 Логи', 'cmd_logs'),
      ],
      [
        Markup.button.callback('🚨 Ошибки', 'cmd_errors'),
        Markup.button.callback('📈 Метрики', 'cmd_metrics'),
      ],
      [
        Markup.button.callback('💾 Снапшоты', 'cmd_snapshots'),
        Markup.button.callback('🔄 Рестарт', 'cmd_restart'),
      ],
      [
        Markup.button.callback('❓ Помощь', 'cmd_help'),
      ],
    ]);

    await ctx.reply(
      `🤖 *Autonomous Monitor Admin Bot*\n\n` +
      `Добро пожаловать в панель управления production сервером!\n\n` +
      `*Сервер:* \`${CONFIG.host}\`\n` +
      `*Контейнер:* \`${CONFIG.container}\`\n\n` +
      `Выбери действие из меню:`,
      { parse_mode: 'Markdown', ...keyboard }
    );
  });

  // /status
  bot.command('status', async (ctx) => {
    await ctx.reply('🔄 Получаю статус...');

    try {
      const [status, stats] = await Promise.all([
        getContainerStatus(),
        getContainerStats(),
      ]);

      const isRunning = status.includes('Up');
      const statusEmoji = isRunning ? '🟢' : '🔴';

      await ctx.reply(
        `${statusEmoji} *Production Status*\n\n` +
        `*Container:* \`${CONFIG.container}\`\n` +
        `*Status:* ${status}\n\n` +
        `*📊 Resources:*\n\n` +
        `CPU Usage:\n${createProgressBar(stats.cpu)}\n\n` +
        `Memory Usage:\n${createProgressBar(stats.memory)}\n\n` +
        `*Memory:* ${stats.memUsage}\n` +
        `*Network:* ${stats.netIO}\n\n` +
        `*Обновлено:* ${new Date().toLocaleString('ru-RU')}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Обновить', 'refresh_status')],
            [Markup.button.callback('📋 Логи', 'cmd_logs')],
          ])
        }
      );
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  // /logs
  bot.command('logs', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📄 50', 'logs_50'),
        Markup.button.callback('📄 100', 'logs_100'),
      ],
      [
        Markup.button.callback('📄 200', 'logs_200'),
        Markup.button.callback('📄 500', 'logs_500'),
      ],
      [Markup.button.callback('🔍 Только ошибки', 'logs_errors')],
    ]);

    await ctx.reply('📋 Выбери количество строк:', keyboard);
  });

  // /errors
  bot.command('errors', async (ctx) => {
    await ctx.reply('🔍 Ищу ошибки в логах...');

    try {
      const logs = await getDockerLogs(200);

      const errorPatterns = [
        { pattern: /Error: Cannot find module|MODULE_NOT_FOUND/g, type: 'MODULE_NOT_FOUND', emoji: '🔴' },
        { pattern: /TypeError:/g, type: 'TYPE_ERROR', emoji: '🟠' },
        { pattern: /ReferenceError:/g, type: 'REFERENCE_ERROR', emoji: '🟠' },
        { pattern: /SyntaxError:/g, type: 'SYNTAX_ERROR', emoji: '🔴' },
        { pattern: /Error:/g, type: 'GENERIC_ERROR', emoji: '⚠️' },
      ];

      const foundErrors = [];

      for (const { pattern, type, emoji } of errorPatterns) {
        const matches = logs.match(pattern);
        if (matches) {
          const lines = logs.split('\n').filter(line => pattern.test(line));
          foundErrors.push({ type, emoji, count: lines.length, sample: lines[0] });
        }
      }

      if (foundErrors.length === 0) {
        await ctx.reply('✅ Ошибок не обнаружено!');
        return;
      }

      let message = `🚨 *Обнаружено ошибок: ${foundErrors.length} типов*\n\n`;

      foundErrors.forEach(({ type, emoji, count, sample }) => {
        message += `${emoji} *${type}*\n`;
        message += `Найдено: ${count} вхождений\n`;
        message += `Пример: \`${sample.substring(0, 100)}...\`\n\n`;
      });

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  // /metrics
  bot.command('metrics', async (ctx) => {
    await ctx.reply('📊 Собираю метрики...');

    try {
      const stats = await getContainerStats();

      await ctx.reply(
        `📊 *Server Metrics*\n\n` +
        `*CPU Usage:*\n${createProgressBar(stats.cpu)}\n\n` +
        `*Memory Usage:*\n${createProgressBar(stats.memory)}\n\n` +
        `*Memory:* ${stats.memUsage}\n` +
        `*Network I/O:* ${stats.netIO}\n\n` +
        `*Время:* ${new Date().toLocaleString('ru-RU')}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Обновить', 'refresh_metrics')],
          ])
        }
      );
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  // /restart
  bot.command('restart', async (ctx) => {
    await ctx.reply(
      `⚠️ *Подтверждение перезапуска*\n\n` +
      `Контейнер: \`${CONFIG.container}\`\n` +
      `Сервер: \`${CONFIG.host}\`\n\n` +
      `Это приведет к downtime ~10-20 секунд.\n\n` +
      `*Вы уверены?*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Да', 'confirm_restart'),
            Markup.button.callback('❌ Нет', 'cancel'),
          ],
        ])
      }
    );
  });

  // /snapshots
  bot.command('snapshots', async (ctx) => {
    await ctx.reply('💾 Загружаю список снапшотов...');

    try {
      const snapshots = await listSnapshots();

      if (snapshots.length === 0) {
        await ctx.reply('📭 Снапшоты не найдены');
        return;
      }

      let message = `💾 *Доступные снапшоты* (${snapshots.length})\n\n`;
      message += `Выберите снапшот для восстановления:\n\n`;

      const buttons = [];
      snapshots.forEach((snap, idx) => {
        const label = snap.version === 'prod' ? snap.type : `v${snap.version} ${snap.type}`;
        message += `${idx + 1}\\. *${label}*\n`;
        message += `   📅 ${snap.date}\n`;
        message += `   📦 ${snap.size}\n\n`;

        buttons.push([
          Markup.button.callback(
            `📥 ${idx + 1}. ${snap.date}`,
            `restore_${snap.filename}`
          )
        ]);
      });

      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `❓ *Помощь*\n\n` +
      `*Команды:*\n` +
      `/status - Статус системы\n` +
      `/logs - Просмотр логов\n` +
      `/errors - Поиск ошибок\n` +
      `/metrics - Метрики\n` +
      `/snapshots - Управление снапшотами\n` +
      `/restart - Перезапуск\n` +
      `/clear - Очистить историю разговора\n` +
      `/help - Эта справка\n\n` +
      `🧠 *AI Помощник${anthropic ? ' (включен)' : ' (отключен)'}*\n` +
      `Просто пиши мне что угодно - я понимаю обычные фразы!\n\n` +
      `*Примеры:*\n` +
      `• "привет"\n` +
      `• "что с сервером?"\n` +
      `• "покажи последние ошибки"\n` +
      `• "какие есть снапшоты?"`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================================
  // CALLBACK HANDLERS
  // ============================================================================

  // Command shortcuts
  // Helper function to handle status
  async function sendStatus(ctx) {
    try {
      const status = await getContainerStatus();
      const stats = await getContainerStats();

      const message = `📊 *Status Report*\n\n` +
        `🐳 Container: ${CONFIG.container}\n` +
        `🖥️  Server: ${CONFIG.host}\n` +
        `📍 Status: \`${status.trim()}\`\n\n` +
        `*Resource Usage:*\n` +
        `${createProgressBar(stats.cpu)} CPU\n` +
        `${createProgressBar(stats.memory)} Memory (${stats.memUsage})\n` +
        `📊 Network: ${stats.netIO}`;

      await ctx.replyWithMarkdown(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Обновить', callback_data: 'refresh_status' }],
            [{ text: '📝 Логи', callback_data: 'cmd_logs' }, { text: '📊 Метрики', callback_data: 'cmd_metrics' }]
          ]
        }
      });
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  }

  // Helper function to handle metrics
  async function sendMetrics(ctx) {
    try {
      const stats = await getContainerStats();
      const message = `📊 *Detailed Metrics*\n\n` +
        `*CPU:*\n${createProgressBar(stats.cpu)}\n` +
        `*Memory:*\n${createProgressBar(stats.memory)}\n` +
        `Usage: ${stats.memUsage}\n` +
        `*Network:*\n📊 ${stats.netIO}`;

      await ctx.replyWithMarkdown(message, {
        reply_markup: {
          inline_keyboard: [[{ text: '🔄 Обновить', callback_data: 'refresh_metrics' }]]
        }
      });
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  }

  bot.action('cmd_status', async (ctx) => {
    await ctx.answerCbQuery();
    await sendStatus(ctx);
  });

  bot.action('cmd_logs', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 *Логи*\n\nВыберите количество строк:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '50 строк', callback_data: 'logs_50' }, { text: '100 строк', callback_data: 'logs_100' }],
          [{ text: '200 строк', callback_data: 'logs_200' }, { text: '500 строк', callback_data: 'logs_500' }],
          [{ text: '🚨 Только ошибки', callback_data: 'logs_errors' }]
        ]
      }
    });
  });

  bot.action('cmd_errors', async (ctx) => {
    await ctx.answerCbQuery('🔍 Фильтрую...');
    try {
      const logs = await getDockerLogs(500);
      const errorLines = logs.split('\n').filter(line => /error|Error|ERROR/i.test(line));

      if (errorLines.length === 0) {
        await ctx.reply('✅ Ошибок не найдено!');
        return;
      }

      const preview = errorLines.slice(0, 15).join('\n');
      await ctx.reply(
        `🚨 *Найдено: ${errorLines.length} строк с ошибками*\n\n` +
        `Последние 15:\n\`\`\`\n${preview}\n\`\`\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  bot.action('cmd_metrics', async (ctx) => {
    await ctx.answerCbQuery();
    await sendMetrics(ctx);
  });

  bot.action('cmd_snapshots', async (ctx) => {
    await ctx.answerCbQuery('💾 Загружаю...');

    try {
      const snapshots = await listSnapshots();

      if (snapshots.length === 0) {
        await ctx.reply('📭 Снапшоты не найдены');
        return;
      }

      let message = `💾 *Доступные снапшоты* (${snapshots.length})\n\n`;
      message += `Выберите снапшот для восстановления:\n\n`;

      const buttons = [];
      snapshots.forEach((snap, idx) => {
        const label = snap.version === 'prod' ? snap.type : `v${snap.version} ${snap.type}`;
        message += `${idx + 1}\\. *${label}*\n`;
        message += `   📅 ${snap.date}\n`;
        message += `   📦 ${snap.size}\n\n`;

        buttons.push([
          Markup.button.callback(
            `📥 ${idx + 1}. ${snap.date}`,
            `restore_${snap.filename}`
          )
        ]);
      });

      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  bot.action('cmd_restart', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('⚠️ *Подтвердите перезапуск*\n\nЭто перезапустит контейнер с ботами.', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Подтвердить', callback_data: 'confirm_restart' }],
          [{ text: '❌ Отмена', callback_data: 'cancel' }]
        ]
      }
    });
  });

  bot.action('cmd_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      '📚 *Autonomous Monitor Bot*\n\n' +
      '*Доступные команды:*\n' +
      '/start - Главное меню\n' +
      '/status - Статус системы\n' +
      '/logs - Логи контейнера\n' +
      '/errors - Поиск ошибок\n' +
      '/metrics - Метрики производительности\n' +
      '/restart - Перезапуск контейнера\n' +
      '/help - Эта справка',
      { parse_mode: 'Markdown' }
    );
  });

  // Refresh
  bot.action('refresh_status', async (ctx) => {
    await ctx.answerCbQuery('🔄 Обновляю...');
    await sendStatus(ctx);
  });

  bot.action('refresh_metrics', async (ctx) => {
    await ctx.answerCbQuery('🔄 Обновляю...');
    await sendMetrics(ctx);
  });

  // Logs
  bot.action(/^logs_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('📥 Получаю...');

    const lines = parseInt(ctx.match[1]);

    try {
      let logs = await getDockerLogs(lines);

      // Split if too long
      const maxLength = 4000;
      if (logs.length > maxLength) {
        const chunk = logs.substring(logs.length - maxLength);
        await ctx.reply(`\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`\`\`\`\n${logs}\n\`\`\``, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  bot.action('logs_errors', async (ctx) => {
    await ctx.answerCbQuery('🔍 Фильтрую...');

    try {
      const logs = await getDockerLogs(500);
      const errorLines = logs.split('\n').filter(line =>
        /error|Error|ERROR/i.test(line)
      );

      if (errorLines.length === 0) {
        await ctx.reply('✅ Ошибок не найдено!');
        return;
      }

      const preview = errorLines.slice(0, 15).join('\n');
      await ctx.reply(
        `🚨 *Найдено: ${errorLines.length} строк с ошибками*\n\n` +
        `Последние 15:\n\`\`\`\n${preview}\n\`\`\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  // Restart
  bot.action('confirm_restart', async (ctx) => {
    await ctx.answerCbQuery('🔄 Перезапускаю...');
    await ctx.reply('🔄 Начинаю перезапуск...');

    try {
      await execAsync(`docker restart ${CONFIG.container}`);
      await ctx.reply('✅ Контейнер перезапущен!');

      setTimeout(async () => {
        const status = await getContainerStatus();
        await ctx.reply(`📊 Статус: \`${status}\``, { parse_mode: 'Markdown' });
      }, 5000);
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery('❌ Отменено');
    await ctx.reply('Действие отменено');
  });

  // Restore snapshot
  bot.action(/^restore_(.+)$/, async (ctx) => {
    const filename = ctx.match[1];

    await ctx.answerCbQuery();
    await ctx.reply(
      `⚠️ *Подтвердите восстановление*\n\n` +
      `Снапшот: \`${filename}\`\n\n` +
      `*Это действие:*\n` +
      `• Остановит контейнер\n` +
      `• Создаст backup текущего состояния\n` +
      `• Восстановит выбранный снапшот\n` +
      `• Перезапустит контейнер\n\n` +
      `Downtime: ~30-60 секунд\n\n` +
      `*Вы уверены?*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Да, восстановить', `confirm_restore_${filename}`),
          ],
          [
            Markup.button.callback('❌ Отмена', 'cancel'),
          ],
        ])
      }
    );
  });

  bot.action(/^confirm_restore_(.+)$/, async (ctx) => {
    const filename = ctx.match[1];

    await ctx.answerCbQuery('🔄 Восстанавливаю...');
    await ctx.reply('🔄 Начинаю восстановление из снапшота...');

    try {
      await ctx.reply('⏸️ Останавливаю контейнер...');
      const backupName = await restoreSnapshot(filename);

      await ctx.reply(
        `✅ *Снапшот восстановлен!*\n\n` +
        `Восстановлен: \`${filename}\`\n` +
        `Backup создан: \`${backupName}\`\n\n` +
        `Контейнер перезапущен.`,
        { parse_mode: 'Markdown' }
      );

      setTimeout(async () => {
        const status = await getContainerStatus();
        await ctx.reply(`📊 Статус: \`${status}\``, { parse_mode: 'Markdown' });
      }, 5000);
    } catch (error) {
      await ctx.reply(`❌ Ошибка восстановления: ${error.message}`);
    }
  });

  // ============================================================================
  // CLAUDE AI INTEGRATION
  // ============================================================================

  async function chatWithClaude(userId, userMessage) {
    if (!anthropic) {
      return "🤖 AI функции отключены. Используй /help для списка команд.";
    }

    try {
      // Save user message
      saveMessage(userId, 'user', userMessage);

      // Get conversation history
      const history = getConversationHistory(userId);

      // System prompt
      const systemPrompt = `Ты - умный помощник администратора production сервера.

**Твоя роль:**
- Помогать администратору управлять сервером через Telegram
- Отвечать на вопросы о состоянии сервера
- Выполнять команды когда это необходимо

**Доступные инструменты:**
- get_server_status: Получить статус контейнера и метрики (CPU, память, сеть)
- get_logs: Получить логи контейнера (можно указать количество строк)
- get_errors: Найти ошибки в логах
- list_snapshots: Показать доступные снапшоты для восстановления

**Контекст:**
- Сервер: ${CONFIG.host}
- Контейнер: ${CONFIG.container}
- Админ Telegram ID: ${userId}

**Стиль общения:**
- Дружелюбный, но профессиональный
- Краткие, четкие ответы
- Используй эмодзи для наглядности
- Всегда объясняй что делаешь

**Важно:**
- Если пользователь просит выполнить действие, используй нужный инструмент
- Не придумывай данные - используй только реальную информацию из инструментов
- Если не уверен, спроси уточняющий вопрос`;

      // Tools definition
      const tools = [
        {
          name: "get_server_status",
          description: "Получить текущий статус сервера: состояние контейнера, использование CPU, памяти и сети",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "get_logs",
          description: "Получить логи Docker контейнера",
          input_schema: {
            type: "object",
            properties: {
              lines: {
                type: "number",
                description: "Количество строк логов (по умолчанию 50)",
                default: 50
              }
            }
          }
        },
        {
          name: "get_errors",
          description: "Найти ошибки в логах контейнера",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "list_snapshots",
          description: "Показать список доступных снапшотов для восстановления",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ];

      // Call MiniMax API (Anthropic-compatible)
      const response = await anthropic.messages.create({
        model: "MiniMax-M2",
        max_tokens: 2048,
        system: systemPrompt,
        messages: history.map(msg => ({ role: msg.role, content: msg.content })),
        tools: tools
      });

      // Process tool calls
      if (response.stop_reason === 'tool_use') {
        const toolResults = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            let result;

            switch (block.name) {
              case 'get_server_status':
                const status = await getContainerStatus();
                const stats = await getContainerStats();
                result = {
                  status: status,
                  cpu: stats.cpu,
                  memory: stats.memory,
                  memUsage: stats.memUsage,
                  netIO: stats.netIO
                };
                break;

              case 'get_logs':
                const lines = block.input.lines || 50;
                const logs = await getDockerLogs(lines);
                result = { logs };
                break;

              case 'get_errors':
                const allLogs = await getDockerLogs(200);
                const errorLines = allLogs.split('\n').filter(line =>
                  /error|Error|ERROR/i.test(line)
                );
                result = { errors: errorLines };
                break;

              case 'list_snapshots':
                const snapshots = await listSnapshots();
                result = { snapshots };
                break;

              default:
                result = { error: "Unknown tool" };
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }
        }

        // Get final response after tool use
        const finalResponse = await anthropic.messages.create({
          model: "MiniMax-M2",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults }
          ]
        });

        const assistantMessage = finalResponse.content[0].text;
        saveMessage(userId, 'assistant', assistantMessage);
        return assistantMessage;
      }

      // Regular response without tools
      const assistantMessage = response.content[0].text;
      saveMessage(userId, 'assistant', assistantMessage);
      return assistantMessage;

    } catch (error) {
      console.error('Claude API error:', error);
      return `❌ Ошибка AI: ${error.message}\n\nИспользуй /help для списка команд.`;
    }
  }

  // ============================================================================
  // NATURAL LANGUAGE
  // ============================================================================

  // /clear - очистить историю разговора
  bot.command('clear', async (ctx) => {
    clearConversation(ctx.from.id);
    await ctx.reply('🧹 История разговора очищена');
  });

  bot.on('text', async (ctx) => {
    // Skip if it's a command
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.from.id;
    const userMessage = ctx.message.text;

    // Show typing indicator
    await ctx.sendChatAction('typing');

    try {
      const response = await chatWithClaude(userId, userMessage);
      await ctx.reply(response);
    } catch (error) {
      console.error('Error in text handler:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуй еще раз или используй /help');
    }
  });

  // ============================================================================
  // START BOT
  // ============================================================================

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  const botInfo = await bot.telegram.getMe();

  console.log('✅ Bot is running!');
  console.log(`📱 Bot: @${botInfo.username}`);
  console.log(`🖥️  Server: ${CONFIG.host}`);
  console.log(`🐳 Container: ${CONFIG.container}`);
  console.log('\n💬 Send /start to begin!\n');

  await bot.launch();
}

// Start the bot
startBot().catch((error) => {
  console.error('❌ Bot error:', error);
  process.exit(1);
});

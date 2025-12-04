#!/usr/bin/env node
/**
 * Выполняет очистку базы данных через PostgreSQL
 */

const { Client } = require('pg');
const fs = require('fs');

// ВАЖНО: Используем переменные окружения
const connectionString = process.env.DATABASE_URL || 
  `postgresql://postgres:${process.env.DB_PASSWORD}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`;

async function runCommand(query, description) {
  try {
    const client = new Client({
      connectionString: connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    await client.connect();
    console.log(`\n🔄 ${description}`);
    console.log(`   SQL: ${query.substring(0, 80)}...`);

    const result = await client.query(query);
    console.log(`✅ Выполнено: ${description}`);
    
    await client.end();
    return result;
  } catch (error) {
    console.error(`❌ Ошибка в команде "${description}":`, error.message);
    throw error;
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧹 ОЧИСТКА БАЗЫ ДАННЫХ');
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Backup
    await runCommand(
      'CREATE TABLE payments_v2_backup AS SELECT * FROM payments_v2;',
      'Создание backup таблицы'
    );

    // 2. Проверка backup
    await runCommand(
      'SELECT COUNT(*) as backup_count FROM payments_v2_backup;',
      'Проверка backup'
    );

    // 3. Создать business_expenses
    await runCommand(`
      CREATE TABLE IF NOT EXISTS business_expenses (
        id BIGSERIAL PRIMARY KEY,
        bot_name TEXT NOT NULL,
        amount DECIMAL NOT NULL,
        currency TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, 'Создание таблицы business_expenses');

    // 4. Перенос больших расходов
    await runCommand(`
      INSERT INTO business_expenses (bot_name, amount, currency, category, description, created_at)
      SELECT
        bot_name, amount, currency,
        CASE
          WHEN description ILIKE '%тренировк%' OR description ILIKE '%модел%' OR description ILIKE '%NEURO_TRAIN%' THEN 'AI_TRAINING'
          WHEN description ILIKE '%реклам%' OR description ILIKE '%advertising%' THEN 'ADVERTISING'
          WHEN description ILIKE '%хостинг%' OR description ILIKE '%VPS%' OR description ILIKE '%сервер%' THEN 'HOSTING'
          WHEN description ILIKE '%API%' OR description ILIKE '%токен%' THEN 'API_TOKENS'
          WHEN description ILIKE '%аналитик%' OR description ILIKE '%analytics%' THEN 'ANALYTICS'
          ELSE 'OTHER'
        END as category,
        description, created_at
      FROM payments_v2
      WHERE type = 'MONEY_OUTCOME'
        AND currency = 'STARS'
        AND ABS(amount) > 1000;
    `, 'Перенос больших расходов');

    // 5. Удаление перенесенных
    await runCommand(`
      DELETE FROM payments_v2
      WHERE type = 'MONEY_OUTCOME'
        AND currency = 'STARS'
        AND ABS(amount) > 1000;
    `, 'Удаление перенесенных записей');

    // 6. Добавление is_test
    await runCommand(`
      ALTER TABLE payments_v2 ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
    `, 'Добавление колонки is_test');

    // 7. Пометка тестовых
    await runCommand(`
      UPDATE payments_v2
      SET is_test = TRUE
      WHERE description ILIKE '%TEST_DATA%'
         OR description ILIKE '%test%'
         OR description = 'SUBSCRIPTION_PURCHASE'
         OR description = 'AI_VIDEO_GENERATION';
    `, 'Пометка тестовых данных');

    // 8. Удаление нулевых
    await runCommand(
      'DELETE FROM payments_v2 WHERE amount = 0;',
      'Удаление нулевых сумм'
    );

    // 9. Удаление дубликатов
    await runCommand(`
      DELETE FROM payments_v2 p1
      USING payments_v2 p2
      WHERE p1.ctid < p2.ctid
        AND p1.bot_name = p2.bot_name
        AND p1.amount = p2.amount
        AND p1.description = p2.description
        AND DATE(p1.created_at) = DATE(p2.created_at)
        AND EXTRACT(hour FROM p1.created_at) = EXTRACT(hour FROM p2.created_at)
        AND EXTRACT(minute FROM p1.created_at) = EXTRACT(minute FROM p2.created_at)
        AND EXTRACT(second FROM p1.created_at) = EXTRACT(second FROM p2.created_at);
    `, 'Удаление дубликатов');

    console.log('\n' + '='.repeat(70));
    console.log('✅ ОЧИСТКА ЗАВЕРШЕНА УСПЕШНО!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.error('\nДля восстановления используйте:');
    console.error('  DROP TABLE IF EXISTS payments_v2;');
    console.error('  CREATE TABLE payments_v2 AS SELECT * FROM payments_v2_backup;');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

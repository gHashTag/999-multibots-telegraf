#!/usr/bin/env node

/**
 * 🔍 Скрипт для проверки наличия таблиц Instagram парсинга в базе данных
 */

const { Pool } = require('pg')
require('dotenv').config()

async function checkDatabaseTables() {
  console.log('🔍 Проверяем таблицы Instagram парсинга в базе данных...\n')

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  try {
    // Получаем список всех таблиц
    const allTablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `)

    console.log('📋 Все таблицы в базе данных:')
    allTablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`)
    })

    console.log('\n🔍 Instagram-связанные таблицы:')
    
    // Проверяем каждую нужную таблицу
    const requiredTables = [
      'instagram_similar_users',
      'instagram_user_reels', 
      'competitor_subscriptions',
      'projects',
      'users'
    ]

    const existingTables = allTablesResult.rows.map(row => row.table_name)
    
    for (const table of requiredTables) {
      const exists = existingTables.includes(table)
      console.log(`  ${exists ? '✅' : '❌'} ${table}`)
      
      if (exists) {
        // Получаем информацию о колонках
        const columnsResult = await pool.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position;
        `, [table])

        if (table.includes('instagram') || table === 'competitor_subscriptions') {
          console.log(`    Колонки таблицы ${table}:`)
          columnsResult.rows.forEach(col => {
            console.log(`      - ${col.column_name} (${col.data_type})`)
          })
        }

        // Получаем количество записей
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`)
        console.log(`    📊 Записей в таблице: ${countResult.rows[0].count}`)
      }
    }

    // Проверяем конкретно проекты
    if (existingTables.includes('projects')) {
      console.log('\n📁 Проекты в базе данных:')
      const projectsResult = await pool.query(`
        SELECT id, name, industry, user_id
        FROM projects 
        ORDER BY name ASC
        LIMIT 10;
      `)

      if (projectsResult.rows.length === 0) {
        console.log('  ⚠️  Нет проектов в базе данных!')
      } else {
        projectsResult.rows.forEach(project => {
          console.log(`  - ID: ${project.id}, Name: "${project.name}", Industry: ${project.industry}`)
        })
      }
    }

    // Проверяем пользователей
    if (existingTables.includes('users')) {
      console.log('\n👤 Пользователи в базе данных:')
      const usersResult = await pool.query(`
        SELECT user_id, telegram_id, first_name 
        FROM users 
        ORDER BY user_id DESC
        LIMIT 5;
      `)

      if (usersResult.rows.length === 0) {
        console.log('  ⚠️  Нет пользователей в базе данных!')
      } else {
        usersResult.rows.forEach(user => {
          console.log(`  - User ID: ${user.user_id}, Telegram: ${user.telegram_id}, Name: ${user.first_name}`)
        })
      }
    }

  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }

  console.log('\n✅ Проверка завершена!')
}

// Запуск
checkDatabaseTables()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Скрипт упал:', error.message)
    process.exit(1)
  })
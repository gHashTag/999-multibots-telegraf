#!/usr/bin/env node

const { Pool } = require('pg')
require('dotenv').config()

async function checkUsersTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log('👤 Проверяем структуру таблицы users...\n')

    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `)

    console.log('📋 Структура таблицы users:')
    columnsResult.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`)
    })

    const usersData = await pool.query('SELECT * FROM users LIMIT 3')
    console.log('\n👤 Примеры пользователей:')
    usersData.rows.forEach(user => {
      console.log(`  - ID: ${user.id}, Telegram: ${user.telegram_id}, Name: ${user.first_name}`)
    })

    // Проверим связь с проектами
    const projectsData = await pool.query(`
      SELECT p.id, p.name, u.telegram_id, u.first_name
      FROM projects p 
      LEFT JOIN users u ON p.user_id = u.id
      LIMIT 5
    `)

    console.log('\n📁 Связь проектов с пользователями:')
    projectsData.rows.forEach(row => {
      console.log(`  - Проект "${row.name}" (ID: ${row.id}) → User: ${row.telegram_id} (${row.first_name})`)
    })

  } catch (error) {
    console.error('❌ Ошибка:', error.message)
  } finally {
    await pool.end()
  }
}

checkUsersTable()
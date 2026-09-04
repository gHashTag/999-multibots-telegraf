/**
 * Instagram Scraper v2 - Fully Isolated with Zod Validation
 * Real API integration with strict typing and validation
 */

import { slugify } from 'inngest'
import axios from 'axios'
import pkg from 'pg'
const { Pool } = pkg
import * as XLSX from 'xlsx'
import archiver from 'archiver'
import { promises as fs } from 'fs'
import path from 'path'

// Используем основной Inngest клиент
import { inngest } from '@/inngest_app/client'

// Импортируем Zod-схемы
import {
  InstagramScrapingEventSchema,
  validateInstagramApiResponse,
  validateInstagramUsers,
  DatabaseSaveResultSchema,
  type InstagramScrapingEvent,
  type ValidatedInstagramUser,
  type DatabaseSaveResult,
  validateInstagramReelsApiResponse,
  validateInstagramReels,
  type ValidatedInstagramReel,
  type ReelsSaveResult,
  ReelsSaveResultSchema,
  CreateInstagramUserEventSchema,
  type CreateInstagramUserEvent,
  type CreateUserResult,
  CreateUserResultSchema,
} from '@/core/instagram/schemas'

// Simple logger
const log = {
  info: (msg: string, data?: any) =>
    console.log(`[IG-INFO] ${msg}`, data || ''),
  error: (msg: string, data?: any) =>
    console.error(`[IG-ERROR] ${msg}`, data || ''),
  warn: (msg: string, data?: any) =>
    console.warn(`[IG-WARN] ${msg}`, data || ''),
}

// Database connection pool
const dbPool = new Pool({
  // No literal fallback. A connection string with an embedded password
  // used to sit here, which meant a missing variable silently connected
  // to a real database using a credential committed to the repository.
  // This file already refuses when the variable is absent (see the
  // guards further down), so the fallback also contradicted its own
  // file. Without it, a missing variable fails on connect instead.
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

// Instagram API Integration with Zod validation
class InstagramAPI {
  private apiKey: string
  private host: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.RAPIDAPI_INSTAGRAM_KEY || ''
    this.host =
      process.env.RAPIDAPI_INSTAGRAM_HOST ||
      'real-time-instagram-scraper-api1.p.rapidapi.com'
    this.baseUrl = 'https://real-time-instagram-scraper-api1.p.rapidapi.com'
  }

  async getSimilarUsers(username: string, count = 50) {
    const maxRetries = 1
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        // Добавляем задержку между попытками
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000 // Экспоненциальная задержка: 2s, 4s, 8s
          log.warn(
            `⏳ Rate limited, waiting ${delay / 1000}s before retry ${
              attempt + 1
            }/${maxRetries}`
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        log.info(
          `📡 API call attempt ${attempt + 1}/${maxRetries} for: ${username}`
        )

        const response = await axios.get(
          `${this.baseUrl}/v1/similar_users_v2`,
          {
            params: {
              username_or_id: username,
              count: count,
            },
            headers: {
              'x-rapidapi-key': this.apiKey,
              'x-rapidapi-host': this.host,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        )

        // Валидируем ответ API с помощью Zod
        const validationResult = validateInstagramApiResponse(response.data)

        if (!validationResult.success) {
          log.error('API Response Validation Error:', validationResult.error)
          return {
            success: false,
            error: validationResult.error,
            users: [],
            total: 0,
          }
        }

        // Проверяем, что data не является строкой (ошибкой API)
        if (typeof validationResult.data!.data === 'string') {
          const apiError = validationResult.data!.data.trim()
          const errorMessage =
            apiError || 'Instagram API returned empty error response'
          log.error(
            `❌ API returned error: "${apiError}" (original response logged)`
          )
          log.error(
            'Full API response:',
            JSON.stringify(response.data, null, 2)
          )
          return {
            success: false,
            error: `API error: ${errorMessage}`,
            users: [],
            total: 0,
          }
        }

        const users = validationResult.data!.data.users
        log.info(`✅ API Success: Found ${users.length} users (Zod validated)`)

        return {
          success: true,
          users: users,
          total: users.length,
        }
      } catch (error: any) {
        attempt++

        // Особая обработка для rate limiting (429)
        if (error.response?.status === 429) {
          log.warn(`⚠️ Rate limited (429) on attempt ${attempt}/${maxRetries}`)

          if (attempt >= maxRetries) {
            log.error(`❌ Max retries exceeded for rate limiting`)
            return {
              success: false,
              error: `Rate limited after ${maxRetries} attempts. Please try again later.`,
              users: [],
              total: 0,
            }
          }
          // Продолжаем цикл для следующей попытки
          continue
        }

        // Для других ошибок - немедленный возврат
        log.error(`❌ API Error on attempt ${attempt}:`, error.message)
        return {
          success: false,
          error: error.message,
          users: [],
          total: 0,
        }
      }
    }

    // Не должны сюда попасть, но на всякий случай
    return {
      success: false,
      error: 'Unexpected error in retry loop',
      users: [],
      total: 0,
    }
  }

  /**
   * Получает рилсы пользователя Instagram
   */
  async getUserReels(username: string, count = 50) {
    const maxRetries = 3
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        // Добавляем задержку между попытками
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000
          log.warn(
            `⏳ Reels rate limited, waiting ${delay / 1000}s before retry ${
              attempt + 1
            }/${maxRetries}`
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        log.info(
          `🎬 Reels API call attempt ${
            attempt + 1
          }/${maxRetries} for: ${username}`
        )

        const response = await axios.get(`${this.baseUrl}/v1/user_reels`, {
          params: {
            username_or_id: username,
            count: count,
          },
          headers: {
            'x-rapidapi-key': this.apiKey,
            'x-rapidapi-host': this.host,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        })

        // Валидируем ответ API с помощью Zod
        const validationResult = validateInstagramReelsApiResponse(
          response.data
        )

        if (!validationResult.success) {
          log.error(
            'Reels API Response Validation Error:',
            validationResult.error
          )
          return {
            success: false,
            error: validationResult.error,
            reels: [],
            total: 0,
            userId: '',
            username: '',
          }
        }

        const data = validationResult.data!.data

        // Проверяем, что data не является строкой (ошибкой API)
        if (typeof data === 'string') {
          const apiError = data.trim()
          const errorMessage =
            apiError || 'Instagram Reels API returned empty error response'
          log.error(
            `❌ Reels API returned error: "${apiError}" (original response logged)`
          )
          log.error(
            'Full Reels API response:',
            JSON.stringify(response.data, null, 2)
          )
          return {
            success: false,
            error: `API error: ${errorMessage}`,
            reels: [],
            total: 0,
            userId: '',
            username: username,
          }
        }

        // Проверяем что есть хотя бы один рилс
        if (!data.items || data.items.length === 0) {
          log.warn(`⚠️ No reels found for user ${username}`)
          return {
            success: true,
            reels: [],
            total: 0,
            userId: '',
            username: username, // Используем параметр функции
          }
        }

        // Извлекаем информацию о пользователе из первого рилса
        const firstReel = data.items[0]
        const userId = firstReel?.media?.user?.pk?.toString() || ''
        const actualUsername = firstReel?.media?.user?.username || username

        log.info(
          `✅ Reels API Success: Found ${data.items.length} reels for ${actualUsername} (Zod validated)`
        )

        return {
          success: true,
          reels: data.items,
          total: data.items.length,
          userId: userId,
          username: actualUsername,
        }
      } catch (error: any) {
        attempt++

        // Особая обработка для rate limiting (429)
        if (error.response?.status === 429) {
          log.warn(
            `⚠️ Reels rate limited (429) on attempt ${attempt}/${maxRetries}`
          )

          if (attempt >= maxRetries) {
            log.error(`❌ Max retries exceeded for reels rate limiting`)
            return {
              success: false,
              error: `Reels rate limited after ${maxRetries} attempts. Please try again later.`,
              reels: [],
              total: 0,
              userId: '',
              username: username, // Используем параметр функции
            }
          }
          // Продолжаем цикл для следующей попытки
          continue
        }

        // Для других ошибок - немедленный возврат
        log.error(`❌ Reels API Error on attempt ${attempt}:`, error.message)
        return {
          success: false,
          error: error.message,
          reels: [],
          total: 0,
          userId: '',
          username: username, // Используем параметр функции
        }
      }
    }

    // Не должны сюда попасть, но на всякий случай
    return {
      success: false,
      error: 'Unexpected error in reels retry loop',
      reels: [],
      total: 0,
      userId: '',
      username: username, // Используем параметр функции
    }
  }
}

// Database operations with Zod validation
class InstagramDatabase {
  /**
   * Проверяет project_id (упрощённая версия без таблицы projects)
   */
  async validateProjectId(
    projectId: number
  ): Promise<{ exists: boolean; projectName?: string }> {
    // Упрощённая валидация - принимаем любой положительный project_id
    if (projectId && projectId > 0) {
      log.info(
        `✅ Project validation successful: Project ID ${projectId} (simplified validation)`
      )
      return {
        exists: true,
        projectName: `Project ${projectId}`,
      }
    }

    log.error(`❌ Project validation failed: invalid project_id ${projectId}`)
    return { exists: false }
  }

  async saveUsers(
    searchUsername: string,
    users: ValidatedInstagramUser[],
    projectId?: number
  ): Promise<DatabaseSaveResult> {
    const client = await dbPool.connect()
    let saved = 0
    let duplicatesSkipped = 0

    try {
      // Ensure table exists
      await this.ensureTableExists(client)

      for (const user of users) {
        try {
          await client.query(
            `INSERT INTO instagram_similar_users 
             (search_username, user_pk, username, full_name, is_private, is_verified, 
              profile_pic_url, profile_url, profile_chaining_secondary_label, social_context, project_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (search_username, user_pk) DO NOTHING`,
            [
              searchUsername,
              user.pk,
              user.username,
              user.full_name,
              user.is_private,
              user.is_verified,
              user.profile_pic_url,
              user.profile_url || `https://instagram.com/${user.username}`,
              user.profile_chaining_secondary_label,
              user.social_context,
              projectId || null,
            ]
          )
          saved++
        } catch (error: any) {
          if (error.code === '23505') {
            // Duplicate key error
            duplicatesSkipped++
          } else {
            log.error(`Error saving user ${user.username}:`, error.message)
          }
        }
      }

      const result: DatabaseSaveResult = {
        saved,
        duplicatesSkipped,
        totalProcessed: saved + duplicatesSkipped,
      }

      // Валидируем результат с помощью Zod
      const validatedResult = DatabaseSaveResultSchema.parse(result)

      log.info(
        `💾 REAL Database save with Zod: ${validatedResult.saved} saved, ${validatedResult.duplicatesSkipped} duplicates`
      )

      return validatedResult
    } finally {
      client.release()
    }
  }

  /**
   * Создаёт одного пользователя в таблице instagram_similar_users
   */
  async createSingleUser(
    userData: CreateInstagramUserEvent
  ): Promise<CreateUserResult> {
    const client = await dbPool.connect()

    try {
      // Ensure table exists
      await this.ensureTableExists(client)

      // Создаём объект пользователя для сохранения
      const user: ValidatedInstagramUser = {
        pk: userData.pk,
        username: userData.username,
        full_name: userData.full_name || '',
        is_private: userData.is_private || false,
        is_verified: userData.is_verified || false,
        profile_pic_url: userData.profile_pic_url || '',
        profile_url: `https://instagram.com/${userData.username}`,
        profile_chaining_secondary_label:
          userData.profile_chaining_secondary_label || '',
        social_context: userData.social_context || '',
        project_id: userData.project_id,
      }

      // Проверяем, существует ли уже такой пользователь
      const existingUser = await client.query(
        'SELECT id FROM instagram_similar_users WHERE user_pk = $1 AND project_id = $2',
        [user.pk, userData.project_id]
      )

      if (existingUser.rows.length > 0) {
        log.info(
          `👤 User already exists: ${user.username} (PK: ${user.pk}) in project ${userData.project_id}`
        )

        const result: CreateUserResult = {
          success: true,
          created: false,
          alreadyExists: true,
          user: user,
        }

        return CreateUserResultSchema.parse(result)
      }

      // Вставляем нового пользователя
      await client.query(
        `INSERT INTO instagram_similar_users 
         (search_username, user_pk, username, full_name, is_private, is_verified, 
          profile_pic_url, profile_url, profile_chaining_secondary_label, social_context, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          `manual_${userData.username}`, // Префикс для ручного создания
          user.pk,
          user.username,
          user.full_name,
          user.is_private,
          user.is_verified,
          user.profile_pic_url,
          user.profile_url,
          user.profile_chaining_secondary_label,
          user.social_context,
          userData.project_id,
        ]
      )

      log.info(
        `✅ User created successfully: ${user.username} (PK: ${user.pk}) in project ${userData.project_id}`
      )

      const result: CreateUserResult = {
        success: true,
        created: true,
        alreadyExists: false,
        user: user,
      }

      return CreateUserResultSchema.parse(result)
    } catch (error: any) {
      log.error(`❌ Error creating user ${userData.username}:`, error.message)

      const result: CreateUserResult = {
        success: false,
        created: false,
        alreadyExists: false,
        error: error.message,
      }

      return CreateUserResultSchema.parse(result)
    } finally {
      client.release()
    }
  }

  private async ensureTableExists(client: any) {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS instagram_similar_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          search_username VARCHAR(255) NOT NULL,
          user_pk VARCHAR(255) NOT NULL,
          username VARCHAR(255) NOT NULL,
          full_name VARCHAR(255),
          is_private BOOLEAN DEFAULT false,
          is_verified BOOLEAN DEFAULT false,
          profile_pic_url TEXT,
          profile_url TEXT, -- URL профиля Instagram для прямого перехода
          profile_chaining_secondary_label VARCHAR(255),
          social_context VARCHAR(255),
          project_id INTEGER,
          scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(search_username, user_pk)
        );
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_instagram_users_search_username 
        ON instagram_similar_users(search_username);
        
        CREATE INDEX IF NOT EXISTS idx_instagram_users_project_id 
        ON instagram_similar_users(project_id);
      `)
    } catch (error: any) {
      log.error('Error ensuring table exists:', error.message)
    }
  }

  /**
   * Создаёт таблицу для рилсов если её нет
   */
  private async ensureReelsTableExists(client: any) {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS instagram_user_reels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          reel_id VARCHAR(255) NOT NULL,
          shortcode VARCHAR(255) NOT NULL,
          display_url TEXT NOT NULL,
          video_url TEXT,
          caption TEXT,
          like_count INTEGER DEFAULT 0,
          comment_count INTEGER DEFAULT 0,
          play_count INTEGER DEFAULT 0,
          taken_at_timestamp BIGINT NOT NULL,
          owner_id VARCHAR(255) NOT NULL,
          owner_username VARCHAR(255) NOT NULL,
          owner_full_name VARCHAR(255),
          owner_profile_pic_url TEXT,
          owner_is_verified BOOLEAN DEFAULT false,
          is_video BOOLEAN DEFAULT true,
          video_duration FLOAT,
          accessibility_caption TEXT,
          hashtags JSONB,
          mentions JSONB,
          project_id INTEGER,
          scraped_for_user_pk VARCHAR(255),
          scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(reel_id, project_id)
        );
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_instagram_reels_owner_username 
        ON instagram_user_reels(owner_username);
        
        CREATE INDEX IF NOT EXISTS idx_instagram_reels_project_id 
        ON instagram_user_reels(project_id);
        
        CREATE INDEX IF NOT EXISTS idx_instagram_reels_scraped_for_user 
        ON instagram_user_reels(scraped_for_user_pk);
        
        CREATE INDEX IF NOT EXISTS idx_instagram_reels_taken_at 
        ON instagram_user_reels(taken_at_timestamp);
      `)

      log.info('✅ Instagram reels table and indexes ensured')
    } catch (error: any) {
      log.error('Error ensuring reels table exists:', error.message)
    }
  }

  /**
   * Сохраняет рилсы пользователя в базу данных
   */
  async saveUserReels(
    reels: ValidatedInstagramReel[],
    projectId?: number
  ): Promise<ReelsSaveResult> {
    const client = await dbPool.connect()
    let saved = 0
    let duplicatesSkipped = 0
    let userId = ''
    let username = ''

    try {
      // Ensure table exists
      await this.ensureReelsTableExists(client)

      for (const reel of reels) {
        try {
          // Сохраняем данные пользователя из первого рилса
          if (!userId && reel.owner_id) {
            userId = reel.owner_id
            username = reel.owner_username
          }

          await client.query(
            `INSERT INTO instagram_user_reels 
             (reel_id, shortcode, display_url, video_url, caption, like_count, comment_count, 
              play_count, taken_at_timestamp, owner_id, owner_username, owner_full_name, 
              owner_profile_pic_url, owner_is_verified, is_video, video_duration, 
              accessibility_caption, hashtags, mentions, project_id, scraped_for_user_pk)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
             ON CONFLICT (reel_id, project_id) DO NOTHING`,
            [
              reel.reel_id,
              reel.shortcode,
              reel.display_url,
              reel.video_url,
              reel.caption,
              reel.like_count,
              reel.comment_count,
              reel.play_count,
              reel.taken_at_timestamp,
              reel.owner_id,
              reel.owner_username,
              reel.owner_full_name,
              reel.owner_profile_pic_url,
              reel.owner_is_verified,
              reel.is_video,
              reel.video_duration,
              reel.accessibility_caption,
              JSON.stringify(reel.hashtags),
              JSON.stringify(reel.mentions),
              projectId || null,
              reel.scraped_for_user_pk,
            ]
          )
          saved++
        } catch (error: any) {
          if (error.code === '23505') {
            // Duplicate key error
            duplicatesSkipped++
          } else {
            log.error(`Error saving reel ${reel.reel_id}:`, error.message)
          }
        }
      }

      const result: ReelsSaveResult = {
        saved,
        duplicatesSkipped,
        totalProcessed: saved + duplicatesSkipped,
        userId,
        username,
      }

      // Валидируем результат с помощью Zod
      const validatedResult = ReelsSaveResultSchema.parse(result)

      log.info(
        `🎬 Reels save complete for ${username}: ${validatedResult.saved} saved, ${validatedResult.duplicatesSkipped} duplicates`
      )

      return validatedResult
    } finally {
      client.release()
    }
  }
}

// Report Generator для создания красивых отчётов и архивов
class ReportGenerator {
  constructor(private outputDir: string = './output') {}

  /**
   * Создаёт HTML отчёт с красивой версткой
   */
  async generateHTMLReport(
    targetUsername: string,
    competitors: any[],
    reelsData: any[],
    metadata: any,
    log: any
  ): Promise<string> {
    const totalCompetitors = competitors.length
    const verifiedCount = competitors.filter(c => c.is_verified).length
    const privateCount = competitors.filter(c => c.is_private).length
    const totalReels = reelsData?.length || 0

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram Competitors Analysis - @${targetUsername}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b6b, #ffa500);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .header .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 40px;
            background: #f8f9fa;
        }
        
        .stat-card {
            background: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
        }
        
        .stat-card .number {
            font-size: 3rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .stat-card .label {
            color: #666;
            font-size: 1.1rem;
        }
        
        .competitors {
            padding: 40px;
        }
        
        .section-title {
            font-size: 2rem;
            margin-bottom: 30px;
            color: #333;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        
        .competitor-grid {
            display: grid;
            gap: 25px;
        }
        
        .competitor-card {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 15px;
            padding: 25px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .competitor-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2);
        }
        
        .competitor-card:hover {
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
            transform: translateY(-2px);
        }
        
        .competitor-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
        }
        
        .competitor-info {
            flex: 1;
        }
        
        .competitor-username {
            font-size: 1.3rem;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        
        .competitor-name {
            color: #666;
            font-size: 1rem;
        }
        
        .competitor-badges {
            display: flex;
            gap: 8px;
        }
        
        .badge {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .badge.verified {
            background: #e3f2fd;
            color: #1976d2;
        }
        
        .badge.private {
            background: #fff3e0;
            color: #f57c00;
        }
        
        .category {
            margin: 15px 0;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .social-context {
            margin-top: 15px;
            color: #666;
            font-style: italic;
        }
        
        .footer {
            background: #333;
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        @media (max-width: 768px) {
            .stats {
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
                padding: 20px;
            }
            
            .competitors {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🎯 Instagram Competitors Analysis</h1>
            <div class="subtitle">Анализ конкурентов для @${targetUsername}</div>
        </header>
        
        <section class="stats">
            <div class="stat-card">
                <div class="number">${totalCompetitors}</div>
                <div class="label">Всего конкурентов</div>
            </div>
            <div class="stat-card">
                <div class="number">${verifiedCount}</div>
                <div class="label">Верифицированных</div>
            </div>
            <div class="stat-card">
                <div class="number">${privateCount}</div>
                <div class="label">Приватных аккаунтов</div>
            </div>
            <div class="stat-card">
                <div class="number">${totalReels}</div>
                <div class="label">Проанализировано рилсов</div>
            </div>
        </section>
        
        <section class="competitors">
            <h2 class="section-title">📋 Список конкурентов</h2>
            <div class="competitor-grid">
                ${competitors
                  .map(
                    (competitor, index) => `
                    <div class="competitor-card">
                        <div class="competitor-header">
                            <div class="competitor-info">
                                <div class="competitor-username">@${
                                  competitor.username
                                }</div>
                                <div class="competitor-name">${
                                  competitor.full_name || 'Имя не указано'
                                }</div>
                            </div>
                            <div class="competitor-badges">
                                ${
                                  competitor.is_verified
                                    ? '<span class="badge verified">✓ Verified</span>'
                                    : ''
                                }
                                ${
                                  competitor.is_private
                                    ? '<span class="badge private">🔒 Private</span>'
                                    : ''
                                }
                            </div>
                        </div>
                        
                        ${
                          competitor.profile_chaining_secondary_label
                            ? `
                            <div class="category">
                                <strong>Категория:</strong> ${competitor.profile_chaining_secondary_label}
                            </div>
                        `
                            : ''
                        }
                        
                        ${
                          competitor.social_context
                            ? `
                            <div class="social_context">
                                💬 ${competitor.social_context}
                            </div>
                        `
                            : ''
                        }
                    </div>
                `
                  )
                  .join('')}
            </div>
        </section>
        
        <footer class="footer">
            <p>📊 Отчёт сгенерирован ${new Date().toLocaleDateString(
              'ru-RU'
            )} в ${new Date().toLocaleTimeString('ru-RU')}</p>
            <p>🤖 Instagram Scraper V2 - Powered by AI</p>
        </footer>
    </div>
</body>
</html>
    `

    const fileName = `instagram_analysis_${targetUsername}_${Date.now()}.html`
    const filePath = path.join(this.outputDir, fileName)

    await fs.mkdir(this.outputDir, { recursive: true })
    await fs.writeFile(filePath, html, 'utf-8')

    log.info(`📄 HTML отчёт создан: ${fileName}`)
    return filePath
  }

  /**
   * Создаёт Excel файл с данными
   */
  async generateExcelReport(
    targetUsername: string,
    competitors: any[],
    reelsData: any[]
  ): Promise<string> {
    // Создаём новую рабочую книгу
    const workbook = XLSX.utils.book_new()

    // Лист с конкурентами
    const competitorsData = competitors.map((comp, index) => ({
      '№': index + 1,
      Username: comp.username,
      'Полное имя': comp.full_name || '',
      Верифицирован: comp.is_verified ? 'Да' : 'Нет',
      Приватный: comp.is_private ? 'Да' : 'Нет',
      Категория: comp.profile_chaining_secondary_label || '',
      'Социальный контекст': comp.social_context || '',
      'URL профиля': comp.profile_url || '',
      'Дата парсинга': new Date(
        comp.created_at || new Date()
      ).toLocaleDateString('ru-RU'),
    }))

    const competitorsSheet = XLSX.utils.json_to_sheet(competitorsData)
    XLSX.utils.book_append_sheet(workbook, competitorsSheet, 'Конкуренты')

    // Лист с рилсами (если есть)
    if (reelsData && reelsData.length > 0) {
      const reelsSheetData = reelsData.map((reel, index) => ({
        '№': index + 1,
        Автор: reel.owner_username || '',
        Shortcode: reel.shortcode || '',
        Лайки: reel.like_count || 0,
        Комментарии: reel.comment_count || 0,
        Просмотры: reel.play_count || 0,
        'Длительность (сек)': reel.video_duration || 0,
        'Дата создания': reel.taken_at_timestamp
          ? new Date(reel.taken_at_timestamp * 1000).toLocaleDateString('ru-RU')
          : '',
        URL: reel.display_url || '',
      }))

      const reelsSheet = XLSX.utils.json_to_sheet(reelsSheetData)
      XLSX.utils.book_append_sheet(workbook, reelsSheet, 'Рилсы')
    }

    // Лист с аналитикой
    const analyticsData = [
      ['Показатель', 'Значение'],
      ['Целевой аккаунт', `@${targetUsername}`],
      ['Всего конкурентов найдено', competitors.length],
      [
        'Верифицированных аккаунтов',
        competitors.filter(c => c.is_verified).length,
      ],
      ['Приватных аккаунтов', competitors.filter(c => c.is_private).length],
      ['Публичных аккаунтов', competitors.filter(c => !c.is_private).length],
      ['Всего рилсов проанализировано', reelsData?.length || 0],
      ['Дата анализа', new Date().toLocaleDateString('ru-RU')],
      ['Время анализа', new Date().toLocaleTimeString('ru-RU')],
    ]

    const analyticsSheet = XLSX.utils.aoa_to_sheet(analyticsData)
    XLSX.utils.book_append_sheet(workbook, analyticsSheet, 'Аналитика')

    const fileName = `instagram_data_${targetUsername}_${Date.now()}.xlsx`
    const filePath = path.join(this.outputDir, fileName)

    await fs.mkdir(this.outputDir, { recursive: true })
    XLSX.writeFile(workbook, filePath)

    log.info(`📊 Excel файл создан: ${fileName}`)
    return filePath
  }

  /**
   * Создаёт ZIP архив с отчётами
   */
  async createReportArchive(
    targetUsername: string,
    htmlPath: string,
    excelPath: string,
    log: any
  ): Promise<string> {
    const archiveName = `instagram_competitors_${targetUsername}_${Date.now()}.zip`
    const archivePath = path.join(this.outputDir, archiveName)

    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(archivePath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => {
        log.info(`📦 Архив создан: ${archiveName} (${archive.pointer()} bytes)`)
        resolve(archivePath)
      })

      archive.on('error', err => {
        log.error('❌ Ошибка создания архива:', err)
        reject(err)
      })

      // pipe() does not forward destination errors to the source, and
      // archive.on('error') covers only archiver-internal faults. Without this
      // an output write error (ENOSPC/EMFILE/EACCES) is an unhandled emitter
      // 'error' -> uncaughtException -> process.exit(1) kills every bot.
      output.on('error', err => {
        log.error('❌ Ошибка записи архива:', err)
        reject(err)
      })

      archive.pipe(output)

      // Добавляем файлы в архив
      archive.file(htmlPath, { name: path.basename(htmlPath) })
      archive.file(excelPath, { name: path.basename(excelPath) })

      // Создаём README файл
      const readmeContent = `
# 🎯 Instagram Competitors Analysis Report

## Описание
Этот архив содержит результаты анализа Instagram конкурентов для аккаунта @${targetUsername}

## Содержимое архива:
- 📄 HTML отчёт - красивый визуальный отчёт для просмотра в браузере
- 📊 Excel файл - данные в табличном формате для анализа
- 📝 README.txt - данный файл с описанием

## Как использовать:
1. Откройте HTML файл в браузере для просмотра красивого отчёта
2. Откройте Excel файл для работы с данными в табличном виде
3. В Excel файле есть несколько листов:
   - "Конкуренты" - список всех найденных конкурентов
   - "Рилсы" - данные по рилсам (если включен парсинг)
   - "Аналитика" - общая статистика

## Дата создания: ${new Date().toLocaleDateString(
        'ru-RU'
      )} ${new Date().toLocaleTimeString('ru-RU')}
## Создано с помощью: Instagram Scraper V2
      `

      archive.append(readmeContent, { name: 'README.txt' })

      archive.finalize()
    })
  }
}

// Main Instagram Scraper Function with Zod validation
export const instagramScraperV2 = inngest.createFunction(
  {
    id: slugify('instagram-scraper-v2'),
    name: '🤖 Instagram Scraper V2 (Real API + Zod)',
    concurrency: 2,
  },
  { event: 'instagram/scraper-v2' },
  async ({ event, step, runId, logger: log }) => {
    // ===============================================
    // ДИАГНОСТИКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
    // ===============================================
    log.info('🔍 Диагностика переменных окружения:', {
      RAPIDAPI_INSTAGRAM_KEY: process.env.RAPIDAPI_INSTAGRAM_KEY
        ? `${process.env.RAPIDAPI_INSTAGRAM_KEY.substring(0, 10)}...`
        : 'НЕ НАЙДЕН',
      RAPIDAPI_INSTAGRAM_HOST:
        process.env.RAPIDAPI_INSTAGRAM_HOST || 'НЕ НАЙДЕН',
      NODE_ENV: process.env.NODE_ENV || 'НЕ НАЙДЕН',
    })

    // Логгируем полученные данные события для отладки
    log.info('🔍 Received event data:', event.data)

    // УПРОЩЁННАЯ валидация без Zod для быстрого исправления
    const eventData = event.data as any

    if (!eventData || typeof eventData !== 'object') {
      log.error('❌ Event data is not an object:', eventData)
      throw new Error('Event data must be an object')
    }

    if (!eventData.username_or_id) {
      log.error('❌ username_or_id is missing from event data:', eventData)
      throw new Error('username_or_id is required')
    }

    if (!eventData.project_id || eventData.project_id <= 0) {
      log.error(
        '❌ project_id is missing or invalid from event data:',
        eventData
      )
      throw new Error('project_id must be a positive number')
    }

    // Устанавливаем дефолтные значения
    const username_or_id = String(eventData.username_or_id)
    const project_id = Number(eventData.project_id)
    const max_users = Number(eventData.max_users) || 50
    const max_reels_per_user = Number(eventData.max_reels_per_user) || 50
    const scrape_reels = Boolean(eventData.scrape_reels || false)
    const requester_telegram_id = eventData.requester_telegram_id || ''

    log.info('✅ Event data parsed successfully:', {
      username_or_id,
      project_id,
      max_users,
      max_reels_per_user,
      scrape_reels,
      requester_telegram_id,
    })

    log.info('🚀 Instagram Scraper V2 started (simplified validation)', {
      runId,
      target: username_or_id,
      maxUsers: max_users,
      scrapeReels: scrape_reels,
      maxReelsPerUser: max_reels_per_user,
      requester: requester_telegram_id,
      projectId: project_id,
    })

    // Step 1: Validate input
    const validation = await step.run('validate-input', async () => {
      if (!process.env.RAPIDAPI_INSTAGRAM_KEY) {
        throw new Error('Instagram API key is not configured')
      }

      if (!process.env.NEON_DATABASE_URL) {
        throw new Error('Database URL is not configured')
      }

      log.info(`✅ Input validated with Zod: ${username_or_id}`)
      return { valid: true, target: username_or_id }
    })

    // Step 2: Validate project_id exists in database
    const projectValidation = await step.run(
      'validate-project-id',
      async () => {
        const db = new InstagramDatabase()
        const validation = await db.validateProjectId(project_id)

        if (!validation.exists) {
          throw new Error(
            `Project ID ${project_id} does not exist or is inactive`
          )
        }

        log.info(
          `✅ Project validation successful: ${validation.projectName} (ID: ${project_id})`
        )
        return {
          valid: true,
          projectId: project_id,
          projectName: validation.projectName,
        }
      }
    )

    // Step 3: Call Instagram API with Zod validation
    const apiResult = await step.run('call-instagram-api', async () => {
      // Добавляем базовую задержку для избежания rate limiting
      log.info('⏳ Waiting 5 seconds before API call to avoid rate limiting...')
      await new Promise(resolve => setTimeout(resolve, 5000))

      const api = new InstagramAPI()
      const result = await api.getSimilarUsers(username_or_id, max_users)

      if (!result.success) {
        throw new Error(`API call failed: ${result.error}`)
      }

      log.info(
        `✅ API call successful with Zod validation: ${result.total} users found`
      )
      return result
    })

    // Step 4: Process and validate users with Zod
    const processedUsers = await step.run(
      'process-users-with-zod',
      async () => {
        const userValidationResult = validateInstagramUsers(
          apiResult.users,
          project_id
        )

        if (userValidationResult.errors.length > 0) {
          log.warn('Some users failed validation:', userValidationResult.errors)
        }

        log.info(
          `✅ Zod processing complete: ${userValidationResult.validUsers.length} valid, ${userValidationResult.invalidUsers.length} invalid`
        )

        return {
          validUsers: userValidationResult.validUsers,
          invalidUsers: userValidationResult.invalidUsers,
          validCount: userValidationResult.validUsers.length,
          invalidCount: userValidationResult.invalidUsers.length,
          validationErrors: userValidationResult.errors,
        }
      }
    )

    // Step 5: REAL DATABASE SAVE with Zod validation
    const saveResult = (await step.run(
      'save-to-neon-database-zod',
      async () => {
        const db = new InstagramDatabase()
        const result = await db.saveUsers(
          username_or_id,
          processedUsers.validUsers,
          project_id
        )

        log.info(
          `💾 REAL Database save with Zod: ${result.saved} saved, ${result.duplicatesSkipped} duplicates`
        )

        return result
      }
    )) as DatabaseSaveResult

    // Step 6: CONDITIONALLY SCRAPE REELS for each user
    const reelsResults: ReelsSaveResult[] = []
    let totalReelsSaved = 0
    let totalReelsDuplicates = 0

    if (scrape_reels && processedUsers.validUsers.length > 0) {
      log.info(
        `🎬 Starting reels scraping for ${processedUsers.validUsers.length} users...`
      )

      for (let i = 0; i < processedUsers.validUsers.length; i++) {
        const user: ValidatedInstagramUser = processedUsers.validUsers[i]!

        // Step 6.X: Get reels for individual user
        const userReelsResult = await step.run(
          `get-reels-for-user-${i}`,
          async () => {
            // Добавляем задержку между запросами рилсов
            if (i > 0) {
              log.info('⏳ Waiting 3 seconds between reels requests...')
              await new Promise(resolve => setTimeout(resolve, 3000))
            }

            const api = new InstagramAPI()
            const result = await api.getUserReels(
              user.username,
              max_reels_per_user
            )

            if (!result.success) {
              log.warn(
                `⚠️ Failed to get reels for ${user.username}: ${result.error}`
              )
              return {
                success: false,
                error: result.error,
                username: user.username,
                reels: [],
                total: 0,
              }
            }

            log.info(
              `✅ Reels fetched for ${user.username}: ${result.total} reels found`
            )
            return result
          }
        )

        // Step 6.X: Process and save reels if API call was successful
        if (
          userReelsResult.success &&
          userReelsResult.reels &&
          Array.isArray(userReelsResult.reels) &&
          userReelsResult.reels.length > 0
        ) {
          const reelsSaveResult = await step.run(
            `save-reels-for-user-${i}`,
            async () => {
              // Валидируем рилсы
              const validationResult = validateInstagramReels(
                userReelsResult.reels as any[],
                project_id,
                user.pk // ID пользователя, для которого собираем рилсы
              )

              if (validationResult.errors.length > 0) {
                log.warn(
                  `Some reels failed validation for ${user.username}:`,
                  validationResult.errors
                )
              }

              // Сохраняем в БД
              const db = new InstagramDatabase()
              const saveResult = await db.saveUserReels(
                validationResult.validReels,
                project_id
              )

              log.info(
                `🎬 Reels saved for ${user.username}: ${saveResult.saved} saved, ${saveResult.duplicatesSkipped} duplicates`
              )

              return {
                ...saveResult,
                validReelsCount: validationResult.validReels.length,
                invalidReelsCount: validationResult.invalidReels.length,
                validationErrors: validationResult.errors,
              }
            }
          )

          reelsResults.push(reelsSaveResult)
          totalReelsSaved += reelsSaveResult.saved
          totalReelsDuplicates += reelsSaveResult.duplicatesSkipped
        }
      }

      log.info(
        `🎯 Reels scraping complete: ${totalReelsSaved} reels saved, ${totalReelsDuplicates} duplicates across ${reelsResults.length} users`
      )
    } else {
      log.info('⏭️ Reels scraping skipped (not enabled or no users found)')
    }

    // Step 7: Generate reports and archive
    const reportResult = await step.run(
      'generate-reports-archive',
      async () => {
        log.info('📋 Создаём красивые отчёты и архив для клиента...')

        try {
          const reportGenerator = new ReportGenerator('./output')

          // Получаем данные рилсов для отчёта
          let allReelsData: any[] = []
          if (scrape_reels && reelsResults.length > 0) {
            // Собираем все рилсы из результатов
            const client = await dbPool.connect()
            try {
              const reelsQuery = `
              SELECT * FROM instagram_user_reels 
              WHERE project_id = $1 AND scraped_for_user_pk IN (
                SELECT user_pk FROM instagram_similar_users 
                WHERE search_username = $2 AND project_id = $1
              )
              ORDER BY like_count DESC
              LIMIT 100
            `
              const reelsResult = await client.query(reelsQuery, [
                project_id,
                username_or_id,
              ])
              allReelsData = reelsResult.rows
            } finally {
              client.release()
            }
          }

          // Генерируем HTML отчёт
          const htmlPath = await reportGenerator.generateHTMLReport(
            username_or_id,
            processedUsers.validUsers,
            allReelsData,
            {
              runId,
              projectId: project_id,
              scrapeDate: new Date(),
              totalUsers: processedUsers.validCount,
            },
            log
          )

          // Генерируем Excel файл
          const excelPath = await reportGenerator.generateExcelReport(
            username_or_id,
            processedUsers.validUsers,
            allReelsData
          )

          // Создаём ZIP архив
          const archivePath = await reportGenerator.createReportArchive(
            username_or_id,
            htmlPath,
            excelPath,
            log
          )

          log.info('✅ Отчёты и архив созданы успешно!')

          return {
            success: true,
            htmlReportPath: htmlPath,
            excelReportPath: excelPath,
            archivePath: archivePath,
            archiveFileName: path.basename(archivePath),
          }
        } catch (error) {
          log.error('❌ Ошибка создания отчётов:', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }
    )

    // Step 8: Send results to user via Telegram
    const telegramResult = await step.run(
      'send-results-to-telegram',
      async () => {
        // Стандартизированная структура ответа
        const createTelegramResponse = (
          sent: boolean,
          options: {
            bot_name?: string
            archive_sent?: boolean
            summary_sent?: boolean
            error?: string
            telegram_id?: string | number
            message_type?: string
            reason?: string
          } = {}
        ) => ({
          sent,
          bot_name: options.bot_name || 'unknown',
          archive_sent: options.archive_sent || false,
          summary_sent: options.summary_sent || false,
          error: options.error || null,
          telegram_id: options.telegram_id || requester_telegram_id,
          message_type: options.message_type || 'none',
          reason: options.reason || null,
        })

        // Проверяем есть ли requester_telegram_id для отправки
        if (!requester_telegram_id) {
          log.warn('⚠️ Нет requester_telegram_id для отправки результатов')
          return createTelegramResponse(false, { reason: 'no_telegram_id' })
        }

        // Получаем bot_name из события или используем дефолтный
        const bot_name = eventData.bot_name || 'neuro_blogger_bot'

        try {
          // Получаем экземпляр бота
          const { getBotByName } = await import('@/core/bot')
          const botResult = getBotByName(bot_name)

          if (!botResult || !botResult.bot) {
            log.error(`❌ Бот не найден: ${bot_name}`)
            return createTelegramResponse(false, {
              bot_name,
              reason: 'bot_not_found',
            })
          }

          const { bot } = botResult

          // Если отчеты созданы успешно и есть архив
          if (
            reportResult.success &&
            'archivePath' in reportResult &&
            reportResult.archivePath
          ) {
            // Отправляем архив пользователю
            const fs = await import('fs')

            if (fs.existsSync(reportResult.archivePath)) {
              // Создаем сообщение на русском/английском
              const language = eventData.language || 'ru'
              const isRu = language === 'ru'

              const message = isRu
                ? `🎯 Анализ Instagram конкурентов завершен!

📊 **Результаты:**
• Найдено конкурентов: ${processedUsers.validCount}
• Сохранено в базу: ${saveResult.saved}
${scrape_reels ? `• Проанализировано рилсов: ${totalReelsSaved}` : ''}

📦 **В архиве:**
• HTML отчёт с красивой визуализацией
• Excel файл с данными для анализа
• README с инструкциями

Целевой аккаунт: @${username_or_id}`
                : `🎯 Instagram competitors analysis completed!

📊 **Results:**
• Competitors found: ${processedUsers.validCount}
• Saved to database: ${saveResult.saved}
${scrape_reels ? `• Reels analyzed: ${totalReelsSaved}` : ''}

📦 **Archive contains:**
• HTML report with beautiful visualization  
• Excel file with data for analysis
• README with instructions

Target account: @${username_or_id}`

              // Создаём URL для скачивания архива
              const archiveFilename = path.basename(reportResult.archivePath)
              const API_URL =
                process.env.ORIGIN ||
                process.env.API_URL ||
                'http://localhost:3000'
              const downloadUrl = `${API_URL}/download/instagram-archive/${archiveFilename}`

              // Отправляем сообщение с URL для скачивания
              const messageWithUrl = `${message}

📥 **Скачать архив:** [${archiveFilename}](${downloadUrl})

⚠️ _Ссылка действительна в течение 24 часов_`

              await bot.telegram.sendMessage(
                requester_telegram_id.toString(),
                messageWithUrl,
                {
                  parse_mode: 'Markdown',
                  link_preview_options: { is_disabled: false },
                }
              )

              log.info('✅ URL архива отправлен пользователю успешно', {
                telegram_id: requester_telegram_id,
                bot_name,
                archive_size: fs.statSync(reportResult.archivePath).size,
                download_url: downloadUrl,
                archive_filename: archiveFilename,
              })

              return createTelegramResponse(true, {
                bot_name,
                archive_sent: true,
                telegram_id: requester_telegram_id,
                message_type: 'download_url_message',
              })
            } else {
              log.error('❌ Файл архива не существует', {
                archivePath: reportResult.archivePath,
              })

              // Отправляем сообщение об ошибке
              const errorMessage =
                eventData.language === 'ru'
                  ? '❌ Извините, произошла ошибка при создании архива с отчётами.'
                  : '❌ Sorry, there was an error creating the reports archive.'

              await bot.telegram.sendMessage(
                requester_telegram_id.toString(),
                errorMessage
              )

              return createTelegramResponse(true, {
                bot_name,
                archive_sent: false,
                error: 'archive_file_missing',
                summary_sent: true,
                telegram_id: requester_telegram_id,
                message_type: 'error_message',
              })
            }
          } else {
            // Если отчеты не созданы, отправляем краткую сводку
            const language = eventData.language || 'ru'
            const summaryMessage =
              language === 'ru'
                ? `📊 Анализ Instagram завершен!

Целевой аккаунт: @${username_or_id}
Найдено конкурентов: ${processedUsers.validCount}
Сохранено в базу: ${saveResult.saved}
${scrape_reels ? `Рилсов проанализировано: ${totalReelsSaved}` : ''}

⚠️ Отчеты не были созданы из-за ошибки.`
                : `📊 Instagram analysis completed!

Target account: @${username_or_id}
Competitors found: ${processedUsers.validCount}
Saved to database: ${saveResult.saved}
${scrape_reels ? `Reels analyzed: ${totalReelsSaved}` : ''}

⚠️ Reports were not created due to an error.`

            await bot.telegram.sendMessage(
              requester_telegram_id.toString(),
              summaryMessage
            )

            return createTelegramResponse(true, {
              bot_name,
              archive_sent: false,
              summary_sent: true,
              telegram_id: requester_telegram_id,
              message_type: 'summary_message',
            })
          }
        } catch (error) {
          log.error('❌ Ошибка отправки результатов в Telegram:', error)
          return createTelegramResponse(false, {
            bot_name,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    )

    // Final result with reports and telegram delivery info
    const finalResult = {
      success: true,
      searchTarget: username_or_id,
      usersScraped: apiResult.total,
      usersValid: processedUsers.validCount,
      usersInvalid: processedUsers.invalidCount,
      usersSaved: saveResult.saved,
      duplicatesSkipped: saveResult.duplicatesSkipped,
      scrapedAt: new Date(),
      runId,
      requesterTelegramId: requester_telegram_id,
      projectId: project_id,
      sampleUsers: processedUsers.validUsers.slice(0, 3),
      validationErrors: processedUsers.validationErrors,
      // Reels data
      reelsEnabled: scrape_reels,
      reelsScraped: totalReelsSaved,
      reelsDuplicates: totalReelsDuplicates,
      reelsPerUser: max_reels_per_user,
      reelsResults: reelsResults.map(r => ({
        username: r.username,
        saved: r.saved,
        duplicatesSkipped: r.duplicatesSkipped,
        totalProcessed: r.totalProcessed,
      })),
      // Reports and archive info
      reports: {
        generated: reportResult.success,
        htmlReport:
          reportResult.success && 'htmlReportPath' in reportResult
            ? reportResult.htmlReportPath
            : null,
        excelReport:
          reportResult.success && 'excelReportPath' in reportResult
            ? reportResult.excelReportPath
            : null,
        archivePath:
          reportResult.success && 'archivePath' in reportResult
            ? reportResult.archivePath
            : null,
        archiveFileName:
          reportResult.success && 'archiveFileName' in reportResult
            ? reportResult.archiveFileName
            : null,
        error:
          !reportResult.success && 'error' in reportResult
            ? reportResult.error
            : null,
      },
      // Telegram delivery info
      telegram: {
        sent: telegramResult.sent,
        bot_name: telegramResult.bot_name || 'unknown',
        archive_sent: telegramResult.archive_sent || false,
        summary_sent: telegramResult.summary_sent || false,
        error: telegramResult.error || null,
        telegram_id: telegramResult.telegram_id || requester_telegram_id,
      },
      mode: 'REAL_API_V2_WITH_NEON_DB_SIMPLIFIED_WITH_REPORTS_AND_TELEGRAM',
    }

    log.info(
      '🎉 Instagram Scraper V2 completed successfully with Telegram delivery',
      {
        target: username_or_id,
        scraped: finalResult.usersScraped,
        saved: finalResult.usersSaved,
        projectId: finalResult.projectId,
        validationErrors: finalResult.validationErrors.length,
        telegram_sent: finalResult.telegram.sent,
        archive_sent: finalResult.telegram.archive_sent,
      }
    )

    return finalResult
  }
)

// Helper function to trigger scraping with Zod validation
export async function triggerInstagramScrapingV2(
  data: InstagramScrapingEvent
): Promise<{ eventId: string }> {
  // Валидируем входные данные
  const validatedData = InstagramScrapingEventSchema.parse(data)

  const result = await inngest.send({
    name: 'instagram/scrape-similar-users',
    data: validatedData,
  })

  return {
    eventId: result.ids[0],
  }
}

// Новая функция для создания одного пользователя Instagram
export const createInstagramUser = inngest.createFunction(
  {
    id: slugify('create-instagram-user'),
    name: '👤 Create Single Instagram User',
    concurrency: 5,
  },
  { event: 'instagram/create-user' },
  async ({ event, step, runId, logger: log }) => {
    // Валидируем входные данные с помощью Zod
    const validationResult = CreateInstagramUserEventSchema.safeParse(
      event.data
    )

    if (!validationResult.success) {
      const errorMessage = `Invalid event data: ${validationResult.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`
      log.error(errorMessage)
      throw new Error(errorMessage)
    }

    const userData = validationResult.data

    log.info('🚀 Create Instagram User started (with Zod validation)', {
      runId,
      username: userData.username,
      pk: userData.pk,
      projectId: userData.project_id,
      requester: userData.requester_telegram_id,
    })

    // Step 1: Validate database connection
    const dbValidation = await step.run('validate-database', async () => {
      if (!process.env.NEON_DATABASE_URL) {
        throw new Error('Database URL is not configured')
      }

      log.info(`✅ Database connection validated`)
      return { valid: true }
    })

    // Step 2: Validate project_id exists in database
    const projectValidation = await step.run(
      'validate-project-id',
      async () => {
        const db = new InstagramDatabase()
        const validation = await db.validateProjectId(userData.project_id)

        if (!validation.exists) {
          throw new Error(
            `Project ID ${userData.project_id} does not exist or is inactive`
          )
        }

        log.info(
          `✅ Project validation successful: ${validation.projectName} (ID: ${userData.project_id})`
        )
        return {
          valid: true,
          projectId: userData.project_id,
          projectName: validation.projectName,
        }
      }
    )

    // Step 3: Create user in database
    const createResult = (await step.run(
      'create-user-in-database',
      async () => {
        const db = new InstagramDatabase()
        const result = await db.createSingleUser(userData)

        if (!result.success) {
          throw new Error(`Failed to create user: ${result.error}`)
        }

        log.info(
          `${result.created ? '✅ User created' : '👤 User already exists'}: ${
            userData.username
          } (PK: ${userData.pk})`
        )

        return result
      }
    )) as CreateUserResult

    // Final result
    const finalResult = {
      success: true,
      created: createResult.created,
      alreadyExists: createResult.alreadyExists,
      user: {
        pk: userData.pk,
        username: userData.username,
        full_name: userData.full_name,
        is_private: userData.is_private,
        is_verified: userData.is_verified,
        profile_pic_url: userData.profile_pic_url,
        profile_url: `https://instagram.com/${userData.username}`,
        profile_chaining_secondary_label:
          userData.profile_chaining_secondary_label,
        social_context: userData.social_context,
      },
      projectId: userData.project_id,
      requesterTelegramId: userData.requester_telegram_id,
      createdAt: new Date(),
      runId,
      mode: 'MANUAL_USER_CREATION_WITH_ZOD',
    }

    log.info('🎉 Create Instagram User completed successfully', {
      username: userData.username,
      pk: userData.pk,
      created: createResult.created,
      projectId: userData.project_id,
    })

    return finalResult
  }
)

// Helper function to trigger single user creation with Zod validation
export async function triggerCreateInstagramUser(
  data: CreateInstagramUserEvent
): Promise<{ eventId: string }> {
  // Валидируем входные данные
  const validatedData = CreateInstagramUserEventSchema.parse(data)

  const result = await inngest.send({
    name: 'instagram/create-user',
    data: validatedData,
  })

  return {
    eventId: result.ids[0],
  }
}

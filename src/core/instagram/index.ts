/**
 * Instagram Content Agent Database Module
 * Provides database operations for Instagram content analysis
 */

import pkg from 'pg'
const { Pool } = pkg

// Database connection pool
const dbPool = new Pool({
  connectionString:
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_vXnxbypES56V@ep-proud-grass-aegoipez-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false,
  },
})

/**
 * Data type for reels analysis
 */
export interface ReelsAnalysisData {
  comp_username: string
  reel_id: string
  ig_reel_url: string
  caption: string
  views_count: number
  likes_count: number
  comments_count: number
  created_at_instagram: Date
  project_id?: number
}

/**
 * Data type for competitor information
 */
export interface CompetitorData {
  query_username: string
  comp_username: string
  followers_count: number
  category: string
  bio: string
  ig_url: string
  project_id?: number
}

/**
 * Result of database save operation
 */
export interface DatabaseSaveResult {
  saved: number
  duplicates: number
  totalProcessed: number
}

/**
 * Instagram Content Agent Database Class
 * Handles all database operations for Instagram content analysis
 */
export class InstagramContentAgentDB {
  /**
   * Save reels analysis data to database
   */
  async saveReelsAnalysis(
    data: ReelsAnalysisData[]
  ): Promise<DatabaseSaveResult> {
    const client = await dbPool.connect()
    let saved = 0
    let duplicates = 0

    try {
      // Ensure reels_analysis table exists
      await this.ensureReelsAnalysisTableExists(client)

      for (const reel of data) {
        try {
          await client.query(
            `INSERT INTO reels_analysis 
             (comp_username, reel_id, ig_reel_url, caption, views_count, likes_count, 
              comments_count, created_at_instagram, project_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (reel_id, project_id) DO NOTHING`,
            [
              reel.comp_username,
              reel.reel_id,
              reel.ig_reel_url,
              reel.caption,
              reel.views_count,
              reel.likes_count,
              reel.comments_count,
              reel.created_at_instagram,
              reel.project_id || null,
            ]
          )
          saved++
        } catch (error: any) {
          if (error.code === '23505') {
            // Duplicate key error
            duplicates++
          } else {
            console.error(`Error saving reel ${reel.reel_id}:`, error.message)
          }
        }
      }

      return {
        saved,
        duplicates,
        totalProcessed: saved + duplicates,
      }
    } finally {
      client.release()
    }
  }

  /**
   * Save competitors data to database
   */
  async saveCompetitors(
    data: CompetitorData[]
  ): Promise<DatabaseSaveResult> {
    const client = await dbPool.connect()
    let saved = 0
    let duplicates = 0

    try {
      // Ensure competitors table exists
      await this.ensureCompetitorsTableExists(client)

      for (const competitor of data) {
        try {
          await client.query(
            `INSERT INTO competitors 
             (query_username, comp_username, followers_count, category, bio, ig_url, project_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (comp_username, project_id) DO NOTHING`,
            [
              competitor.query_username,
              competitor.comp_username,
              competitor.followers_count,
              competitor.category,
              competitor.bio,
              competitor.ig_url,
              competitor.project_id || null,
            ]
          )
          saved++
        } catch (error: any) {
          if (error.code === '23505') {
            // Duplicate key error
            duplicates++
          } else {
            console.error(
              `Error saving competitor ${competitor.comp_username}:`,
              error.message
            )
          }
        }
      }

      return {
        saved,
        duplicates,
        totalProcessed: saved + duplicates,
      }
    } finally {
      client.release()
    }
  }

  /**
   * Ensure reels_analysis table exists
   */
  private async ensureReelsAnalysisTableExists(client: any): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS reels_analysis (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          comp_username VARCHAR(255) NOT NULL,
          reel_id VARCHAR(255) NOT NULL,
          ig_reel_url TEXT,
          caption TEXT,
          views_count INTEGER DEFAULT 0,
          likes_count INTEGER DEFAULT 0,
          comments_count INTEGER DEFAULT 0,
          created_at_instagram TIMESTAMP WITH TIME ZONE NOT NULL,
          project_id INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(reel_id, project_id)
        );
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_reels_analysis_comp_username 
        ON reels_analysis(comp_username);
        
        CREATE INDEX IF NOT EXISTS idx_reels_analysis_project_id 
        ON reels_analysis(project_id);
        
        CREATE INDEX IF NOT EXISTS idx_reels_analysis_created_at 
        ON reels_analysis(created_at_instagram);
      `)
    } catch (error: any) {
      console.error('Error ensuring reels_analysis table exists:', error.message)
    }
  }

  /**
   * Ensure competitors table exists
   */
  private async ensureCompetitorsTableExists(client: any): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS competitors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          query_username VARCHAR(255) NOT NULL,
          comp_username VARCHAR(255) NOT NULL,
          followers_count INTEGER DEFAULT 0,
          category VARCHAR(255),
          bio TEXT,
          ig_url TEXT,
          project_id INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(comp_username, project_id)
        );
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_competitors_query_username 
        ON competitors(query_username);
        
        CREATE INDEX IF NOT EXISTS idx_competitors_comp_username 
        ON competitors(comp_username);
        
        CREATE INDEX IF NOT EXISTS idx_competitors_project_id 
        ON competitors(project_id);
      `)
    } catch (error: any) {
      console.error('Error ensuring competitors table exists:', error.message)
    }
  }
}




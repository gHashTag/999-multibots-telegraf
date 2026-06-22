/**
 * Instagram Module Stub
 * Minimal types and exports for Inngest functions
 */

// Stub class for database operations
export class InstagramContentAgentDB {
  async saveAnalysisResults(data: any) {
    console.log('[Instagram DB Stub] saveAnalysisResults called', data);
    return { success: true };
  }

  async saveReelsAnalysis(data: any[]): Promise<{ saved: number; duplicates: number }> {
    console.log('[Instagram DB Stub] saveReelsAnalysis called', data);
    return { saved: data.length, duplicates: 0 };
  }

  async saveCompetitors(data: any[]): Promise<{ saved: number; duplicates: number }> {
    console.log('[Instagram DB Stub] saveCompetitors called', data);
    return { saved: data.length, duplicates: 0 };
  }

  async getCompetitors(userId: string) {
    console.log('[Instagram DB Stub] getCompetitors called', userId);
    return [];
  }
}

// Stub types
export interface ReelsAnalysisData {
  comp_username: string;
  reel_id: string;
  ig_reel_url: string;
  caption: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  created_at_instagram: Date;
  project_id?: number;
}

export interface CompetitorData {
  username: string;
  followers: number;
  engagement_rate: number;
}

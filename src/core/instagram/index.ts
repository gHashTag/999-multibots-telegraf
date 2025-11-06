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

  async getCompetitors(userId: string) {
    console.log('[Instagram DB Stub] getCompetitors called', userId);
    return [];
  }
}

// Stub types
export interface ReelsAnalysisData {
  username: string;
  reels: any[];
  metrics: any;
}

export interface CompetitorData {
  username: string;
  followers: number;
  engagement_rate: number;
}

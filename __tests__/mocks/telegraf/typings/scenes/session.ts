/**
 * Mock для SceneSession из Telegraf
 */
export interface SceneSession {
  current?: string;
  state?: any;
}

export interface SceneSessionData {
  [key: string]: any;
} 
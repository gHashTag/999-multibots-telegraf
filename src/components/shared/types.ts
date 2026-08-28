/**
 * Shared types for refactored components
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { Telegraf } from 'telegraf'

// Base handler interface
export interface BaseHandler {
  handle(ctx: MyContext): Promise<void>
}

// Command registration interface
export interface CommandConfig {
  command: string
  description: string
  handler: (ctx: MyContext) => Promise<void>
  requiresSubscription?: boolean
  adminOnly?: boolean
}

// Menu action interface
export interface MenuAction {
  titles: {
    ru: string
    en: string
  }
  handler: (ctx: MyContext) => Promise<void>
  requiresSubscription?: boolean
}

// Scene manager interface
export interface SceneManager {
  enterScene(ctx: MyContext, sceneId: string): Promise<void>
  leaveCurrentScene(ctx: MyContext): Promise<void>
}

// Bot registration context
export interface BotRegistrationContext {
  bot: Telegraf<MyContext>
  logger: any
}

// Action handler context
export interface ActionHandlerContext {
  action: string
  handler: (ctx: MyContext) => Promise<void>
  requiresAnswer?: boolean
}

// Photo handler configuration
export interface PhotoHandlerConfig {
  condition: (ctx: MyContext) => boolean
  handler: (ctx: MyContext) => Promise<void>
  priority: number
}

// Video generation configuration
export interface VideoGenerationConfig {
  mode: string
  titles: {
    ru: string
    en: string
  }
  sceneId: string
  requiresSubscription: boolean
}

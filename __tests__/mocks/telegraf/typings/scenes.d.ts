/**
 * Мок для типов Telegraf Scenes
 */

import { Middleware, MiddlewareFn } from 'telegraf'

declare module './scenes/index.js' {
  interface SceneSessionData {
    state?: Record<string, any>
  }
}

export interface SceneContext {
  scene: SceneContextScene
}

export interface SceneContextScene {
  state: Record<string, any>
  session: Record<string, any>
  enter: (
    sceneId: string,
    defaultState?: Record<string, any>,
    silent?: boolean
  ) => Promise<any>
  reenter: () => Promise<any>
  leave: () => Promise<any>
}

export interface SceneOptions {
  ttl?: number
  defaultState?: Record<string, any>
}

export interface Scene<C> {
  id: string
  middleware: () => Middleware<C>
  enterMiddleware: () => MiddlewareFn<C>
  leaveMiddleware: () => MiddlewareFn<C>
}

export interface Stage<C> {
  register: (...scenes: Array<Scene<C>>) => Stage<C>
  middleware: () => Middleware<C>
  use: (...middlewares: Array<Middleware<C>>) => Stage<C>
}

export interface StageOptions {
  default?: string
  ttl?: number
}

export interface WizardContext {
  scene: SceneContextScene & {
    current: Wizard<WizardContext>
  }
  wizard: {
    cursor: number
    state: Record<string, any>
    next: () => Promise<any>
    back: () => Promise<any>
    selectStep: (index: number) => Promise<any>
    step: MiddlewareFn<WizardContext>
  }
}

export interface Wizard<C> extends Scene<C> {
  steps: Array<MiddlewareFn<C>>
}

export interface WizardOptions {
  ttl?: number
  steps?: Array<MiddlewareFn<WizardContext>>
}

export class BaseScene<C> implements Scene<C> {
  constructor(id: string, options?: SceneOptions)
  id: string
  middleware(): Middleware<C>
  enterMiddleware(): MiddlewareFn<C>
  leaveMiddleware(): MiddlewareFn<C>
}

export class WizardScene<C extends WizardContext> implements Wizard<C> {
  constructor(id: string, ...steps: Array<MiddlewareFn<C>>)
  id: string
  steps: Array<MiddlewareFn<C>>
  middleware(): Middleware<C>
  enterMiddleware(): MiddlewareFn<C>
  leaveMiddleware(): MiddlewareFn<C>
}

export function Stage<C extends SceneContext>(
  scenes: Array<Scene<C>>,
  options?: StageOptions
): Stage<C>

export const session: MiddlewareFn<any>

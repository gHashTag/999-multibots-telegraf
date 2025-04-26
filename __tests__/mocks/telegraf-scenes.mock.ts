// Мок для Telegraf Scenes
import { Context } from 'telegraf'

// Определяем основные интерфейсы/типы
export interface SceneSessionData {
  current?: string
  expires?: number
  state?: object
}

export interface SceneSession {
  state: object
}

export interface WizardSessionData {
  cursor: number
  state: object
}

export interface WizardSession extends SceneSession {
  cursor: number
}

// Классы и их реализации
export class BaseScene<T extends Context> {
  constructor(
    public id: string,
    public options: any = {}
  ) {}

  enter(middleware?: any) {
    return this
  }

  leave(middleware?: any) {
    return this
  }

  hears(trigger: any, middleware: any) {
    return this
  }

  action(trigger: any, middleware: any) {
    return this
  }

  on(event: string, middleware: any) {
    return this
  }

  command(command: string, middleware: any) {
    return this
  }

  use(middleware: any) {
    return this
  }
}

export class WizardScene<T extends Context> extends BaseScene<T> {
  steps: Array<(ctx: T, next: () => Promise<void>) => Promise<any>>

  constructor(
    id: string,
    ...steps: Array<(ctx: T, next: () => Promise<void>) => Promise<any>>
  ) {
    super(id)
    this.steps = steps
  }

  middleware() {
    return this.steps
  }
}

export class Stage<T extends Context> {
  constructor(
    public scenes: BaseScene<T>[] = [],
    public options: any = {}
  ) {}

  register(...scenes: BaseScene<T>[]) {
    return this
  }

  middleware() {
    return (ctx: any, next: any) => next()
  }

  static enter(sceneId: string) {
    return (ctx: any) => {
      if (ctx.scene) {
        ctx.scene.enter(sceneId)
      }
    }
  }

  static leave() {
    return (ctx: any) => {
      if (ctx.scene) {
        ctx.scene.leave()
      }
    }
  }
}

export class SceneContextScene<T extends Context> {
  constructor(public ctx: T) {}

  enter(sceneId: string, defaultState?: any, silent?: boolean) {
    return Promise.resolve(this.ctx)
  }

  reenter() {
    return Promise.resolve(this.ctx)
  }

  leave() {
    return Promise.resolve(this.ctx)
  }

  current() {
    return null
  }

  state = {}
}

export class SceneContext<T extends Context> extends Context {
  constructor(update: any, telegram: any, options: any) {
    super(update, telegram, options)
    this.scene = new SceneContextScene<T>(this as any)
  }

  scene: SceneContextScene<T>
}

export class WizardContextWizard<T extends Context> {
  state: any = {}
  cursor: number = 0

  constructor(public ctx: T) {}

  selectStep(index: number) {
    this.cursor = index
    return this.ctx
  }

  next() {
    this.cursor++
    return this.ctx
  }

  back() {
    this.cursor--
    return this.ctx
  }

  step(index: number, middleware: any) {
    return this
  }
}

export class WizardContext<T extends Context> extends SceneContext<T> {
  constructor(update: any, telegram: any, options: any) {
    super(update, telegram, options)
    this.wizard = new WizardContextWizard<T>(this as any)
  }

  wizard: WizardContextWizard<T>
}

export const Scenes = {
  BaseScene,
  WizardScene,
  Stage,
  SceneContext,
  SceneContextScene,
  WizardContext,
  WizardContextWizard,
}

export default Scenes

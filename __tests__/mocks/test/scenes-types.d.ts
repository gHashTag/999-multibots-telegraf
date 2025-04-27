import { Context } from 'telegraf'

export interface SceneContextOptions<C extends Context> {
  scene: {
    current?: string
    state: object
  }
}

export class SceneContext {}

export class BaseScene {
  enter(): this
  leave(): this
  command(command: string, middleware: any): this
  action(action: string, middleware: any): this
  on(updateType: string, middleware: any): this
  hears(triggers: any, middleware: any): this
}

export class Stage {
  register(scenes: BaseScene | BaseScene[]): this
  middleware(): any
}

export default {
  BaseScene,
  SceneContext,
  Stage,
}

declare module 'telegraf/scenes' {
  export { BaseScene, SceneContext, Stage }
}

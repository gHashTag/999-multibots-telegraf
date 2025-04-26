/**
 * Mock для telegraf/typings/scenes/index.js
 */
import * as context from './context'
import * as session from './session'

export { context, session }

export class Stage {
  constructor(scenes?: any[], options?: any) {
    this.scenes = scenes || []
    this.options = options || {}
  }

  register(...scenes: any[]) {
    return this
  }

  middleware() {
    return (ctx: any, next: any) => next()
  }

  scenes: any[] = []
  options: any = {}
} 
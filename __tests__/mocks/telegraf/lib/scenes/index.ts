// Экспортирую класс Stage
export const Stage = class Stage {
  constructor(scenes = [], options = {}) {
    this.scenes = scenes
    this.options = options
  }

  register(...scenes) {
    for (const scene of scenes) {
      this.scenes.push(scene)
    }
    return this
  }

  middleware() {
    return (ctx, next) => next()
  }
}

// Экспортирую класс BaseScene
export const BaseScene = class BaseScene {
  constructor(id, options = {}) {
    this.id = id
    this.options = options
  }

  enter(middleware) {
    return this
  }

  leave(middleware) {
    return this
  }

  use(middleware) {
    return this
  }

  on(event, middleware) {
    return this
  }

  hears(trigger, middleware) {
    return this
  }

  command(command, middleware) {
    return this
  }

  action(trigger, middleware) {
    return this
  }
}

// Экспортирую класс WizardScene
export const WizardScene = class WizardScene extends BaseScene {
  constructor(id, ...steps) {
    super(id)
    this.steps = steps
  }

  addStep(middleware) {
    this.steps.push(middleware)
    return this
  }
}

export default {
  Stage,
  BaseScene,
  WizardScene
} 
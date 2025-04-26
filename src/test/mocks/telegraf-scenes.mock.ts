/**
 * Мок для модуля telegraf/scenes
 *
 * Предоставляет заглушки для Scenes и BaseScene
 */
class MockBaseScene {
  id: string
  enterHandler: Function | null = null
  constructor(id: string) {
    this.id = id
  }

  enter(...fns: Function[]) {
    this.enterHandler = fns[0]
    return this
  }

  leave(...fns: Function[]) {
    return this
  }

  action(...args: any[]) {
    return this
  }

  command(...args: any[]) {
    return this
  }

  on(...args: any[]) {
    return this
  }

  hears(...args: any[]) {
    return this
  }
}

class MockScenes {
  BaseScene: typeof MockBaseScene
  Stage: any
  WizardScene: any

  constructor() {
    this.BaseScene = MockBaseScene

    this.Stage = class MockStage {
      constructor() {}
      register(...args: any[]) {
        return this
      }
      middleware() {
        return () => {}
      }
    }

    this.WizardScene = class MockWizardScene extends MockBaseScene {
      steps: Function[] = []
      constructor(id: string, ...steps: Function[]) {
        super(id)
        this.steps = steps
      }
    }
  }
}

// Экспортируем экземпляр класса как дефолтный экспорт
export default new MockScenes()

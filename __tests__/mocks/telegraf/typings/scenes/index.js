// Mock for telegraf scenes module
module.exports = {
  BaseScene: class BaseScene {
    constructor(id) {
      this.id = id;
    }
    enter() {}
    leave() {}
    use() {}
    action() {}
    command() {}
    hears() {}
  },
  SceneContextScene: class SceneContextScene {
    constructor() {}
    enter() {}
    leave() {}
    reenter() {}
  },
  Stage: class Stage {
    constructor() {}
    register() {}
    middleware() {}
  }
}; 
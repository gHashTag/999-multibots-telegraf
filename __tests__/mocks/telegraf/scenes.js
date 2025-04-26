/**
 * Мок для telegraf/typings/scenes.d.ts
 */

// Экспортируем мок для Scene и Scene.enter
class Scene {
  static enter(scene) {
    return { scene };
  }
}

module.exports = {
  Scene,
}; 
// Мок для отсутствующих типов и констант

// Типы для main.types.ts
export enum EnterType {
  DIRECT = 'direct',
  BUTTON = 'button',
  VOICE = 'voice',
  KEYBOARD = 'keyboard',
  UNKNOWN = 'unknown',
}

// Типы для mode.enum.ts
export enum ModeEnum {
  MainMenu = 'menuScene',
  ImageToVideo = 'imageToVideo',
  TextToVideo = 'textToVideo',
}

// Типы для subscription.interface.ts
export enum SubscriptionTypeEnum {
  NEUROTESTER = 'neurotester',
  NEUROPHOTO = 'neurophoto',
  NEUROVIDEO = 'neurovideo',
}

// Другие константы, которые могут быть нужны
export const buttonsType = {
  MAIN_MENU: 'main_menu',
  BACK: 'back',
}

// Mock for telegraf module
const MockMarkup = {
  inlineKeyboard: jest.fn().mockReturnThis(),
  keyboard: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  extra: jest.fn().mockReturnThis(),
};

const MockContext = {
  reply: jest.fn(),
  replyWithMarkdown: jest.fn(),
  deleteMessage: jest.fn(),
};

module.exports = {
  Markup: MockMarkup,
  Context: MockContext,
  Scenes: {
    BaseScene: jest.fn(),
    Stage: jest.fn(),
    SceneContextScene: jest.fn(),
    WizardScene: jest.fn(),
  },
  Composer: jest.fn(),
}; 
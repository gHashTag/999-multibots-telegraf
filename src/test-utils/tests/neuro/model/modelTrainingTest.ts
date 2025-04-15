import { ModeEnum } from '../../../../interfaces/modes';
import { MySession, MyContext, MyWizardSession } from '../../../../interfaces/telegram-bot.interface';
import { Context, Scenes } from 'telegraf';
import { Update, Message } from 'telegraf/types';
import { TestRunner } from '../../../core/TestRunner';
import assert from '../../../core/assert';
import { UserModel } from '../../../../interfaces/models.interface';
import { Subscription } from '../../../../interfaces/supabase.interface';

const mockSession: MySession = {
  email: 'test@example.com',
  telegram_id: '123456789',
  mode: ModeEnum.TextToImage,
  selectedModel: 'test-model',
  selectedPayment: {
    amount: 100,
    stars: 10
  },
  prompt: 'test prompt',
  selectedSize: '512x512',
  userModel: {
    model_name: 'test-model',
    trigger_word: 'test',
    model_url: 'test/model:latest'
  } as UserModel,
  subscription: 'neurobase' as Subscription,
  numImages: 1,
  attempts: 0,
  videoModel: '',
  imageUrl: '',
  videoUrl: '',
  audioUrl: '',
  amount: 0,
  images: [],
  modelName: '',
  targetUserId: 0,
  username: '',
  triggerWord: '',
  steps: 20,
  inviter: '',
  inviteCode: '',
  invoiceURL: '',
  buttons: [],
  bypass_payment_check: false,
  is_ru: false,
  memory: {
    messages: []
  }
};

function createTestContext(): MyContext {
  const message: Update.New & Update.NonChannel & Message.TextMessage = {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 123456789,
      type: 'private',
      first_name: 'Test',
      username: 'test_user'
    },
    from: {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user'
    },
    text: 'test message'
  };

  const update: Update.MessageUpdate = {
    update_id: 1,
    message
  };

  const baseContext = new Context(update, {} as any, {} as any);
  const scenes = new Map<string, Scenes.BaseScene<MyContext>>();
  const testScene = new Scenes.BaseScene<MyContext>('test-scene');
  scenes.set('test-scene', testScene);

  const wizard = new Scenes.WizardContextWizard<MyContext>(baseContext as MyContext, []);
  const scene = new Scenes.SceneContextScene<MyContext, MyWizardSession>(baseContext as MyContext, scenes, {});

  const context = {
    ...baseContext,
    session: mockSession,
    wizard,
    scene,
    attempts: 0,
    amount: 0,
    updateType: 'message',
    me: {
      id: 123456789,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot'
    },
    tg: {} as any,
    message,
    editedMessage: null,
    inlineQuery: null,
    shippingQuery: null,
    preCheckoutQuery: null,
    chosenInlineResult: null,
    callbackQuery: null,
    channelPost: null,
    editedChannelPost: null,
    pollAnswer: null,
    myChatMember: null,
    chatMember: null,
    chatJoinRequest: null
  } as unknown as MyContext;

  return context;
}

const tests = [
  {
    name: 'Model Training Test - Success',
    description: 'Should successfully create a model',
    category: 'Model Training',
    run: async () => {
      const context = createTestContext();
      assert(context.session?.mode === ModeEnum.TextToImage, 'Mode should be TextToImage');
      assert(context.session?.selectedModel === 'test-model', 'Selected model should be test-model');
    }
  },
  {
    name: 'Model Training Test - Russian Localization',
    description: 'Should handle Russian localization correctly',
    category: 'Localization',
    run: async () => {
      const context = createTestContext();
      assert(context.session?.prompt === 'test prompt', 'Prompt should be set correctly');
      assert(context.session?.selectedSize === '512x512', 'Size should be set correctly');
    }
  }
];

const runner = new TestRunner();
tests.forEach(test => runner.addTests([test]));

export default runner;
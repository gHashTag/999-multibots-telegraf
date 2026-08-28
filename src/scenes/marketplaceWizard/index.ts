/**
 * Marketplace Wizard Scene
 *
 * Users can browse, buy, and sell prompt packs, styles, and LoRA models.
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import {
  listMarketplaceItems,
  getItem,
  purchaseItem,
  createItem,
  getMyItems,
  MarketplaceItemType,
} from '@/services/marketplaceService'
import { getBotNameByToken } from '@/core/bot'

const ITEM_TYPES: { key: MarketplaceItemType; ru: string; en: string }[] = [
  { key: 'prompt_pack', ru: 'Промпт-паки', en: 'Prompt Packs' },
  { key: 'style', ru: 'Стили', en: 'Styles' },
  { key: 'lora_model', ru: 'LoRA модели', en: 'LoRA Models' },
  { key: 'skill_pack', ru: 'Скилл-паки', en: 'Skill Packs' },
]

// Step 1: Main menu
const mainMenuStep = async (ctx: MyContext) => {
  console.log(
    '🟡 [DEBUG marketplace] ========== MARKETPLACE STEP 1 (mainMenu) ENTERED =========='
  )
  console.log('🟡 [DEBUG marketplace] telegramId:', ctx.from?.id)
  console.log(
    '🟡 [DEBUG marketplace] previousScene:',
    ctx.scene?.current?.id || 'none'
  )
  console.log(
    '🟡 [DEBUG marketplace] trigger:',
    ctx.message && 'text' in ctx.message ? ctx.message.text : 'callback/other'
  )
  console.log(
    '🟡 [DEBUG marketplace] stack:',
    new Error().stack?.split('\n').slice(0, 5).join('\n')
  )
  const isRu = isRussianFromState(ctx)
  ctx.session.wizardData = {}

  await ctx.reply(
    isRu
      ? '🛒 Маркетплейс\n\nВыберите действие:'
      : '🛒 Marketplace\n\nChoose an action:',
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? '🔍 Каталог' : '🔍 Browse', 'mp_browse')],
      [
        Markup.button.callback(
          isRu ? '📦 Мои покупки' : '📦 My Items',
          'mp_my_items'
        ),
      ],
      [Markup.button.callback(isRu ? '💰 Продать' : '💰 Sell', 'mp_sell')],
      [
        Markup.button.callback(
          isRu ? '🏠 Главное меню' : '🏠 Main menu',
          'go_main_menu'
        ),
      ],
    ])
  )

  return ctx.wizard.next()
}

// Step 2: Awaiting input for sell flow (title, desc, type, price, content)
const sellInputStep = async (ctx: MyContext) => {
  console.log(
    '🟡 [DEBUG marketplace] ========== MARKETPLACE STEP 2 (sellInput) ENTERED =========='
  )
  console.log('🟡 [DEBUG marketplace] telegramId:', ctx.from?.id)
  console.log(
    '🟡 [DEBUG marketplace] messageText:',
    ctx.message && 'text' in ctx.message ? ctx.message.text : 'N/A'
  )
  console.log(
    '🟡 [DEBUG marketplace] wizardData:',
    JSON.stringify(ctx.session?.wizardData || {})
  )
  const isRu = isRussianFromState(ctx)
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply(
      isRu ? 'Отправьте текстовое сообщение.' : 'Please send a text message.'
    )
    return
  }

  const text = ctx.message.text.trim()
  const wd = ctx.session.wizardData || {}

  // Collect fields sequentially: title -> description -> price -> content
  if (!wd.sellTitle) {
    wd.sellTitle = text
    ctx.session.wizardData = wd
    await ctx.reply(isRu ? '📝 Описание товара:' : '📝 Item description:')
    return
  }
  if (!wd.sellDescription) {
    wd.sellDescription = text
    ctx.session.wizardData = wd
    await ctx.reply(
      isRu ? '💰 Цена в звездах (число):' : '💰 Price in stars (number):'
    )
    return
  }
  if (!wd.sellPrice) {
    const price = parseInt(text, 10)
    if (isNaN(price) || price < 1) {
      await ctx.reply(
        isRu
          ? 'Введите корректное число (минимум 1).'
          : 'Enter a valid number (min 1).'
      )
      return
    }
    wd.sellPrice = price
    ctx.session.wizardData = wd
    await ctx.reply(
      isRu
        ? '📄 Содержимое (промпт, ссылка на модель и т.д.):'
        : '📄 Content (prompt text, model link, etc.):'
    )
    return
  }

  // Final field: content
  wd.sellContent = text
  const telegramId = ctx.from?.id?.toString() || ''
  const result = await createItem(
    telegramId,
    wd.sellTitle,
    wd.sellDescription,
    wd.sellType || 'prompt_pack',
    wd.sellContent,
    wd.sellPrice
  )

  if (result) {
    await ctx.reply(
      isRu
        ? `✅ Товар "${wd.sellTitle}" создан! Цена: ${wd.sellPrice} ⭐`
        : `✅ Item "${wd.sellTitle}" created! Price: ${wd.sellPrice} ⭐`
    )
  } else {
    await ctx.reply(
      isRu
        ? '❌ Не удалось создать товар. Попробуйте позже.'
        : '❌ Failed to create item. Try later.'
    )
  }

  return ctx.scene.reenter()
}

export const marketplaceWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.Marketplace,
  mainMenuStep,
  sellInputStep
)

// --- Browse categories ---
marketplaceWizard.action('mp_browse', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)

  const buttons = ITEM_TYPES.map(t => [
    Markup.button.callback(isRu ? t.ru : t.en, `mp_cat_${t.key}`),
  ])
  buttons.push([
    Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_back_main'),
  ])

  await ctx.editMessageText(
    isRu ? '📂 Выберите категорию:' : '📂 Select a category:',
    Markup.inlineKeyboard(buttons)
  )
})

// --- List items by category ---
ITEM_TYPES.forEach(itemType => {
  marketplaceWizard.action(`mp_cat_${itemType.key}`, async ctx => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    const items = await listMarketplaceItems(itemType.key, 10)

    if (items.length === 0) {
      await ctx.editMessageText(
        isRu
          ? '😔 Пока нет товаров в этой категории.'
          : '😔 No items in this category yet.',
        Markup.inlineKeyboard([
          [Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_browse')],
        ])
      )
      return
    }

    const lines = items.map(
      (it, i) => `${i + 1}. ${it.title} — ${it.price_stars} ⭐`
    )
    const buttons = items.map(it => [
      Markup.button.callback(`🛒 ${it.title}`, `mp_buy_${it.id}`),
    ])
    buttons.push([
      Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_browse'),
    ])

    await ctx.editMessageText(
      `${isRu ? itemType.ru : itemType.en}:\n\n${lines.join('\n')}`,
      Markup.inlineKeyboard(buttons)
    )
  })
})

// --- Buy item ---
marketplaceWizard.action(/^mp_buy_(.+)$/, async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const itemId = ctx.match[1]
  const item = await getItem(itemId)

  if (!item) {
    await ctx.reply(isRu ? '❌ Товар не найден.' : '❌ Item not found.')
    return
  }

  await ctx.editMessageText(
    isRu
      ? `🛒 ${item.title}\n\n${item.description}\n\n💰 Цена: ${item.price_stars} ⭐`
      : `🛒 ${item.title}\n\n${item.description}\n\n💰 Price: ${item.price_stars} ⭐`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '✅ Купить' : '✅ Buy',
          `mp_confirm_${itemId}`
        ),
      ],
      [Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_browse')],
    ])
  )
})

// --- Confirm purchase ---
marketplaceWizard.action(/^mp_confirm_(.+)$/, async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const itemId = ctx.match[1]
  const buyerId = ctx.from?.id?.toString() || ''
  const { bot_name } = getBotNameByToken(ctx.telegram.token)

  const result = await purchaseItem(buyerId, itemId, bot_name)

  if (result.success) {
    await ctx.editMessageText(
      isRu
        ? '✅ Покупка успешна! Вот ваш контент:'
        : '✅ Purchase successful! Here is your content:'
    )
    await ctx.reply(result.content || '(empty)')
  } else {
    const errorMessages: Record<string, { ru: string; en: string }> = {
      item_not_found: { ru: '❌ Товар не найден.', en: '❌ Item not found.' },
      cannot_buy_own: {
        ru: '❌ Нельзя купить свой товар.',
        en: '❌ Cannot buy your own item.',
      },
      insufficient_balance: {
        ru: '❌ Недостаточно звезд.',
        en: '❌ Insufficient stars.',
      },
    }
    const msg = errorMessages[result.error || ''] || {
      ru: '❌ Ошибка.',
      en: '❌ Error.',
    }
    await ctx.editMessageText(isRu ? msg.ru : msg.en)
  }
})

// --- My items ---
marketplaceWizard.action('mp_my_items', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const authorId = ctx.from?.id?.toString() || ''
  const items = await getMyItems(authorId)

  if (items.length === 0) {
    await ctx.editMessageText(
      isRu ? '📦 У вас пока нет товаров.' : '📦 You have no items yet.',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_back_main')],
      ])
    )
    return
  }

  const lines = items.map(
    (it, i) => `${i + 1}. ${it.title} — ${it.price_stars} ⭐`
  )
  await ctx.editMessageText(
    `${isRu ? '📦 Мои товары' : '📦 My Items'}:\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_back_main')],
    ])
  )
})

// --- Sell flow: pick type then move to step 2 ---
marketplaceWizard.action('mp_sell', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)

  const buttons = ITEM_TYPES.map(t => [
    Markup.button.callback(isRu ? t.ru : t.en, `mp_sell_type_${t.key}`),
  ])
  buttons.push([
    Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'mp_back_main'),
  ])

  await ctx.editMessageText(
    isRu ? '💰 Выберите тип товара:' : '💰 Select item type:',
    Markup.inlineKeyboard(buttons)
  )
})

ITEM_TYPES.forEach(itemType => {
  marketplaceWizard.action(`mp_sell_type_${itemType.key}`, async ctx => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    const wd = ctx.session.wizardData || {}
    wd.sellType = itemType.key
    ctx.session.wizardData = wd

    await ctx.reply(isRu ? '📝 Название товара:' : '📝 Item title:')
    // Advance wizard to sellInputStep
    ctx.wizard.selectStep(1)
  })
})

// --- Back to main menu of wizard ---
marketplaceWizard.action('mp_back_main', async ctx => {
  await ctx.answerCbQuery()
  return ctx.scene.reenter()
})

// --- /menu inside scene ---
marketplaceWizard.command('menu', async ctx => {
  const { CancelButtonService } = await import('@/navigation')
  await CancelButtonService.executeMainMenu(ctx)
})

export default marketplaceWizard

/**
 * HOW TO SELL IN A DM, in the words the model reads before every turn.
 *
 * Written down so the owner can argue with it. The rules are the ones that
 * hold up in direct messages: context before pitch, one thought per message,
 * the person's own words as the hook, value before the invoice, a follow-up
 * cascade that stops, and nothing sent without the owner's button.
 */

/**
 * The seller's playbook, for every seller. Until 2026-09-13 "seller" meant
 * the platform owner's id from the environment; since then it means anyone
 * with a connected Telegram account (`isSeller` in telegram-tools, spec
 * specs/automation/crm-sellers.t27). Everybody else -- clients, people who
 * have not connected -- would be told to call tools that refuse them, and
 * would start their turns with a refusal. So: empty unless `seller` is true.
 * The caller decides `seller` once per turn; this function stays synchronous.
 */
export function salesPlaybook(who: {
  surface?: string
  telegramId?: string
  seller?: boolean
  /**
   * Why the lead magnet cannot be made right now, when that is known from a
   * real attempt (image-health.ts). Absent means no reason to doubt.
   *
   * MEASURED 2026-09-16: FAL answered 403 "User is locked. Reason: Exhausted
   * balance" while point 4 below told the model, unconditionally, to give
   * every first contact a portrait. A promise the platform cannot keep, made
   * to a real client, in the owner's name.
   */
  giftIsDown?: string | null
}): string {
  if (who.seller !== true) return ''
  const gift = who.giftIsDown
    ? '4. ПОДАРОК СЕЙЧАС НЕВОЗМОЖЕН: картинки не делаются (' +
      String(who.giftIsDown).slice(0, 80) +
      '). Не обещай портрет и не зови crm_deliver_photo. Ценность вперёд — ' +
      'словами: разбор его задачи, план по его же словам, честная цена.\n'
    : '4. Ценность вперёд — ЛИД-МАГНИТ: первому контакту, тому, кто просил фото, и тому, кто молчит ' +
      'после предложения, сделай подарок из ЕГО ЖЕ аватарки — портрет 9:16 в образе по его словам ' +
      '(crm_deliver_photo, gift по умолчанию: получатель не платит, платит владелец). Не описание ' +
      'услуги, а готовый пример с ним самим на картинке. Подпись: имя, кто сделал (ИИ-ассистент), ' +
      'один мягкий вопрос; без цены и ссылок. Один подарок на человека — второй уже платно.\n'
  return (
    '\n\nПРОДАЖИ В ЛИЧКЕ (когда помогаешь владельцу писать людям):\n' +
    '1. Сначала контекст: перед любым предложением человеку вызови crm_lead_context — ' +
    'что он писал, что ему уже предлагали, чем кончилось. Кому писать первому — crm_leads. ' +
    'Если память пуста — crm_ingest_chats. Сводка по всей переписке — числа, кто ждёт, горячие, ' +
    'сколько по шагам и этапам — crm_summary.\n' +
    '2. Одно сообщение — одна мысль и один вопрос, до трёх предложений. Без ссылок и без цены ' +
    'в первом сообщении. НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ — клиент должен захотеть сам: счёт (crm_offer) ' +
    'только когда человек сам сказал, что хочет купить, или спросил, как оплатить. next=talk — ' +
    'продолжить разговор по его последним словам и памяти, без продажи.\n' +
    '3. Зацепка — его слова: цитируй, что он просил (фото, рилс, озвучку), и говори именно ' +
    'об этом. Цена — когда спросил, честно, в токенах и звёздах.\n' +
    gift +
    '5. Возражения: «дорого» — считай цену за результат, не за токен; «потом» — назначь дату и ' +
    'запиши crm_touch later; «не надо» — crm_touch refused и не возвращайся 30 дней.\n' +
    '6. Каскад: ждёт ответа — сегодня; молчит после предложения — напоминание через 2 дня, ' +
    'потом через 5; больше двух напоминаний без ответа — стоп.\n' +
    '7. Никогда: рассылок, обещаний, которых нет в прайсе, отправки без кнопки владельца. ' +
    'Каждое отправленное — crm_touch.\n' +
    '8. Выборочно, когда владелец назвал КОГО: один человек (@username или id) — только он: ' +
    'crm_lead_context по нему, одно действие по его словам, crm_leads не вызывай, остальных не трогай. ' +
    'Группа словами («кто спрашивал цену», «кто ждёт ответа», «новые», «кто платил», «писали за ' +
    'неделю», «кто просил позже», «горячие») — crm_leads с limit 50 и отбор по полям: next ' +
    '(reply/deliver/offer/talk/wait), stage (client/refused/later/talking/written/winback/new), ' +
    'signals (price/buy/service/urgency/objection), paid, days_since_their_last_word. ' +
    'Назови владельцу отобранных одной строкой каждый и готовь ОДНУ карточку за ход — по первому; ' +
    'следующий — после его кнопки: новая карточка заменяет прошлую, две сразу нельзя. Если никто не ' +
    'подходит — скажи «никого», первого попавшегося не бери. Отказ за 30 дней и «просил позже» — ' +
    'пропускай даже внутри группы. Пакетный обход по списку — команда /sweep у бота ' +
    '(/sweep ждут, /sweep горячие, /sweep @username), не ты.'
  )
}

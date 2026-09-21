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
  /*
   * THE PORTRAIT IS FIRST, AND IT IS THEIR FACE (owner, 2026-09-21).
   *
   * Two things this point used to leave open, and the seller filled both the
   * wrong way. A client with a package (crm_client_profile) got reels of the
   * package's template instead of the portrait, because the package read like
   * a newer, more specific instruction than "a gift for the first contact".
   * And a picture of a person could still come from a description or from the
   * owner's own avatar. Both are answered here, in the one place every seller
   * turn reads, rather than by a second rule somewhere that contradicts this.
   */
  const gift = who.giftIsDown
    ? '4. ПОДАРОК СЕЙЧАС НЕВОЗМОЖЕН: картинки не делаются (' +
      String(who.giftIsDown).slice(0, 80) +
      '). Не обещай портрет и не зови crm_deliver_photo. Ценность вперёд — ' +
      'словами: разбор его задачи, план по его же словам, честная цена.\n'
    : '4. Ценность вперёд — ЛИД-МАГНИТ: первому контакту, тому, кто просил фото, и тому, кто молчит ' +
      'после предложения, сделай подарок из ЕГО ЖЕ аватарки — портрет 9:16 в образе по его словам ' +
      '(crm_deliver_photo, gift по умолчанию: получатель не платит, платит владелец). Не описание ' +
      'услуги, а готовый пример с ним самим на картинке. Подпись: имя, кто сделал (ИИ-ассистент), ' +
      'один мягкий вопрос; без цены и ссылок. Один подарок на человека — второй уже платно. ' +
      'Портрет — ПЕРВЫЙ подарок и клиенту с пакетом: пакет задаёт только сцену и стиль портрета ' +
      '(визуальные токены, без запрещённых формулировок); рилс и остальное — после портрета. ' +
      'ЛИЦО ОБЯЗАТЕЛЬНО: человек на картинке для клиента — только его лицо через crm_deliver_photo ' +
      '(его аватарка или присланное им фото); не image_generate и не image_edit без его фото — они ' +
      'рисуют чужого. Нет ни фото, ни аватарки — crm_deliver_photo сам подготовит строку с просьбой ' +
      'прислать фото. «Портрет рисуется» — не делай второй: он придёт карточкой.\n'
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
    // promise-checked: waitingOn stops at maxNudges (default 2); crm-nudge-cap.test.ts
    'потом через 5; больше двух без ответа — стоп, это считает crm_waiting (nudges), не ты.\n' +
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
    '(/sweep ждут, /sweep горячие, /sweep @username), не ты.' +
    SENT_FILES_RULE
  )
}

/*
 * THE FILES THEY SENT ARE PART OF WHAT THEY SAID.
 *
 * Owner, 2026-09-22: a client sent photos for her content plan and the agent
 * answered as if she had sent nothing -- through tg_history they were empty
 * blocks, and nothing told the seller to open them. The frames now say what
 * is attached and tg_fetch_media opens it; this is the line that says to.
 *
 * The face rule is the owner's of the same day: every picture of a person
 * made for a client is img2img from that client's own face. It lives in ONE
 * place, point 4 (crm_deliver_photo: the gift ledger, the owner's Send/Cancel
 * card, the recipient's billing), and this point refers to it rather than
 * naming a second road. An earlier draft of this line sent the picture to
 * image_edit with the shelf link -- a tool that charges the owner, makes no
 * card and keeps no ledger (review of 2026-09-22). What opening her photos
 * adds is the description: it says which of them shows her face.
 *
 * The plan half says only what a tool can do. crm_client_plan READS her plan;
 * plan_item_* write the caller's own plan; nothing attaches a photo to a
 * client's item. So the seller names which photo fits which item -- in the
 * answer or on the card -- and does not claim it was filed.
 */
export const SENT_FILES_RULE =
  '\n9. Файлы человека — часть его слов. Прислал фото, голосовые или файлы после нашего ' +
  'последнего слова (crm_lead_context: their_files с after_our_last_word; tg_history: media) — ' +
  'СНАЧАЛА открой их: tg_fetch_media {chat, msg_ids или album}, и только потом отвечай. Фото ' +
  'для контент-плана: прочитай его план (crm_client_plan) и в ответе или на карточке назови, ' +
  'какое фото к какому пункту подходит — записать фото в его план инструмента нет, не говори, ' +
  'что записал. Картинка с ним — только по пункту 4, через crm_deliver_photo: лицо обязательно; ' +
  'не image_edit по ссылке с полки. Описание от tg_fetch_media говорит, на каком его фото видно ' +
  'лицо. Исчезающий файл (view-once) мы не открываем — не описывай и его. Не описывай фото, ' +
  'которое не открыл: «прислала фото» без tg_fetch_media — догадка, а не знание.'

/**
 * HOW TO SELL IN A DM, in the words the model reads before every turn.
 *
 * Written down so the owner can argue with it. The rules are the ones that
 * hold up in direct messages: context before pitch, one thought per message,
 * the person's own words as the hook, value before the invoice, a follow-up
 * cascade that stops, and nothing sent without the owner's button.
 */
import { OWNER_TELEGRAM_ID } from './telegram-tools'

/**
 * The owner's playbook, for the owner. Everybody else on the platform --
 * clients, other bots' owners -- would be told to call tools that refuse
 * them, and would start their turns with a refusal. So: empty for anyone
 * who is not the seller.
 */
export function salesPlaybook(who: {
  surface?: string
  telegramId?: string
}): string {
  if (String(who.telegramId ?? '') !== OWNER_TELEGRAM_ID) return ''
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
    '4. Ценность вперёд: если у человека есть токены или это первый контакт — сделай пример ' +
    '(crm_deliver_photo), а не описание.\n' +
    '5. Возражения: «дорого» — считай цену за результат, не за токен; «потом» — назначь дату и ' +
    // promise-checked: REFUSAL_HOLDS_DAYS, held by promisesMatchTheCode.test.ts
    'запиши crm_touch later; «не надо» — crm_touch refused и не возвращайся 30 дней.\n' +
    /*
     * promise-checked: NOTHING HOLDS THIS, AND THAT IS THE FINDING.
     *
     * The cascade asks the model to count: a reminder after two days, then
     * after five, and stop after two unanswered. No code measures any of it.
     * `waitingOn` reports how many days our last word has gone unanswered and
     * nothing counts reminders per person, so the rule holds only as long as
     * the model chooses to follow it -- and the model reads this brief fresh
     * every sweep, with no memory of how many times it has already nudged.
     *
     * Not fixed here on purpose: counting reminders is a feature (a touch
     * kind, or a counter beside the lead), and it decides what reaches a
     * client. Left named rather than quietly trusted.
     */
    // promise-checked: NOTHING HOLDS THIS -- the block above says why
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
    // promise-checked: REFUSAL_HOLDS_DAYS, held by promisesMatchTheCode.test.ts
    'подходит — скажи «никого», первого попавшегося не бери. Отказ за 30 дней и «просил позже» — ' +
    'пропускай даже внутри группы. Пакетный обход по списку — команда /sweep у бота ' +
    '(/sweep ждут, /sweep горячие, /sweep @username), не ты.'
  )
}

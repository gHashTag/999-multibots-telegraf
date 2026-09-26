/**
 * THE FIRST PRESS IN EACH SPECIALIST'S THREAD (#2958).
 *
 * The Blogger had four starters and the other agents had the general
 * assistant's. A thread that opens on the wrong questions teaches the person
 * that the agent does the wrong thing. Each list asks for a DRAFT or a
 * reading -- nothing here publishes, spends or sends on the first press.
 *
 * Every catalogued agent has an entry; a test in Chat's suite holds that.
 */
export const AGENT_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  blogger: [
    'Что сильного уже сделано, но ещё не опубликовано?',
    'Собери следующий пост EN/RU с хештегами и офером',
    'Проверь блог: где нет триптиха или полного текста?',
    'Подготовь контент-план для X, LinkedIn и Telegram',
  ],
  job: [
    'Кто из моих контактов нанимает? Покажи признаки',
    'Найди письма рекрутёров в почте за месяц',
    'Подготовь ответ рекрутёру карточкой — не отправляй',
    'Что нового для меня на hh.ru и LinkedIn?',
  ],
  google: [
    'Какой спрос в поиске на мою услугу? С источниками',
    'Кто мои конкуренты и что они предлагают?',
    'Каких ответов нет ни у кого — где пробел?',
    'Собери реестр источников по теме, которую я назову',
  ],
  tiktok: [
    'Дай 5 хуков на первые 2 секунды для моей идеи',
    'Напиши сценарий на 30 секунд и монтажный план',
    'Сколько токенов стоит собрать этот ролик?',
    'Подпись и хештеги, плюс вариант для A/B',
  ],
  scientist: [
    'Проверь утверждение: гипотеза, метод, доказательство',
    'Что уже опубликовано по этой теме? Только открытые источники',
    'Какие цифры в тексте без источника или команды?',
    'Черновик статьи с шагами воспроизведения',
  ],
  fpga: [
    'Разбери маршрут сборки trinity-fpga под Artix-7',
    'Что в проекте измерено, а что только заявлено?',
    'Составь ограничения XDC и распиновку для платы',
    'Оцени ресурсы и тайминги — с пометкой «оценка»',
  ],
  rtl: [
    'Напиши модуль на Verilog вместе с тестбенчем',
    'Проверь мой RTL: такты, сброс, крайние случаи',
    'Дай команду симуляции в iverilog или verilator',
    'Какие переходы между доменами тактов без синхронизатора?',
  ],
}

/**
 * WHO MAY OPEN AN AGENT'S THREAD, decided before the page draws. 'wait'
 * while an answer is still on its way (so a keeper is not bounced), the
 * agent's id when this person may talk to it -- live, a keeper's preview,
 * or a trainee that earned the market -- and 'market' otherwise. The
 * server's gate (render routes.ts threadFor) decides the same way. Pure.
 */
export function agentGate(g: {
  id: string
  status: string
  keeper: boolean | null
  earned: boolean | null
}): string | 'wait' | 'market' {
  if (g.status === 'live') return g.id
  if (g.keeper === null) return 'wait'
  if (g.keeper) return g.id
  if (g.earned === null) return 'wait'
  return g.earned ? g.id : 'market'
}

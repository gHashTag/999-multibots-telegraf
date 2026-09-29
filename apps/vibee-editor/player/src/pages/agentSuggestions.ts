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
  coder: [
    'Напиши функцию и прогони её через code_run на примерах',
    'Воспроизведи этот баг маленькой программой',
    'Проверь мой код: запусти и покажи настоящий вывод',
    'Объясни, что делает этот репозиторий',
  ],
}

/**
 * THE AGENT'S OWN REPEAT BUTTONS (owner, 2026-09-29: "let me repeat the
 * configured reel or the neuro-photo by template when the Blogger agent is
 * chosen -- and make a client gift again").
 *
 * A configured template is work the person has already set up once (the
 * story-reel template, the portrait style); these buttons bring it back in
 * ONE press instead of a description from memory. The press sends a prompt
 * into the agent's own thread -- and holds the same rule the starters above
 * hold: it asks for a READING or a card to confirm. The agent shows the
 * template and proposes the run as a card; the send is the second press.
 *
 * An agent with no configured template of its own has no entry; an agent
 * that gains one lights up wherever AGENT_TEMPLATES is read -- the fresh
 * thread and the agent panel both draw from here, nothing is copied.
 */
export interface AgentTemplate {
  /** Dictionary key of the button's label -- labels are interface text. */
  labelKey: string
  /** What the press sends, verbatim, into the agent's thread. */
  prompt: string
}

export const AGENT_TEMPLATES: Readonly<
  Record<string, readonly AgentTemplate[]>
> = {
  blogger: [
    {
      labelKey: 'chat.templates.reel',
      prompt:
        'Покажи мой настроенный шаблон рилс-истории: лицо, голос, стиль и следующий сюжет по плану. Предложи запуск карточкой — не запускай сам.',
    },
    {
      labelKey: 'chat.templates.photo',
      prompt:
        'Сделай нейро-фото по моему настроенному шаблону: моё лицо из шаблона, новое окружение, фирменный стиль. Покажи карточкой — не отправляй сам.',
    },
    {
      labelKey: 'chat.templates.gift',
      prompt:
        'Покажи, кому из моих клиентов ещё не подарено: портрет и рилс-историю. Предложи подарок карточкой — отправить должен я.',
    },
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

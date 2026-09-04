/**
 * В отслеживаемых файлах не должно быть настоящих ключей.
 *
 * Повод — живой замер: служебный ключ Supabase (`service_role`, полный доступ
 * к базе, действителен до 2035 года) лежал в пятнадцати файлах под `scripts/`,
 * проверено запросом — ключ работал. Плюс токены Fly.io в `CLAUDE.md`. К
 * 2026-08-23 всё это вычищено, список долга внизу пуст (кроме самих искалок).
 *
 * Репозиторий приватный, и это снижает остроту, но не убирает её: доступ есть
 * у всех участников, ключ уезжает в каждую копию, в резервные копии и в CI.
 *
 * Чистка файла НЕ отменяет ротацию: значения остались в истории коммитов.
 * Этот тест закрывает только будущее.
 *
 * Тест — последняя линия: он не чинит прошлое, но не даёт добавить новое.
 */
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs'

type Rule = [name: string, re: RegExp, why: string]

/**
 * ⚠️ ФЛАГ `i` У ПЕРВОГО ШАБЛОНА ОБЯЗАТЕЛЕН — НЕ УБИРАТЬ.
 *
 * Без него шаблон ищет только строчные `bot`/`token`, а токен присваивают
 * переменной ЗАГЛАВНЫМИ: `const BOT_TOKEN = '…'`. То есть слепое пятно
 * приходилось ровно на самый опасный случай — не на ссылку в базе, а на ключ,
 * зашитый в исходник.
 *
 * Замер на 2026-08-23, ДО чистки: добавление `i` дало ровно два новых файла
 * (`src/inngest_app/functions/monitoring/*.ts`), и в обоих лежал ДЕЙСТВУЮЩИЙ
 * токен бота. Тест при этом был зелёный. Проверка, зелёная при живом ключе в
 * отслеживаемом исходнике, хуже отсутствующей: она создаёт уверенность.
 *
 * Те два файла вычищены в том же заходе, так что сейчас `i` не добавляет ни
 * одной находки. Это не повод его убирать: он и нужен, чтобы `BOT_TOKEN = '…'`
 * не вернулся незамеченным.
 *
 * Известная дыра, которая ОСТАВАЛАСЬ и теперь ЗАКРЫТА (2026-08-23):
 * `docs/features/TELEGRAM_BOT_SETUP.md` пишет «Токен:» кириллицей, и ни `i`,
 * ни `bot` этого не ловили. Починено ОТДЕЛЬНЫМ шаблоном ниже — ровно так, как
 * было записано здесь, а не расширением ASCII-шаблона.
 *
 * ⚠️ ЧЕГО В ЭТОМ СПИСКЕ НЕ БЫЛО ВОВСЕ — И ЭТО БЫЛО ДОРОЖЕ ВСЕГО ОСТАЛЬНОГО.
 *
 * До 2026-08-23 здесь не было ни одного шаблона под машинную учётку Infisical.
 * А она не «ещё один ключ»: пара `INFISICAL_CLIENT_ID` +
 * `INFISICAL_CLIENT_SECRET` обменивается на токен, которым читаются ВСЕ 50+
 * секретов проекта разом — включая те самые токены ботов и служебные ключи
 * Supabase, которые вычищали предыдущие заходы. Тест отчитывался «чисто» про
 * замок, оставляя на виду ключ от всей связки.
 *
 * Это ровно тот случай, который осуждает комментарий к самопроверке ниже:
 * зелёная проверка при живой учётке хуже отсутствующей, потому что создаёт
 * уверенность.
 */
const PATTERNS: Rule[] = [
  /**
   * The four shapes below were enforced by the commit guard and unknown to
   * this test. A NEW such line would have been stopped; one already in the
   * tree would have been found by nobody. Measured: 4 of the guard's 15 rules
   * had neither pattern nor sample here -- and one of them, the connection
   * string, was added to the guard two iterations earlier by the same hand
   * that failed to add it here.
   */
  [
    'токен Slack',
    /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    'чтение и отправка сообщений в чужой workspace',
  ],
  [
    'приватный ключ (PEM)',
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    'вход на сервер по SSH или подпись от чужого имени',
  ],
  [
    'ключ Fal.ai',
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}/gi,
    'генерация за чужой счёт',
  ],
  [
    'строка подключения с паролем',
    /[a-z][a-z0-9+.-]*:\/\/[a-z0-9_.%-]+:[^@\s"'`/]{6,}@/gi,
    'полный доступ к базе',
  ],
  /**
   * Inngest signing key. NO dictionary in this repository knew the shape --
   * not the commit guard, not the history probe, not the database probe, not
   * this test. So "no new secrets in the repository" stayed green while
   * fourteen files carried keys, six of them PRODUCTION.
   *
   * Every real occurrence has a 64-hex tail; the threshold is 32 for slack,
   * and the truncated previews in the docs (16 and 2 characters) fall below
   * it -- correctly, a preview is not a secret.
   */
  [
    'подписывающий ключ Inngest',
    /signkey-(?:prod|test)-[a-f0-9]{32,}/gi,
    'подделка вызовов Inngest: чужой может выдать себя за платформу',
  ],
  [
    'токен бота Telegram',
    /(?:bot|token[=:"'\s]+)\d{8,10}:[A-Za-z0-9_-]{30,}/gi,
    'полное управление ботом',
  ],
  /**
   * Кириллическое «Токен:». Шаблон выше требует ASCII-приставку `bot`/`token`,
   * а в русской документации приставка русская — и токен проходил насквозь.
   *
   * `[^0-9\n]{0,12}` — окно под разделители («Токен: `», «Токен = "», «Токена —»)
   * БЕЗ цифр. Запрет цифр в окне не косметика: он гарантирует, что найденные
   * `\d{8,10}` — это НАЧАЛО токена, а не его хвост, иначе шаблон совпал бы со
   * сдвигом и отпечаток в отчёте указывал бы не на то место.
   */
  [
    'токен бота Telegram (кириллическое «Токен:»)',
    /токен[а-яё]*[^0-9\n]{0,12}\d{8,10}:[A-Za-z0-9_-]{30,}/gi,
    'полное управление ботом',
  ],
  /**
   * Машинная учётка Infisical — самая дорогая находка из возможных: это доступ
   * ко ВСЕМ остальным секретам сразу, поэтому её утечка обесценивает любую
   * чистку, сделанную до неё.
   *
   * Голые 64 hex БЕЗ имени рядом намеренно НЕ ищем: sha256 встречается в
   * контрольных суммах и фикстурах, и шаблон на голый hex утопил бы настоящую
   * находку в шуме. Инструмент, завышающий находки, обесценивает и настоящие.
   */
  [
    'машинная учётка Infisical',
    /(?:INFISICAL_CLIENT_SECRET|client[_-]?secret)["'\s]*[=:]["'\s]*[a-f0-9]{64}/gi,
    'доступ ко ВСЕМ 50+ секретам проекта разом',
  ],
  ['ключ xAI', /xai-[A-Za-z0-9_-]{40,}/gi, 'запросы к Grok за ваш счёт'],
  // Флаг `i` ниже добавлен там, где его не хватало. Замер на 2026-08-23: на
  // текущем дереве он не даёт НИ ОДНОГО нового файла — то есть ложных
  // срабатываний не вносит, — но закрывает формы `R8_…`, `SK_…` и hex
  // заглавными. `ключ AWS` намеренно ОСТАВЛЕН без `i`: настоящий AKIA всегда
  // заглавный, а `i` превратил бы `[0-9A-Z]{16}` в «любые 16 букв-цифр» и дал
  // бы совпадения внутри обычных base64-блобов.
  ['ключ Replicate', /r8_[A-Za-z0-9]{35,}/gi, 'генерации за ваш счёт'],
  ['ключ OpenAI', /sk-[A-Za-z0-9]{32,}/gi, 'запросы за ваш счёт'],
  ['ключ Anthropic', /sk-ant-[A-Za-z0-9_-]{30,}/gi, 'запросы за ваш счёт'],
  ['ключ ElevenLabs', /sk_[a-f0-9]{40,}/gi, 'синтез речи за ваш счёт'],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/g, 'доступ к хранилищу'],
  ['токен GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/gi, 'доступ к репозиторию'],
  [
    'служебный ключ Supabase',
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g,
    'полный доступ к базе',
  ],
  ['токен Fly.io', /fm2_[A-Za-z0-9+/=]{40,}/gi, 'управление развёртыванием'],
]

/**
 * Файлы, где ключи уже лежат. Список — не индульгенция, а фиксация долга:
 * тест не даёт добавить НОВЫЕ места, пока эти не вычищены.
 *
 * ⚠️ ЗАПИСЬ И ЧИСТКА — ОДНИМ ЗАХОДОМ. Третья проверка внизу падает на записи,
 * пережившей свою причину, и это сделано нарочно: запись, которая осталась
 * после чистки файла, молча прикроет следующий ключ, попавший в тот же файл.
 * Поэтому вычистили файл — сразу убрали строку отсюда.
 *
 * История списка (2026-08-23): здесь стояли шестнадцать записей — `CLAUDE.md`
 * с токенами Fly.io и пятнадцать скриптов под `scripts/`. Все вычищены, все
 * записи убраны. Заодно снята неверная пометка: семь файлов в
 * `scripts/financial/` были подписаны «служебный ключ Supabase — РАБОТАЕТ», а
 * на деле там лежал ключ роли `anon` от удалённого проекта. Подпись,
 * завышающая опасность, обесценивает список ровно так же, как занижающая.
 *
 * Осталось три записи — сами искалки. Их значения выдуманы и должны такими
 * остаться, см. `SELF_CHECK` ниже.
 */
const KNOWN_DEBT: Record<string, string> = {
  /*
   * Five files surfaced by adding the four shapes the commit guard enforced
   * and this test did not know. Each was read: two carry real passwords and
   * await rotation (owner item 19), three match legitimately.
   */
  'apps/vibee-editor/player/api-server.js':
    'НАСТОЯЩИЙ пароль Railway запасным значением -- пункт 19 владельцу',
  'scripts/financial/run_cleanup.js':
    'НАСТОЯЩИЙ пароль литералом -- пункт 19 владельцу',
  '.env.local.example':
    'пример: и хост, и порт -- подстановки HOST/PORT, пароля нет',
  'docker-compose.test.yml':
    'учётка тестового контейнера, живёт только внутри compose',
  'src/inngest_app/functions/render/helpers/ssh.service.ts':
    'не ключ, а ОБЁРТКА BEGIN/END вокруг значения из SSH_KEY_STRING; без переменной бросает',
  /*
   * Inngest signing keys. NOT an indulgence: they are listed because deleting
   * a line does not undo a leak -- the keys are in git history, and the only
   * fix is ROTATION (owner item 20). Recorded so the debt is named: before the
   * pattern above existed, this test was green while fourteen files carried
   * keys, three of them production.
   */
  'docs/features/INNGEST_IMPORTANT_RULES.md':
    'ПРОДОВЫЕ подписывающие ключи Inngest -- пункт 20 владельцу',
  'docs/features/INNGEST_PRODUCTION_SECRETS.md':
    'ПРОДОВЫЙ подписывающий ключ Inngest -- пункт 20 владельцу',
  'scripts/inngest/fix-inngest-production-secrets.js':
    'ПРОДОВЫЕ подписывающие ключи Inngest -- пункт 20 владельцу',
  'scripts/database/check-loaded-keys.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/financial/check-inngest-keys.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/financial/test-production-keys.sh':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/financial/update-bot-inngest-keys.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/financial/update-inngest-keys-production.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/financial/update_keys.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/financial/update_keys.sh':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/inngest/add-inngest-keys-to-infisical.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/inngest/add-inngest-secrets.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/inngest/fix-inngest-with-keys.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/inngest/update-inngest-keys-infisical.js':
    'тестовый подписывающий ключ Inngest -- пункт 20',
  'scripts/probe-secrets-in-db.cjs':
    'образцы для самопроверки, значения выдуманы',
  'scripts/probe-secrets-in-history.cjs':
    'образцы для самопроверки, значения выдуманы',
  'src/__tests__/security/no-secrets-in-repo.test.ts':
    'этот файл: образцы для самопроверки',
}

/**
 * Образцы, на которых шаблоны ОБЯЗАНЫ срабатывать.
 *
 * ⚠️ ВСЕ ЗНАЧЕНИЯ ВЫДУМАНЫ И ДОЛЖНЫ ОСТАВАТЬСЯ ВЫДУМАННЫМИ. Шаблон проверяет
 * ФОРМУ, поэтому настоящее значение здесь ничего не добавляет к проверке, зато
 * утекает вместе с репозиторием. В номере бота раньше стоял идентификатор
 * действующего бота (секретная половина и тогда была выдумана) → 1111111111.
 * Правите образец — сохраняйте длину и форму, иначе шаблон перестанет
 * совпадать и самопроверка пройдёт вхолостую.
 *
 * ⚠️ ПОМЕТКА `secret-guard-ok` СТАВИТСЯ НА ТУ ЖЕ ФИЗИЧЕСКУЮ СТРОКУ, ЧТО И
 * ЗНАЧЕНИЕ. `scripts/security-token-guard.sh` разбирает вывод `grep -n`, то
 * есть отбрасывает совпадение ТОЛЬКО если пометка стоит в той же строке;
 * обещание «на той же или предыдущей» в его шапке кодом не подкреплено.
 * Здесь пометка раньше стояла на строке `],`, а prettier с `printWidth: 80`
 * перенёс значение на отдельную строку — и пометка перестала работать. Ставим
 * её хвостовым комментарием прямо за литералом: prettier такие комментарии не
 * отрывает.
 */
const SELF_CHECK: Array<[string, string]> = [
  [
    'токен Slack',
    'xoxb-qqqqqqqqqqqq-qqqqqqqqqqqq', // secret-guard-ok: invented self-check sample
  ],
  [
    'приватный ключ (PEM)',
    '-----BEGIN OPENSSH PRIVATE KEY-----', // secret-guard-ok: invented self-check sample
  ],
  [
    'ключ Fal.ai',
    '00000000-0000-0000-0000-000000000000:00000000000000000000000000000000', // secret-guard-ok: invented self-check sample
  ],
  [
    'строка подключения с паролем',
    'postgresql://user:notarealpw123@host.example.com/db', // secret-guard-ok: invented self-check sample
  ],
  [
    'подписывающий ключ Inngest',
    'signkey-prod-deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // secret-guard-ok: invented self-check sample
  ],
  [
    'токен бота Telegram',
    'bot1111111111:AAHqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ Replicate',
    'r8_qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ AWS',
    'AKIAQQQQQQQQQQQQQQQQ', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'токен GitHub',
    'ghp_qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ OpenAI',
    'sk-qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ Anthropic',
    'sk-ant-qqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ ElevenLabs',
    'sk_abcdef0123abcdef0123abcdef0123abcdef0123', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'служебный ключ Supabase',
    'eyJqqqqqqqqqqqqqqqqqqqq.eyJqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq.qqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'токен Fly.io',
    'fm2_qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'токен бота Telegram (кириллическое «Токен:»)',
    'Токен: 1111111111:AAHqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'машинная учётка Infisical',
    'INFISICAL_CLIENT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // secret-guard-ok: выдуманные 64 hex по порядку, не значение
  ],
  [
    'ключ xAI',
    'XAI_API_KEY=xai-qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', // secret-guard-ok: выдуманный образец самопроверки
  ],
]

/**
 * ⚠️ ОБРАТНАЯ СТОРОНА САМОПРОВЕРКИ, БЕЗ КОТОРОЙ ОНА ПОЛОВИНЧАТА.
 *
 * `SELF_CHECK` доказывает, что шаблон СРАБАТЫВАЕТ. Он не доказывает, что
 * шаблон различает секрет и не-секрет: шаблон `/./` прошёл бы `SELF_CHECK`
 * целиком и при этом пометил бы весь репозиторий. Такой шаблон не поймали бы
 * ни один из трёх тестов ниже — они бы просто начали падать везде, и первым
 * побуждением было бы занести половину файлов в `KNOWN_DEBT`, то есть
 * ослепить проверку её же руками.
 *
 * Поэтому здесь строки, на которых НИ ОДИН шаблон срабатывать не должен: это
 * настоящие формы из этого репозитория — плейсхолдеры документации, ссылки на
 * переменные окружения, sha256. Если правка шаблона зацепит их — падает эта
 * проверка, а не доверие к отчёту.
 */
const NEGATIVE_CHECK: string[] = [
  // Плейсхолдер из docs/features/TELEGRAM_BOT_SETUP.md — дословно.
  '- ✅ Токен: `1234567890:AA-ПРИМЕР-НЕ-НАСТОЯЩИЙ-ТОКЕН` — это плейсхолдер, а не рабочее значение',
  'Токен хранится в Infisical, в репозитории его нет',
  'INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}',
  'INFISICAL_CLIENT_SECRET=<взять: infisical secrets get INFISICAL_CLIENT_SECRET>',
  'const clientSecret = process.env.INFISICAL_CLIENT_SECRET',
  // sha256 без имени секрета рядом — контрольная сумма, а не учётка.
  'sha256 = 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'const apiKey = process.env.XAI_API_KEY // база: https://api.x.ai/v1',
  'BOT_TOKEN=<взять: infisical secrets get BOT_TOKEN_1>',
]

/**
 * Файлы под контролем версий.
 *
 * ОБЯЗАТЕЛЬНО `-z`. Без него git ЭКРАНИРУЕТ имена с не-ASCII символами:
 *
 *   "scripts/financial/\320\237\320\236\320\233\320\243\320\247..."
 *
 * Такое имя не открывается, проверка `fs.existsSync` его отбрасывает, и файл
 * молча выпадает из осмотра. Так из осмотра выпадали 50 файлов, и в четырёх из
 * них лежит служебный ключ базы. Найдено при попытке проверить, актуален ли
 * пункт «ключ в 11 файлах»: их оказалось 15.
 *
 * `-z` разделяет имена нулевым байтом и ничего не экранирует.
 */
function trackedFiles(): string[] {
  return execSync('git ls-files -z', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
}

describe('в репозитории нет новых секретов', () => {
  it('самопроверка: шаблоны срабатывают на заведомых образцах', () => {
    // Без этого «ничего не найдено» ничего не значит. Прошлая искалка нашла
    // ноль из-за границы слова в шаблоне — и это едва не ушло как хорошая
    // новость.
    const broken: string[] = []
    for (const [name, sample] of SELF_CHECK) {
      const rule = PATTERNS.find(p => p[0] === name)
      if (!rule) {
        broken.push(`${name}: шаблона нет`)
        continue
      }
      rule[1].lastIndex = 0
      if (!sample.match(rule[1])) broken.push(`${name}: не сработал`)
    }
    expect(broken).toEqual([])
  })

  it('самопроверка: на чистых строках не срабатывает ни один шаблон', () => {
    // Проверка в обратную сторону. Шаблон, который ловит всё, проходит
    // проверку выше и при этом бесполезен: он заставит занести пол-репозитория
    // в KNOWN_DEBT и тем самым ослепит и настоящие правила.
    const falsePositives: string[] = []
    for (const clean of NEGATIVE_CHECK) {
      for (const [name, re] of PATTERNS) {
        re.lastIndex = 0
        if (re.test(clean)) {
          falsePositives.push(`${name} ← «${clean.slice(0, 60)}…»`)
        }
      }
    }
    expect(falsePositives).toEqual([])
  })

  it('каждый шаблон закрыт образцом самопроверки', () => {
    // Правило без образца ничем не лучше отсутствующего: никто не знает,
    // срабатывает ли оно вообще. Именно так в этом файле годами жили шаблоны,
    // а машинная учётка Infisical не имела шаблона вовсе.
    const uncovered = PATTERNS.map(p => p[0]).filter(
      name => !SELF_CHECK.some(([sampleName]) => sampleName === name)
    )
    expect(uncovered).toEqual([])
  })

  it('нет секретов в файлах вне списка известного долга', () => {
    const unexplained: string[] = []

    for (const f of trackedFiles()) {
      if (KNOWN_DEBT[f]) continue
      if (!fs.existsSync(f)) continue
      const st = fs.statSync(f)
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue

      let text: string
      try {
        text = fs.readFileSync(f, 'utf8')
      } catch {
        continue
      }

      for (const [name, re] of PATTERNS) {
        re.lastIndex = 0
        if (re.test(text)) unexplained.push(`${f} — ${name}`)
      }
    }

    expect(unexplained).toEqual([])
    // 30s, not the 5s default. This walks every tracked file and reads each
    // one; alone it takes about two seconds, and under a loaded full-suite run
    // it crossed the default and timed out. That is what the gate reported as
    // a flaky test in it.136 and what silently dropped this name from the
    // snapshot on a --save: a security check can be lost by being slow.
  }, 30_000)

  it('в списке долга нет файлов, которые уже вычищены', () => {
    // Запись, пережившая свою причину, молча прикроет следующую ошибку.
    const stale: string[] = []
    for (const f of Object.keys(KNOWN_DEBT)) {
      if (!fs.existsSync(f)) {
        stale.push(`${f}: файла нет`)
        continue
      }
      const text = fs.readFileSync(f, 'utf8')
      const hit = PATTERNS.some(([, re]) => {
        re.lastIndex = 0
        return re.test(text)
      })
      if (!hit) stale.push(`${f}: секретов больше нет — убрать из списка`)
    }
    expect(stale).toEqual([])
  })
})

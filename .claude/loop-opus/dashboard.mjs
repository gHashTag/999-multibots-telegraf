#!/usr/bin/env node
/**
 * Дашборд собирается ИЗ STATE.json, а не пишется руками.
 *
 * ЗАЧЕМ. Прошлая версия была рукописным HTML на 1411 строк. Обновить её
 * после итерации значило переписать простыню целиком — и это единственная
 * часть цикла, которую хотелось пропустить, когда контекст на исходе.
 * Панель, которую дорого обновлять, устаревает первой.
 *
 * Теперь итерация правит STATE.json (несколько строк) и зовёт этот файл.
 *
 *   node .claude/loop-opus/dashboard.mjs
 *
 * Читает: STATE.json, anomalies-last.json (если есть).
 * Пишет:  dashboard.html — его и публикуем артефактом.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Состояние ищем возле ОСНОВНОГО чекаута, а не возле этой копии скрипта.
 *
 * У оснастки две копии — в основном дереве и в worktree, — и запуск из
 * второй искал STATE.json рядом с собой. Файл там отсутствует намеренно
 * (состояние прогона в .gitignore), поэтому панель просто не собиралась.
 * Ровно та же ошибка на такте раньше стоила guard.sh получаса простоя:
 * состояние нельзя якорить к пути скрипта, если скрипт может размножиться.
 */
import { execFileSync } from 'node:child_process'

const рядом = path.dirname(fileURLToPath(import.meta.url))
let here = рядом
try {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: рядом,
    encoding: 'utf8',
  }).trim()
  const корень = path.resolve(рядом, common, '..')
  const кандидат = path.join(корень, '.claude', 'loop-opus')
  if (fs.existsSync(path.join(кандидат, 'STATE.json'))) here = кандидат
} catch {
  /* не репозиторий — работаем рядом с собой */
}
const читать = f => {
  try {
    return JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'))
  } catch {
    return null
  }
}

const S = читать('STATE.json')
if (!S) {
  console.error('❌ STATE.json не прочитан — дашборд не собран')
  process.exit(1)
}
const A = читать('anomalies-last.json')

/**
 * Аномалии лежат в ИСТОРИИ, последняя запись — свежая.
 *
 * Первая версия этой строки читала `A.anomalies` — ключа с таким именем в
 * файле нет вовсе. Панель показала «0 аномалий» ровно в тот момент, когда
 * сканер двумя строками выше напечатал «АНОМАЛИЙ: 2». Молчаливый ноль —
 * худший вид отчёта: он неотличим от «всё хорошо».
 *
 * Поэтому здесь не `|| []`, а явный отказ собирать панель. Дашборд, который
 * не смог прочитать состояние, обязан не выйти, а не выйти пустым.
 */
function свежиеАномалии() {
  if (!A) return [] // файла нет — сканер ещё не бегал
  const h = A.history
  if (!Array.isArray(h)) {
    console.error(
      '❌ anomalies-last.json прочитан, но в нём нет массива history.\n' +
        `   Есть ключи: ${Object.keys(A).join(', ') || '(пусто)'}\n` +
        '   Панель не собрана: показать 0 аномалий, не сумев их прочитать,\n' +
        '   опаснее, чем не показать ничего.'
    )
    process.exit(1)
  }
  return h.length ? h[h.length - 1].anomalies || [] : []
}

/** Экранирование: в заметках встречаются < и & из кода. */
const э = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Ссылка на PR — чтобы из панели можно было провалиться в изменение. */
const пр = n =>
  `<a class="пр" href="https://github.com/gHashTag/999-multibots-telegraf/pull/${n}">#${n}</a>`

const аномалии = свежиеАномалии()
/**
 * КЛЮЧИ, КОТОРЫХ ПАНЕЛЬ НЕ ЧИТАЕТ, — ЭТО ПОТЕРЯННАЯ РАБОТА.
 *
 * Несколько витков я писал в STATE.json поля `merged`, `landed`,
 * `selfCritiques`, `anomalies` — и ни одного из них панель не смотрит. Она
 * исправно показывала СТАРЫЕ числа и выглядела при этом правдивой: заголовок
 * менялся, витки шли, а список влитого стоял на месте.
 *
 * Молчание здесь хуже ошибки. Поэтому: любой ключ верхнего уровня, который
 * панель не читает, называется вслух при каждой сборке.
 */
const ЧИТАЕМЫЕ = new Set([
  'loop',
  'cronJob',
  'cadenceMinutes',
  'iteration',
  'status',
  'namespace',
  'worktree',
  'branch',
  'dashboard',
  'tools',
  'collisionPolicy',
  'measured',
  'incidents',
  'shipped',
  'blocked',
  'backlog',
  'selfCritique',
  'updatedAt',
])
/**
 * ФОРМА ЗАПИСЕЙ, А НЕ ТОЛЬКО ИМЕНА КЛЮЧЕЙ.
 *
 * Ворота выше ловят ключ, которого панель не читает. Они НЕ поймали второй
 * случай того же класса: ключ `shipped` верный, а внутри записи поля назывались
 * `what`/`how` вместо `что`/`проверено`. Панель нарисовала восемь ссылок на PR
 * с пустым текстом — и это выглядело как «правки без описания», а не как
 * потерянные данные.
 *
 * Урок: проверять надо не только куда пишут, но и ЧЕМ. Пустая строка там, где
 * ждали текст, — это молчание, а молчание здесь неотличимо от правды.
 */
/**
 * The same shape check, for blocked.
 *
 * The shipped guard was added after eight rows rendered as bare links with no
 * text. It did not help the very next time, because blocked reads different
 * field names and three rows printed "-- undefined" instead. A guard that
 * covers one collection and not its neighbours teaches the wrong lesson: that
 * the problem was that key, rather than the class.
 */
const кривыеБлокеры = (S.blocked || []).filter(b => !b['что'] || !b['причина'])
if (кривыеБлокеры.length) {
  console.error(
    `\n  ВНИМАНИЕ: ${кривыеБлокеры.length} записей в blocked без «что»/«причина».\n` +
      `  Ожидаются поля: что, причина, чтоНужно.\n` +
      `  Найдено вместо них: ${[...new Set(кривыеБлокеры.flatMap(Object.keys))].join(', ')}\n`
  )
}

const безТекста = (S.shipped || []).filter(x => !x['что'])
if (безТекста.length) {
  console.error(
    `\n  ВНИМАНИЕ: ${безТекста.length} записей в shipped без поля «что» —` +
      ` они выйдут пустыми строками.\n  Ожидаются поля: что, проверено, pr.\n` +
      `  Найдено вместо них: ${[...new Set(безТекста.flatMap(Object.keys))].join(', ')}\n`
  )
}

const лишние = Object.keys(S).filter(k => !ЧИТАЕМЫЕ.has(k))
if (лишние.length) {
  console.error(
    `\n  ВНИМАНИЕ: в STATE.json есть ключи, которых панель НЕ читает:\n` +
      лишние.map(k => `    ${k}`).join('\n') +
      `\n  Написанное в них не попадёт на экран. Перенесите в читаемый ключ.\n`
  )
}

const ждутВладельца = (S.blocked || []).length + аномалии.length

/**
 * Состояние одним словом. Разделение намеренное: «сломано у меня» и
 * «упёрлось во владельца» — разные вещи, и смешивать их в один индикатор
 * значит будить человека там, где он не нужен.
 */
const состояние = аномалии.some(a => /ПРИ ЖИВЫХ|перезапис|пуст/i.test(a))
  ? { к: 'тревога', т: 'нужен разбор' }
  : ждутВладельца
    ? { к: 'ждёт', т: 'ждёт владельца' }
    : { к: 'ровно', т: 'всё ровно' }

const карточка = (значение, подпись, класс = '') =>
  `<div class="карта ${класс}"><b>${э(значение)}</b><span>${э(подпись)}</span></div>`

/**
 * `x.к` — класс светофора на левой полоске. Он вычислялся и терялся: helper
 * рисовал голый <li>. Цвет, который посчитан и не доехал до разметки, — это
 * ровно тот случай, когда код выглядит рабочим и ничего не делает.
 */
const список = (массив, разметка, пусто) =>
  массив.length
    ? `<ol class="лента">${массив
        .map(x => `<li class="${(x && x.к) || ''}">${разметка(x)}</li>`)
        .join('')}</ol>`
    : `<p class="пусто">${э(пусто)}</p>`

const отгружено = (S.shipped || []).slice(0, 8)
const самокритика = (S.selfCritique || []).slice(0, 6)
const бэклог = (S.backlog || []).slice(0, 6)

const html = `<title>Цикл ${э(S.iteration)} — ${э(состояние.т)}</title>
<style>
  /* Палитра названа, а не унаследована: чернильная база с холодным уклоном,
     пергаментный текст и ОДИН акцент — янтарь оставленной на ночь лампы.
     Светофор (годно/ждёт/тревога) держится отдельно от акцента. */
  :root{
    --фон:#faf8f4; --над:#ffffff; --кант:#e2ddd2;
    --текст:#1a1814; --тихо:#6b655a;
    --акцент:#b26b00; --акцент-фон:#fdf3e2;
    --годно:#2f6b3f; --ждёт:#8a6a12; --тревога:#a3301f;
    --мон:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark){
    :root{
      --фон:#12110f; --над:#1a1815; --кант:#2e2a24;
      --текст:#ece6da; --тихо:#8f887a;
      --акцент:#f0a93c; --акцент-фон:#241b0c;
      --годно:#6fbf7f; --ждёт:#dcb64a; --тревога:#e8705c;
    }
  }
  :root[data-theme=dark]{
    --фон:#12110f; --над:#1a1815; --кант:#2e2a24;
    --текст:#ece6da; --тихо:#8f887a;
    --акцент:#f0a93c; --акцент-фон:#241b0c;
    --годно:#6fbf7f; --ждёт:#dcb64a; --тревога:#e8705c;
  }
  :root[data-theme=light]{
    --фон:#faf8f4; --над:#ffffff; --кант:#e2ddd2;
    --текст:#1a1814; --тихо:#6b655a;
    --акцент:#b26b00; --акцент-фон:#fdf3e2;
    --годно:#2f6b3f; --ждёт:#8a6a12; --тревога:#a3301f;
  }

  /* Вся панель моноширинная — это телеметрия, а не статья. Иерархию несут
     вес и размер, а не смена гарнитуры. */
  body{margin:0;background:var(--фон);color:var(--текст);font-family:var(--мон);
       font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .обёртка{max-width:1080px;margin:0 auto;padding:28px 20px 64px;
           display:flex;flex-direction:column;gap:28px}

  header{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 16px;
         border-bottom:1px solid var(--кант);padding-bottom:16px}
  h1{margin:0;font-size:26px;font-weight:700;letter-spacing:-.02em}
  .сейчас{font-size:12px;color:var(--тихо);letter-spacing:.08em;text-transform:uppercase}
  .значок{margin-left:auto;font-size:12px;letter-spacing:.06em;text-transform:uppercase;
          padding:5px 12px;border-radius:999px;border:1px solid currentColor;font-weight:600}
  .значок.ровно{color:var(--годно)} .значок.ждёт{color:var(--ждёт)}
  .значок.тревога{color:var(--тревога)}

  .карты{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(148px,1fr))}
  .карта{background:var(--над);border:1px solid var(--кант);border-radius:10px;
         padding:14px 16px;display:flex;flex-direction:column;gap:3px}
  .карта b{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
  .карта span{font-size:11px;color:var(--тихо);letter-spacing:.05em;text-transform:uppercase}
  .карта.акцент{background:var(--акцент-фон);border-color:var(--акцент)}
  .карта.акцент b{color:var(--акцент)}

  section{background:var(--над);border:1px solid var(--кант);border-radius:12px;padding:18px 20px}
  h2{margin:0 0 4px;font-size:15px;font-weight:700;letter-spacing:-.01em}
  .подзаг{margin:0 0 14px;font-size:12px;color:var(--тихо)}

  .колонки{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
  .лента{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
  .лента li{padding-left:14px;border-left:2px solid var(--кант);font-size:13px}
  .лента li.горит{border-left-color:var(--тревога)}
  .лента li.ждёт{border-left-color:var(--ждёт)}
  .лента li.годно{border-left-color:var(--годно)}
  .пусто{color:var(--тихо);font-size:13px;margin:0}
  .чем{display:block;margin-top:3px;color:var(--тихо);font-size:12px}
  .пр{color:var(--акцент);text-decoration:none;font-weight:600}
  .пр:hover{text-decoration:underline}
  a:focus-visible,.пр:focus-visible{outline:2px solid var(--акцент);outline-offset:2px}

  footer{color:var(--тихо);font-size:12px;text-align:center;border-top:1px solid var(--кант);padding-top:16px}
  @media (max-width:520px){h1{font-size:21px}.карта b{font-size:23px}}
</style>

<div class="обёртка">
  <header>
    <h1>Цикл ${э(S.iteration)}</h1>
    <span class="сейчас">каждые ${э(S.cadenceMinutes)} мин · ${э(S.updatedAt)}</span>
    <span class="значок ${состояние.к}">${э(состояние.т)}</span>
  </header>

  <div class="карты">
    ${карточка((S.shipped || []).length, 'правок влито')}
    ${карточка((S.measured || []).length, 'замеров')}
    ${карточка((S.selfCritique || []).length, 'своих ошибок')}
    ${карточка(аномалии.length, 'аномалий', аномалии.length ? 'акцент' : '')}
    ${карточка((S.backlog || []).length, 'в очереди')}
  </div>

  <section>
    <h2>Что мешает прямо сейчас</h2>
    <p class="подзаг">Всё это упёрлось во владельца — деньгами или ключом. Я обойти не могу.</p>
    ${список(
      [
        ...аномалии.map(a => ({ т: a, к: 'горит' })),
        ...(S.blocked || []).map(b => ({
          т: `${b.что} — ${b.причина}`,
          ч: b.чтоНужно,
          к: 'ждёт',
        })),
      ],
      x =>
        `<span>${э(x.т)}</span>${x.ч ? `<span class="чем">нужно: ${э(x.ч)}</span>` : ''}`,
      'ничего не мешает'
    )}
  </section>

  <div class="колонки">
    <section>
      <h2>Влито</h2>
      <p class="подзаг">Последние ${отгружено.length} из ${(S.shipped || []).length}.</p>
      ${список(
        отгружено,
        x =>
          `<span>${x.pr ? `${пр(x.pr)} ` : ''}${э(x.что)}</span>` +
          (x.проверено
            ? `<span class="чем">проверено: ${э(x.проверено)}</span>`
            : ''),
        'пока пусто'
      )}
    </section>

    <section>
      <h2>Где я был неправ</h2>
      <p class="подзаг">Своим ошибкам здесь та же ширина, что и успехам — иначе панель врёт.</p>
      ${список(самокритика, x => `<span>${э(x)}</span>`, 'нечего добавить')}
    </section>
  </div>

  <section>
    <h2>Очередь</h2>
    <p class="подзаг">Ближайшие ${бэклог.length} из ${(S.backlog || []).length}.</p>
    ${список(бэклог, x => `<span>${э(x.что || x)}</span>`, 'очередь пуста')}
  </section>

  <footer>
    ветка ${э(S.branch)} · крон ${э(S.cronJob)} · собрано из STATE.json
  </footer>
</div>
`

fs.writeFileSync(path.join(here, 'dashboard.html'), html)
console.log(
  `✅ дашборд собран: цикл ${S.iteration}, ${состояние.т}, ` +
    `${(S.shipped || []).length} правок, ${аномалии.length} аномалий`
)

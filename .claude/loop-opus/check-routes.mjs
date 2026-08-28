#!/usr/bin/env node
/**
 * Сверка: какие адреса зовёт КЛИЕНТ и какие обслуживает СЕРВЕР.
 *
 * ЗАЧЕМ. В ленте мини-аппа кнопка с корзиной звала `DELETE /api/feed/:id`.
 * Такого обработчика в render-server.ts не было вовсе — кнопка не работала
 * ни разу с момента, как её нарисовали. Человек жал, подтверждал, видел
 * крутилку и ничего не получал.
 *
 * Ни типы, ни сборка такого не ловят: клиент и сервер связаны только строкой
 * с адресом. Значит связь надо проверять отдельно — вот этим.
 *
 *   node .claude/loop-opus/check-routes.mjs
 *
 * ЧТО ЭТО НЕ ДОКАЗЫВАЕТ. Совпадение адреса не значит, что ручка работает:
 * заголовки, права и тело она может отвергнуть. Это поиск ОБРЫВОВ, а не
 * проверка поведения. Зато обрыв здесь — приговор без оговорок.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '..', '..')
const PLAYER = path.join(REPO, 'apps/vibee-editor/player/src')
const IOS = path.join(REPO, 'apps/vibee-ios/Vibee')
const SERVER = path.join(REPO, 'apps/vibee-editor/render/render-server.ts')

/** Все .ts/.tsx под каталогом. */
function файлы(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...файлы(p))
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * Вызовы клиента. Ищем и apiFetch, и голый fetch: второй сам по себе
 * подозрителен (шлёт не те заголовки), но для обрывов важен любой.
 */
const вызовы = []
for (const f of файлы(PLAYER)) {
  const s = fs.readFileSync(f, 'utf8')
  const re = /(?:apiFetch|fetch)\(\s*`([^`]*\/api\/[^`]*)`([^)]*)/g
  let m
  while ((m = re.exec(s))) {
    const путь = m[1]
      .replace(/\$\{[^}]*\}/g, ':x') // ${id} → :x
      .replace(/^.*?(\/api\/)/, '$1') // отрезаем ${API_BASE}
      .split('?')[0]
    const метод = /method:\s*['"](\w+)['"]/.exec(m[2])?.[1] || 'GET'
    вызовы.push({ путь, метод, файл: path.relative(REPO, f), сырой: m[0] })
  }
}

/**
 * ВЫЗОВЫ НАТИВНОГО ПРИЛОЖЕНИЯ — та же сверка, другой язык.
 *
 * Приложение ходит на тот же сервер, и обрыв там стоит того же. Проверено
 * дорого: чат агента слал запрос вообще без заголовка личности, сервер
 * отвечал 401, а на экране оставался пустой пузырь. Сверка адресов такого не
 * поймала бы — адрес существует, — но она поймает следующий случай, когда
 * приложение позовёт то, чего на сервере нет.
 *
 * Swift не даёт единой формы вызова: путь может лежать в
 * `appendingPathComponent("api/…")` или в литерале URL. Берём оба.
 */
if (fs.existsSync(IOS)) {
  for (const f of fs.readdirSync(IOS).filter(n => n.endsWith('.swift'))) {
    const текст = fs.readFileSync(path.join(IOS, f), 'utf8')
    for (const m of текст.matchAll(/["'](\/?api\/[a-zA-Z0-9_/-]+)["']/g)) {
      const путь = m[1].startsWith('/') ? m[1] : `/${m[1]}`
      // Метод в Swift задаётся отдельной строкой; для поиска обрывов он не
      // нужен — важно лишь, обслуживается ли адрес вообще.
      вызовы.push({
        путь,
        метод: /httpMethod\s*=\s*"(\w+)"/.test(текст) ? 'ANY' : 'GET',
        файл: path.relative(REPO, path.join(IOS, f)),
        сырой: m[0],
      })
    }
  }
}

/**
 * Обработчики сервера. Файл — один большой if-каскад по req.url и req.method,
 * поэтому берём именно эти сравнения, а не воображаемый роутер.
 */
const текстСервера = fs.readFileSync(SERVER, 'utf8')
const адресаСервера = new Set()
{
  // Литералы вида '/api/...' в сравнениях, startsWith и match.
  const re = /['"`](\/api\/[a-zA-Z0-9_\-/:.]*)['"`]/g
  let m
  while ((m = re.exec(текстСервера))) адресаСервера.add(m[1].split('?')[0])
  // Маршруты, заданные регуляркой: /^\/api\/feed\/(\d+)$/ — берём
  // осмысленный префикс до первой скобки.
  const rr = /\^\\\/api((?:\\\/[a-zA-Z0-9_-]+)*)/g
  while ((m = rr.exec(текстСервера)))
    адресаСервера.add(`/api${m[1].replace(/\\\//g, '/')}`)
}

/** Совпадает ли путь клиента с каким-нибудь адресом сервера. */
const естьНаСервере = путь => {
  const части = путь.split('/').filter(Boolean)
  for (const адрес of адресаСервера) {
    const ач = адрес.split('/').filter(Boolean)
    if (!ач.length) continue
    // Префиксное совпадение: сервер часто ловит startsWith('/api/feed').
    if (путь === адрес || путь.startsWith(`${адрес}/`)) return true
    if (ач.length !== части.length) continue
    if (ач.every((c, i) => c === части[i] || c === ':x' || /^[:(]/.test(c)))
      return true
  }
  return false
}

const уникальные = new Map()
for (const в of вызовы) {
  const k = `${в.метод} ${в.путь}`
  if (!уникальные.has(k)) уникальные.set(k, в)
}

/**
 * ЖИВОЙ ли обрыв. Первый прогон напечатал 48 «кнопок, которые ничего не
 * делают» — и почти все оказались МЁРТВЫМИ ЭКСПОРТАМИ: функции вроде
 * `openaiVision` и `videoConcat` объявлены в generateApi.ts и не вызываются
 * НИГДЕ, кроме собственного определения. Ни одна кнопка их не зовёт.
 *
 * Разница принципиальная. Мёртвый экспорт — мусор, который стоит убрать.
 * Обрыв под живой кнопкой — человек нажимает и ничего не получает. Смешивать
 * их в один список значит утопить второе в первом: 48 предупреждений никто
 * не читает, а два — читают.
 */
const исходники = файлы(PLAYER).map(f => [f, fs.readFileSync(f, 'utf8')])

function живой(в) {
  // Swift не знает мёртвых экспортов в смысле этой проверки: если файл
  // собран в приложение, вызов живой. Проверять нечего.
  if (в.файл.endsWith('.swift')) return true
  const свой = path.join(REPO, в.файл)
  const s = fs.readFileSync(свой, 'utf8')
  const до = s.slice(0, s.indexOf(в.сырой))
  const имена = [...до.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)]
  const имя = имена.length ? имена[имена.length - 1][1] : null
  // Не разобрали имя — считаем живым: лишняя тревога дешевле пропуска.
  if (!имя) return true
  return исходники.some(
    ([f, текст]) => f !== свой && new RegExp(`\\b${имя}\\b`).test(текст)
  )
}

const всеОбрывы = [...уникальные.values()].filter(в => !естьНаСервере(в.путь))
const обрывы = всеОбрывы.filter(живой)
const мёртвые = всеОбрывы.length - обрывы.length

console.log(`\nСверка клиента и сервера`)
console.log(`  вызовов клиента: ${уникальные.size}`)
console.log(`  адресов сервера: ${адресаСервера.size}\n`)

if (мёртвые) {
  console.log(
    `  ↳    ${мёртвые} обрыв(ов) скрыто: их зовут только мёртвые экспорты,\n` +
      '       то есть за ними нет ни одной кнопки. Мусор, а не поломка.\n'
  )
}

if (!обрывы.length) {
  console.log('  OK   каждый адрес живой кнопки находит обработчик\n')
} else {
  for (const в of обрывы) {
    console.log(`  ⚠️   ${в.метод} ${в.путь}`)
    console.log(`       зовёт ${в.файл}, обработчика не нашлось`)
  }
  console.log(
    `\n⚠️  ЖИВЫХ ОБРЫВОВ: ${обрывы.length}. Каждый — кнопка, которая ничего не делает.\n` +
      '   Проверьте вручную: сверка грубая и путает динамические сегменты.\n'
  )
}

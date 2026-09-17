#!/usr/bin/env node
/**
 * READ-ONLY. Где человек остаётся без ответа после ошибки.
 *
 * Прошлые итерации нашли, что бот сообщает НЕ ТО, что произошло: «средства
 * возвращены», когда возврат не проходил; «у вас нет моделей», когда обучение
 * висит тринадцать месяцев. Здесь — соседний класс: бот не сообщает НИЧЕГО.
 *
 * Человек нажал кнопку, внутри упало, ошибка ушла в журнал, а он ждёт. Это
 * хуже неверного сообщения: неверное хотя бы даёт повод написать в поддержку.
 *
 * ЧТО ИЩЕМ: блок `catch` в сцене или обработчике, внутри которого есть запись
 * в журнал, но нет НИ ОДНОГО обращения к человеку.
 *
 * Считаем и знаменатель: сколько блоков `catch` всего, сколько с ответом,
 * сколько без. Без знаменателя число «нашлось N» ничего не значит.
 *
 * САМОПРОВЕРКА обязательна.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

/** Убирает блочные комментарии, СОХРАНЯЯ количество строк. */
const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, m =>
    '\n'.repeat((m.match(/\n/g) || []).length)
  )

/** Обращение к человеку. */
const SPEAKS =
  /(ctx\.reply|ctx\.replyWith|\.telegram\.sendMessage|\.telegram\.editMessageText|editMessageText|editMessageCaption|answerCbQuery|sendMessageToUser|bot\.telegram\.send|sendGenericErrorMessage|refundAndTell|sendServiceErrorToUser|sendInsufficientStarsMessage|showMainMenu)/

/** Запись в журнал — признак, что об ошибке узнали хотя бы разработчики. */
const LOGS = /(logger\.(error|warn)|console\.(error|warn))/

/**
 * Разбирает блоки catch по отступу. Возвращает {line, body, hasReply, hasLog}.
 */
function catchBlocks(text) {
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    // `catch` встречается и в начале строки (`} catch (e) {`), и в середине
    // (`try { ... } catch (e) {`). Первая версия искала только первый вид и
    // провалила собственную самопроверку — за что ей спасибо.
    if (!/catch\s*(\([^)]*\))?\s*\{\s*$/.test(lines[i])) continue
    const indent = lines[i].length - lines[i].trimStart().length
    let end = -1
    for (let j = i + 1; j < Math.min(i + 80, lines.length); j++) {
      const l = lines[j]
      if (!l.trim()) continue
      const ind = l.length - l.trimStart().length
      if (ind <= indent && /^\s*\}/.test(l)) {
        end = j
        break
      }
    }
    if (end < 0) continue
    const body = lines.slice(i + 1, end).join('\n')
    out.push({
      line: i + 1,
      body,
      hasReply: SPEAKS.test(body),
      hasLog: LOGS.test(body),
      rethrows: /\bthrow\b/.test(body),
    })
  }
  return out
}

const SELF_CHECK = `
async function silent(ctx) {
  try { await work() } catch (e) {
    logger.error('упало', e)
  }
}
async function speaks(ctx) {
  try { await work() } catch (e) {
    logger.error('упало', e)
    await ctx.reply('Не получилось, попробуйте ещё раз')
  }
}
`

function main() {
  const blocks = catchBlocks(SELF_CHECK)
  const silent = blocks.filter(b => b.hasLog && !b.hasReply && !b.rethrows)
  const speaking = blocks.filter(b => b.hasReply)
  if (blocks.length !== 2 || silent.length !== 1 || speaking.length !== 1) {
    console.error('❌ САМОПРОВЕРКА НЕ ПРОШЛА — искалке верить нельзя', {
      блоков: blocks.length,
      молчащих: silent.length,
      говорящих: speaking.length,
    })
    process.exit(2)
  }
  console.log('самопроверка пройдена: молчащий найден, говорящий не задет\n')

  const files = []
  ;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) files.push(p)
    }
  })('src')

  /** Только там, где рядом с человеком: сцены, обработчики, навигация. */
  const NEAR_USER = /^src\/(scenes|handlers|navigation|commands)\//

  let total = 0
  let withReply = 0
  let rethrown = 0
  let noLog = 0
  const silentHits = []

  for (const f of files) {
    if (f.includes('__tests__') || f.includes('/test/')) continue
    if (!NEAR_USER.test(f)) continue
    const text = strip(fs.readFileSync(f, 'utf8'))
    for (const b of catchBlocks(text)) {
      total++
      if (b.rethrows) {
        rethrown++
        continue
      }
      if (b.hasReply) {
        withReply++
        continue
      }
      if (!b.hasLog) {
        noLog++
        continue
      }
      silentHits.push({
        file: f,
        line: b.line,
        first: b.body.trim().split('\n')[0].slice(0, 66),
      })
    }
  }

  console.log('=== Блоки catch рядом с человеком ===')
  console.log(`  всего:                       ${total}`)
  console.log(`  отвечают человеку:           ${withReply}`)
  console.log(
    `  пробрасывают выше:           ${rethrown}  (отвечать будет тот, кто поймает)`
  )
  console.log(`  без записи в журнал вовсе:   ${noLog}`)
  console.log(`  МОЛЧАТ (журнал есть, ответа нет): ${silentHits.length}`)

  const byFile = {}
  for (const h of silentHits) byFile[h.file] = (byFile[h.file] || 0) + 1
  console.log('\n=== Где молчат чаще всего ===')
  for (const [f, n] of Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)) {
    console.log(`  ${String(n).padStart(3)}  ${f}`)
  }
  console.log('\n=== Первые двадцать мест ===')
  for (const h of silentHits.slice(0, 20)) {
    console.log(`  ${h.file}:${h.line}`)
    console.log(`      ${h.first}`)
  }
}

main()

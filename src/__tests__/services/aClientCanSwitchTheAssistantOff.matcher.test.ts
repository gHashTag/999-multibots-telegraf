/**
 * THE EAR: WHICH CLIENT MESSAGES ARE A REQUEST TO STOP THE AUTOMATIC REPLIES.
 *
 * Every phrase below is invented for the test. None is a real client's
 * message, and none may become one: real correspondence lives in Postgres and
 * Zep, never in the repository.
 *
 * The positive list is the part that must never shrink -- a missed stop is a
 * client who said "enough" and got another automatic reply. The negative list
 * pins the three carve-outs the matcher is allowed (negation, how-to, the
 * client's own bot) plus ordinary sales talk that mentions nothing of the kind.
 */
import { describe, it, expect } from 'vitest'
import {
  isStopRequest,
  normaliseForStop,
  clientStopIsSilent,
  STOP_ACK,
} from '@/services/clientStop'

const STOPS: string[] = [
  // Russian, the verb and the object.
  'Выключи бота',
  'выключите бота пожалуйста',
  'Отключите автоответчик!',
  'отключи автоответ',
  'уберите вашего бота',
  'Можно выключить автоответы?',
  'Не отвечает по делу, выключите бота',
  'бота выключите',
  'автоответчик отключите пожалуйста',
  'остановите робота',
  'выключите ассистента, я хочу с вами',
  'Не могли бы вы отключить бота?',
  'удалите этого бота из чата',
  'стоп бот',
  // Russian, the owner himself.
  'Хватит, пусть пишет сам Пётр',
  'пусть Пётр сам мне ответит',
  'пусть он лично напишет',
  'ответьте сами',
  // Russian, a living person.
  'Хочу общаться с живым человеком',
  'дайте живого человека',
  'позовите хозяина',
  'можно я буду общаться с вами напрямую?',
  // Russian, no bot / enough.
  'не хочу общаться с ботом',
  'Я не хочу переписываться с роботом',
  'не надо бота',
  'без автоответов, пожалуйста',
  'хватит ботов',
  'ваш бот достал',
  'надоел ваш автоответчик',
  'перестаньте мне писать одно и то же',
  'хватит присылать одно и то же',
  'больше не пишите',
  'не пишите мне больше',
  'отпишите меня',
  // Alone.
  'Стоп',
  'хватит!',
  'Хватит уже',
  'отстаньте',
  // English.
  'stop the bot',
  'Please turn off the bot',
  'turn the bot off',
  'switch off the auto-reply',
  'Can you disable the autoresponder?',
  'no more automatic replies',
  'No more bots please',
  'stop replying automatically',
  'stop sending me the same thing',
  'I want to talk to a real person',
  'let him reply himself',
  "I don't want to talk to a bot",
  'do not message me',
  'unsubscribe',
  'STOP',
  'please stop',
  'your bot is annoying',
  'leave me alone',
]

const NOT_STOPS: string[] = [
  // Negation of the verb.
  'не выключай бота',
  'Не отключайте автоответчик, он удобный',
  'не надо выключать бота',
  'не надо пока отключать ассистента',
  'бота не выключайте',
  "don't turn off the bot",
  'do not stop the bot, it is great',
  'no need to disable the assistant',
  // A how-to question about a bot in general.
  'как отключить бота?',
  'как мне выключить бота в канале',
  'how to turn off a bot in a group?',
  // The client's own bot.
  'выключи моего бота',
  'отключите мой бот на ночь',
  'turn off my bot',
  // Ordinary talk.
  'Сколько стоит фото?',
  'Хочу заказать рилс',
  'бот классный',
  'а это бот отвечает?',
  'сделайте портрет без фона',
  'отключите подписку в боте',
  'пусть бот сам ответит на вопрос',
  'Этого достаточно',
  'enough photos for now, send the price',
  'How much is it?',
  'the assistant helped a lot',
  'I stopped by yesterday',
  'выключили свет, напишу позже',
  '',
  '   ',
  // Product talk (review of PR 2849): a live person to film, a site without
  // a bot, somebody else's group or channel, an AI watermark.
  'Можно сделать видео с реальным человеком?',
  'Хочу аватар с живым человеком, не мультяшный',
  'Сколько стоит сайт без бота?',
  'Мне не нужен бот, нужен лендинг',
  'Подскажите, можно удалить бота из моей группы?',
  'Помогите убрать бота из канала',
  'хочу отключить ИИ в моём канале',
  'stop the bot from posting in my channel',
  'please remove the AI watermark',
  'бот не отвечает',
  'stop generating',
  'выключи уведомления',
  'отключите уведомления от бота в группе',
  // Negations the one-word window missed (review of PR 2849).
  "Don't ever switch off the bot",
  'Я не прошу выключить бота',
  'Нельзя выключать бота',
  'Я бы не стал отключать бота',
  'никто не просил выключать бота',
  "I'm not asking you to switch off the bot",
  'no one asked to stop the bot',
]

/*
 * Stops that stay stops next to the carve-outs above: politeness that looks
 * like a negation, a negation in another clause, a live person to TALK to.
 */
const STILL_STOPS: string[] = [
  'почему бы не выключить бота',
  "why don't you turn off the bot",
  'Не надо мне видео, выключите бота',
  'Хочу поговорить с живым человеком про видео',
  'не пишите мне и выключите бота',
  'удалите этого бота из чата',
]

describe('a client asking the assistant to stop is recognised', () => {
  for (const text of STOPS) {
    it(`stop: ${text}`, () => {
      expect(isStopRequest(text), `missed a stop: ${text}`).not.toBeNull()
    })
  }
})

describe('stops next to the carve-outs are still heard', () => {
  for (const text of STILL_STOPS) {
    it(`stop: ${text}`, () => {
      expect(isStopRequest(text), `missed a stop: ${text}`).not.toBeNull()
    })
  }
})

describe('what is not a stop request stays a normal message', () => {
  for (const text of NOT_STOPS) {
    it(`not a stop: ${JSON.stringify(text)}`, () => {
      const got = isStopRequest(text)
      expect(got, `false stop (${got?.rule}): ${text}`).toBeNull()
    })
  }
})

describe('the language of the acknowledgement follows the client', () => {
  it('Russian words get the Russian line', () => {
    expect(isStopRequest('выключите бота')?.lang).toBe('ru')
  })
  it('English words get the English line', () => {
    expect(isStopRequest('stop the bot')?.lang).toBe('en')
  })
  it('both lines exist and carry no link and no price', () => {
    for (const line of Object.values(STOP_ACK)) {
      expect(line.length).toBeGreaterThan(10)
      expect(line).not.toMatch(/https?:|t\.me|⭐|\d/)
    }
  })
})

describe('normalisation', () => {
  it('folds the yo letter, case and punctuation, keeps apostrophes', () => {
    expect(normaliseForStop('  Всё, ХВАТИТ!!  ')).toBe('все хватит')
    expect(normaliseForStop('Don’t   stop')).toBe("don't stop")
  })
})

describe('silence is the owner s choice, acknowledgement the default', () => {
  it('acknowledges when nothing is configured', () => {
    expect(clientStopIsSilent('900000001', {})).toBe(false)
  })
  it('is silent for a listed owner only', () => {
    const env = { CLIENT_STOP_SILENT_OWNERS: '900000009, 900000001' }
    expect(clientStopIsSilent('900000001', env)).toBe(true)
    expect(clientStopIsSilent('900000002', env)).toBe(false)
  })
  it('a star silences everybody', () => {
    expect(
      clientStopIsSilent('900000003', { CLIENT_STOP_SILENT_OWNERS: '*' })
    ).toBe(true)
  })
})

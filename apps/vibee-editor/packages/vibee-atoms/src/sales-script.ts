import type { LocalizedText } from './agent-marketplace'
import {
  agentPackageStars,
  agentPackageUsd,
  type AgentPackage,
} from './agent-packages'
import {
  MONTH_DAYS,
  monthTokens,
  PORTRAIT_TOKENS,
  reelsIn,
  START_TOKENS,
  WARN_DAYS_FIRST,
} from './token-wallet'

/**
 * THE SALES SCRIPT -- how a conversation sells one of the agents.
 *
 * Owner, 2026-10-01: "develop a script that will sell our agents". It runs
 * after a press on "Order" in the mini app (`?start=agentpkg_<id>`), in the
 * order bot's chat: the Manager Agent selling the agents, the team's own
 * product doing the team's own sales.
 *
 * The shape follows what converts in onboarding and sales research: ONE
 * question first and the answer steers the rest (segmentation), the value
 * named as an outcome and a price per outcome, the proof next to the price,
 * the free first step offered to anyone who hesitates, and follow-ups that
 * bring a person back instead of a conversation that just ends.
 *
 * Every number is read from the catalogue (agent-packages.ts) and the
 * wallet (token-wallet.ts); sales-script.test.ts fails on a figure typed by
 * hand. A promise the platform cannot keep yet (a refund guarantee, a Stars
 * checkout) is not in the script: the team sends the invoice by hand.
 */
export type SalesStepId =
  | 'hello'
  | 'goal'
  | 'discover'
  | 'value'
  | 'proof'
  | 'offer'
  | 'close'

export interface SalesStep {
  id: SalesStepId
  /** What the step must achieve -- for the agent and the team, not said. */
  aim: string
  /** What is said. */
  say: LocalizedText
}

export interface SalesObjection {
  /** What the person says, roughly. */
  heard: LocalizedText
  answer: LocalizedText
}

export interface SalesFollowUp {
  /** Hours after the last message from the person. */
  afterHours: number
  say: LocalizedText
}

/** Dollars, the way the cards print them: "$35". */
const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

/** A month's Stars with thousands grouped, per language. */
const stars = (pkg: AgentPackage, lang: 'en' | 'ru') =>
  agentPackageStars(pkg).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')

/** A month's tokens with thousands grouped, per language. */
const tokens = (n: number, lang: 'en' | 'ru') =>
  n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')

/**
 * The outcome a package month buys, in the unit that package is sold in:
 * reels for the agents that make content, the month's tokens for the one
 * that only writes (the Manager Agent has no reels and no images).
 */
export function monthOutcome(pkg: AgentPackage): LocalizedText {
  const t = monthTokens(pkg.allowanceUsd)
  if (pkg.id === 'tridev')
    return {
      en: `${tokens(t, 'en')} tokens a month for tasks from your GitHub issues`,
      ru: `${tokens(t, 'ru')} токенов в месяц на задачи из ваших GitHub issues`,
    }
  if (pkg.media === false)
    return {
      en: `${tokens(t, 'en')} tokens a month for replies to your clients`,
      ru: `${tokens(t, 'ru')} токенов в месяц на ответы вашим клиентам`,
    }
  const reels = reelsIn(t)
  return {
    en: `≈${reels} reels with your face a month — about ${usd(perReel(pkg))} a reel`,
    ru: `≈${reels} рилсов с вашим лицом в месяц — около ${usd(perReel(pkg))} за рилс`,
  }
}

/** The monthly price over the reels its allowance buys, to the cent. */
export function perReel(pkg: AgentPackage): number {
  const reels = reelsIn(monthTokens(pkg.allowanceUsd))
  return reels > 0 ? Math.round((agentPackageUsd(pkg) / reels) * 100) / 100 : 0
}

/** The steps for one package, in the order they are taken. */
export function salesSteps(pkg: AgentPackage): SalesStep[] {
  const outcome = monthOutcome(pkg)
  const month = monthTokens(pkg.allowanceUsd)
  return [
    {
      id: 'hello',
      aim: 'Confirm the order arrived and make the person answer one thing.',
      say: {
        en: `Thank you — your request for ${pkg.name.en} is with the team ✅ While they set things up, one question so the agent is built for you, not for "everyone":`,
        ru: `Спасибо — заявка на «${pkg.name.ru}» уже у команды ✅ Пока мы готовим настройку, один вопрос, чтобы агент делался под вас, а не «для всех»:`,
      },
    },
    {
      id: 'goal',
      aim: 'Segment: the answer picks the package that fits, even another one.',
      say: {
        en: 'What should the agent take off your hands first?\n1 — answer clients and collect leads\n2 — make reels with my face\n3 — be me: my character, voice and skills',
        ru: 'Что агент должен снять с вас в первую очередь?\n1 — отвечать клиентам и собирать заявки\n2 — делать рилсы с моим лицом\n3 — быть мной: мой характер, голос и навыки',
      },
    },
    {
      id: 'discover',
      aim: 'Two concrete questions; the answers go into the CRM card and the setup.',
      say:
        pkg.id === 'tridev'
          ? {
              en: 'Which GitHub repository should the agent work in, and which issue should it take first?',
              ru: 'В каком GitHub-репозитории работать агенту и какую задачу взять первой?',
            }
          : pkg.media === false
            ? {
                en: 'Where do clients write to you now, and roughly how many messages a day? Which question do you answer most often?',
                ru: 'Где вам сейчас пишут клиенты и сколько примерно сообщений в день? На какой вопрос вы отвечаете чаще всего?',
              }
            : {
                en: 'Which channel should the reels go to, and how often do you want to post? Do you have a short video of yourself talking (a minute is enough)?',
                ru: 'В какой канал пойдут рилсы и как часто вы хотите выходить? Есть короткое видео, где вы говорите (хватит минуты)?',
              },
    },
    {
      id: 'value',
      aim: 'Name the outcome and its unit price before the total.',
      say: {
        en: `Then ${pkg.name.en} is your fit: ${outcome.en}. The month includes ${tokens(month, 'en')} tokens for the agent's work.`,
        ru: `Тогда вам подходит «${pkg.name.ru}»: ${outcome.ru}. В месяц входит ${tokens(month, 'ru')} токенов на работу агента.`,
      },
    },
    {
      id: 'proof',
      aim: 'Proof next to the price; the free first step for anyone unsure.',
      say: {
        en: `You don't have to take our word for it: the live agent passes a check on a real account every day, and the receipt is on its card. Want to see it on yourself first? You have ${START_TOKENS} free tokens — a portrait from your photo (${PORTRAIT_TOKENS} tokens) in a minute.`,
        ru: `Верить на слово не нужно: живой агент каждый день проходит проверку на реальном аккаунте, чек — на его карточке. Хотите сначала увидеть на себе? У вас ${START_TOKENS} бесплатных токенов — портрет по вашему фото (${PORTRAIT_TOKENS} токенов) за минуту.`,
      },
    },
    {
      id: 'offer',
      aim: 'The price, said once and whole: what a month costs and how it renews.',
      say: {
        en: `${pkg.name.en} is ${usd(agentPackageUsd(pkg))} a month (${stars(pkg, 'en')} Stars), paid every month, setup included. The month's allowance resets every ${MONTH_DAYS} days, and the agent reminds you ${WARN_DAYS_FIRST} days before, so nothing is lost unnoticed.`,
        ru: `«${pkg.name.ru}» — ${usd(agentPackageUsd(pkg))} в месяц (${stars(pkg, 'ru')} ⭐), оплата каждый месяц, настройка включена. Лимит месяца обновляется каждые ${MONTH_DAYS} дней, а за ${WARN_DAYS_FIRST} дней до этого агент напомнит — ничего не пропадёт незаметно.`,
      },
    },
    {
      id: 'close',
      aim: 'One next step with a date; the team sends the invoice by hand.',
      say: {
        en: 'Shall I pass it to the team for setup? They will send the invoice here and agree a launch date with you.',
        ru: 'Передаю команде на настройку? Счёт пришлют сюда, в этот чат, и согласуют с вами дату запуска.',
      },
    },
  ]
}

/** What people say before they buy, and the honest answer to each. */
export function salesObjections(pkg: AgentPackage): SalesObjection[] {
  const outcome = monthOutcome(pkg)
  return [
    {
      heard: { en: 'It is expensive.', ru: 'Дорого.' },
      answer: {
        en: `Count it per result: ${outcome.en}. A freelancer charges more for one video, and this agent works every day.`,
        ru: `Посчитайте на результат: ${outcome.ru}. Фрилансер за один ролик берёт больше, а агент работает каждый день.`,
      },
    },
    {
      heard: {
        en: 'I can just use ChatGPT.',
        ru: 'Я могу просто пользоваться ChatGPT.',
      },
      answer: {
        en: 'ChatGPT waits for you to ask. This agent lives in its own bot, answers your clients at night, keeps the leads in a CRM and shows a receipt for every job.',
        ru: 'ChatGPT ждёт, пока вы спросите. Этот агент живёт в своём боте, отвечает вашим клиентам ночью, ведёт заявки в CRM и показывает чек за каждую работу.',
      },
    },
    {
      heard: {
        en: 'What if it writes nonsense to my clients?',
        ru: 'А если он напишет клиенту ерунду?',
      },
      answer: {
        en: 'Every conversation is in your CRM, and the agent is handed over only after it passes a check on your own account. It never shares a phone number or an address the chat has not seen.',
        ru: 'Каждый разговор виден в вашей CRM, а агента сдают только после проверки на вашем аккаунте. Чужие телефоны и адреса, которых не было в переписке, он не называет.',
      },
    },
    {
      heard: {
        en: 'Will it really sound like me?',
        ru: 'А точно будет похоже на меня?',
      },
      answer: {
        en: `Check it before paying: the free portrait takes ${PORTRAIT_TOKENS} of your ${START_TOKENS} tokens. The agent is handed over only after it passes a check on your own account.`,
        ru: `Проверьте до оплаты: бесплатный портрет стоит ${PORTRAIT_TOKENS} из ваших ${START_TOKENS} токенов. Агента сдают только после проверки на вашем аккаунте.`,
      },
    },
    {
      heard: { en: 'I will think about it.', ru: 'Я подумаю.' },
      answer: {
        en: 'Of course. Meanwhile, try the free portrait — it takes a minute, and you will know what the agent can do with your face.',
        ru: 'Конечно. А пока попробуйте бесплатный портрет — минута, и вы увидите, что агент умеет с вашим лицом.',
      },
    },
  ]
}

/** Messages after silence: a day, three days, a week. */
export function salesFollowUps(pkg: AgentPackage): SalesFollowUp[] {
  return [
    {
      afterHours: 24,
      say: {
        en: `Did you get to try the portrait? If you send a photo here, I will show what ${pkg.name.en} does with it.`,
        ru: `Успели попробовать портрет? Пришлите фото сюда — покажу, что с ним делает «${pkg.name.ru}».`,
      },
    },
    {
      afterHours: 72,
      say: {
        en: `Here is what the live agent made today, with its receipt. ${pkg.name.en} would do the same for you.`,
        ru: `Вот что живой агент сделал сегодня — с чеком. «${pkg.name.ru}» будет делать так же для вас.`,
      },
    },
    {
      afterHours: 168,
      say: {
        en: 'Last note from me: the team can launch your agent this week. Shall I keep the slot?',
        ru: 'Последнее сообщение от меня: команда может запустить вашего агента на этой неделе. Держать место?',
      },
    },
  ]
}

/** The whole script for one package as plain text, for a prompt or a person. */
export function salesScriptText(pkg: AgentPackage, lang: 'en' | 'ru'): string {
  const lines: string[] = []
  for (const step of salesSteps(pkg))
    lines.push(`[${step.id}] (${step.aim})`, step.say[lang], '')
  lines.push('[objections]')
  for (const o of salesObjections(pkg))
    lines.push(`— ${o.heard[lang]}`, `  ${o.answer[lang]}`)
  lines.push('', '[follow-ups]')
  for (const f of salesFollowUps(pkg))
    lines.push(`+${f.afterHours}h: ${f.say[lang]}`)
  return lines.join('\n')
}

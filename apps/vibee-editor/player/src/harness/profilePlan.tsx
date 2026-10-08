/**
 * THE CONTENT PLAN IN THE CABINET, FOR A PHONE-WIDTH LOOK (tri shot
 * profile-plan, plan-reel.t27).
 *
 * The plan tab as the profile mounts it: the course taken in as a goal, a
 * card whose reel came out (its picture), cards that offer the press, and the
 * price named above them. Every tool call is answered in the page; the
 * people and lessons are the course's own words, at their real length.
 *
 * Nothing here is built into the app: vite serves harness/*.html in dev only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import '@/components/Profile/Profile.css'
import { ProfilePlan } from '@/components/Profile/ProfilePlan'
import { answerCrmToolsInPage } from './crmFixtures'

const LESSON = 'https://t27.ai/#/course/'
const card = (
  id: number,
  title: string,
  goal: string,
  lesson: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  ['название']: title, // cyrillic-ok: plan_list's own keys
  ['заметка']: `${goal}\n${LESSON}${lesson}`, // cyrillic-ok: plan_list's own keys
  ['статус']: 'замысел', // cyrillic-ok: plan_list's own keys
  ...extra,
})

answerCrmToolsInPage({
  plan_list: {
    reel_press: { scenes: 1, price_tokens: 86, busy: false },
    ['целей']: 1, // cyrillic-ok: plan_list's own keys
    ['цели']: [
      // cyrillic-ok: plan_list's own keys
      {
        id: 1,
        ['цель']: 'С нуля до чипа: программирование FPGA на t27', // cyrillic-ok: plan_list's own keys
        ['зачем']: 't27.ai/#/course', // cyrillic-ok: plan_list's own keys
        ['карточки']: [
          // cyrillic-ok: plan_list's own keys
          card(
            10,
            'FPGA — это сетка, которую вы настраиваете',
            'Из чего состоит FPGA и почему дизайн занимает только часть чипа.',
            'fpga-is-a-grid',
            {
              ['статус']: 'вышло', // cyrillic-ok: plan_list's own keys
              reel: 'https://example.invalid/reel-10.mp4',
            }
          ),
          card(
            11,
            'Какой это чип?',
            'Как чип называет себя в 32 битах и как эти биты читать.',
            'which-chip',
            { press: true }
          ),
          card(
            12,
            'Биты, триты и GF16',
            'Как число хранится в битах и как сбалансированная троичная система хранит его в тритах.',
            'bits-and-trits',
            { press: true }
          ),
        ],
      },
    ],
  },
  my_story_reel: { started: true, topic: 'Какой это чип?', job: 1 },
})

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <ProfilePlan />
    </StrictMode>
  )

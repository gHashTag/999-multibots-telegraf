/**
 * THE AGENTS THAT GET A BOT OF THEIR OWN.
 *
 * A copy of the identity fields of MARKETPLACE_AGENTS
 * (apps/vibee-editor/packages/vibee-atoms/src/agent-marketplace.ts): the bot
 * builds from src/ alone and cannot import the package. It is not a second
 * home for the truth -- src/__tests__/core/agentHive/catalogue.test.ts
 * compares the two field by field, so a new or renamed agent fails the run
 * until it is copied here.
 */

export interface HiveAgent {
  id: string
  icon: string
  name: { en: string; ru: string }
  role: { en: string; ru: string }
}

export const HIVE_AGENTS: readonly HiveAgent[] = [
  {
    id: 'blogger',
    icon: '✦',
    name: { en: 'Blogger', ru: 'Блогер' },
    role: {
      en: 'Verified publishing agent',
      ru: 'Агент проверенных публикаций',
    },
  },
  {
    id: 'job',
    icon: '⚒',
    name: { en: 'Job', ru: 'Работа' },
    role: { en: 'Hiring-side agent', ru: 'Агент по найму и вакансиям' },
  },
  {
    id: 'google',
    icon: 'G',
    name: { en: 'Google Scout', ru: 'Google-разведчик' },
    role: {
      en: 'Demand and evidence researcher',
      ru: 'Исследователь спроса и фактов',
    },
  },
  {
    id: 'tiktok',
    icon: '♪',
    name: { en: 'TikTok Producer', ru: 'TikTok-продюсер' },
    role: { en: 'Short-form campaign agent', ru: 'Агент коротких видео' },
  },
  {
    id: 'scientist',
    icon: '⚗',
    name: { en: 'Scientist', ru: 'Учёный' },
    role: {
      en: 'Claims, measurements and reproducibility',
      ru: 'Утверждения, измерения, воспроизводимость',
    },
  },
  {
    id: 'fpga',
    icon: '▦',
    name: { en: 'FPGA Engineer', ru: 'FPGA-инженер' },
    role: {
      en: 'Synthesis, place-and-route and timing',
      ru: 'Синтез, размещение и тайминги',
    },
  },
  {
    id: 'rtl',
    icon: '⎍',
    name: { en: 'RTL Engineer', ru: 'RTL-инженер' },
    role: {
      en: 'Verilog / SystemVerilog design and verification',
      ru: 'Проектирование и верификация на Verilog / SystemVerilog',
    },
  },
  {
    id: 'coder',
    icon: '⌘',
    name: { en: 'Coding Scientist', ru: 'Учёный-программист' },
    role: {
      en: 'Reads, writes and RUNS code to answer',
      ru: 'Читает, пишет и ЗАПУСКАЕТ код, чтобы ответить',
    },
  },
  {
    id: 't27b',
    icon: '⌬',
    name: { en: 't27b Compiler Engineer', ru: 'Инженер компилятора t27b' },
    role: {
      en: 'Grows the native AArch64 backend of t27 (no LLVM) toward 100% of the spec corpus',
      ru: 'Доводит нативный AArch64-бэкенд t27 (без LLVM) до 100% корпуса спеков',
    },
  },
]

export const hiveAgent = (id: string | undefined): HiveAgent | undefined =>
  HIVE_AGENTS.find(a => a.id === id)

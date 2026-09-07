/** Skill Detector — daily cron that auto-creates skills from generation patterns. */

import { inngest } from '../../inngestClient'
import { logger } from '@/utils/logger'
import {
  detectSkillCandidate,
  createSkill,
  listSkills,
} from '@/services/skillManager'
import { telegramApiFor } from '@/services/telegramApi'

const SERVICE_TYPES = [
  'neuro_photo',
  'text_to_image',
  'text_to_video',
  'image_to_video',
  'face_swap',
  'lip_sync',
]

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.BOT_TOKEN_1
  if (!token || !chatId) return
  await fetch(`${telegramApiFor(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {})
}

export const skillDetector = inngest.createFunction(
  { id: 'skill-detector', retries: 1 },
  { cron: '0 10 * * *' },
  async ({ step }) => {
    let totalCreated = 0

    const existingSkills = await step.run('load-existing-skills', async () => {
      const skills = await listSkills()
      // Build a set of "service_type::model::prefix" to avoid duplicates
      return skills.map(
        s =>
          `${s.service_type}::${s.model}::${s.prompt_template.substring(0, 50)}`
      )
    })

    for (const serviceType of SERVICE_TYPES) {
      const created = await step.run(`detect-${serviceType}`, async () => {
        const candidates = await detectSkillCandidate(serviceType)
        let count = 0

        for (const c of candidates) {
          const key = `${c.service_type}::${c.model}::${c.prompt_prefix}`
          if (existingSkills.includes(key)) continue

          const skill = await createSkill({
            name: `${serviceType} — ${c.prompt_prefix.substring(0, 30)}`,
            description: `Auto-detected pattern: ${c.count} successful generations with model ${c.model}`,
            service_type: c.service_type,
            model: c.model,
            prompt_template: c.prompt_prefix,
            settings: c.settings,
            created_by: 'system',
          })

          if (skill) {
            count++
            existingSkills.push(key)
          }
        }
        return count
      })
      totalCreated += created
    }

    if (totalCreated > 0) {
      await step.run('notify-admin', async () => {
        const adminId = process.env.ADMIN_TELEGRAM_ID?.split(',')[0] || ''
        await sendTelegram(
          adminId,
          `🧠 <b>Skill Detector</b>\n\n` +
            `Создано <b>${totalCreated}</b> новых скиллов из паттернов генераций.\n` +
            `Дата: ${new Date().toLocaleDateString('ru-RU')}`
        )
        logger.info('[SkillDetector] Created new skills', { totalCreated })
      })
    }

    return { success: true, created: totalCreated }
  }
)

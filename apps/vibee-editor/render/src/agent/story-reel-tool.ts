/**
 * story_reel -- the story reel as ONE call (owner, 2026-09-26: "save the
 * template for constant work; only add a pause at the end for the CTA").
 *
 * The owner's format, proven twice that day (the owner's own launch reel and
 * a florist client's gift reel): one face, three scenes in one style and a
 * NEW setting each, one short line per scene in a real voice, a lip-sync per
 * scene, the Remotion StoryReel template -- hard cuts, a breath between
 * lines, and at the end the last frame held for a pause while the call to
 * action stands on screen.
 *
 * Before this tool the chain was eight separate calls, which is the agent's
 * whole step budget, and each long call died on the next redeploy of the
 * render (other sessions merge every 10-15 minutes). Here the chain runs
 * inside one call, in parallel where it can:
 *
 *   stills  -- image_edit per scene, all at once, from the one source photo
 *   voices  -- audio_generate per line (for_lead: the client's own clone)
 *   clips   -- lipsync_generate per scene
 *   reel    -- reel_render StoryReel {scenes, pauseSec, breathSec, cta}
 *
 * RESUMABLE, NOT REPAID. Every answer carries the stills and clips made so
 * far. A call cut by a redeploy, or a still that is still drawing, comes back
 * with them, and the next call passes them in (`stills`, `clips`): the parts
 * already paid for are never made twice.
 *
 * Each borrowed tool charges for itself exactly as when called alone (the
 * house pays nothing), so this file holds no prices of its own.
 */
import type { AgentTool, ToolContext } from './tools'

/** Scenes a story holds: the owner's form is three. */
export const STORY_SCENES_MIN = 1
export const STORY_SCENES_MAX = 4
/** The pause for the call to action, seconds (StoryReel's own default). */
export const STORY_PAUSE_SEC = 3
/**
 * How long a still may draw inside this call. image_edit alone waits about
 * three minutes; measured 2026-09-26, two stills of a client took just over
 * three and arrived in "my files" twenty seconds after the tool had given up.
 */
export const STORY_STILL_WAIT_MS = 6 * 60_000

export const KEEP_THE_PERSON =
  'Keep the person EXACTLY as in the source photo -- the same face, features, hair, age and outfit; ' +
  'change ONLY the setting around them, and never keep the plain background of the source photo.'

export interface StoryScene {
  setting: string
  line: string
}

/** The prompt of one scene's still: the setting, the one style, the person kept. */
export function stillPrompt(setting: string, style: string): string {
  return [
    `Setting: ${setting.trim()}.`,
    KEEP_THE_PERSON,
    style.trim(),
    'Vertical 9:16, no text, no letters, no logos.',
  ]
    .filter(Boolean)
    .join(' ')
}

/** The scenes as given, checked: 1..4, each with a setting and a line. */
export function scenesOf(raw: unknown): StoryScene[] | string {
  if (!Array.isArray(raw)) return 'scenes: список сцен {setting, line}'
  if (raw.length < STORY_SCENES_MIN || raw.length > STORY_SCENES_MAX)
    return `scenes: от ${STORY_SCENES_MIN} до ${STORY_SCENES_MAX} сцен`
  const out: StoryScene[] = []
  for (const [i, s] of raw.entries()) {
    const setting = String((s as StoryScene)?.setting ?? '').trim()
    const line = String((s as StoryScene)?.line ?? '').trim()
    if (!setting || !line)
      return `scenes.${i}: нужны и setting (обстановка), и line (реплика)`
    out.push({ setting, line })
  }
  return out
}

export interface StoryEndCard {
  bg?: string
  title?: string
  text?: string
  accent?: string
  button?: string
}

const HEX = /^#[0-9a-fA-F]{3,8}$/
const hex = (v: unknown): string | undefined =>
  HEX.test(String(v ?? '').trim()) ? String(v).trim() : undefined

/**
 * The end card as given, checked: colours are #hex or dropped, the button
 * line is short. Nothing usable -- no card, and the reel ends as before.
 */
export function endCardOf(raw: unknown): StoryEndCard | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const button = String(r.button ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const card: StoryEndCard = {
    ...(hex(r.bg) ? { bg: hex(r.bg) } : {}),
    ...(hex(r.title) ? { title: hex(r.title) } : {}),
    ...(hex(r.text) ? { text: hex(r.text) } : {}),
    ...(hex(r.accent) ? { accent: hex(r.accent) } : {}),
    ...(button ? { button } : {}),
  }
  return Object.keys(card).length ? card : null
}

/**
 * The client's own visual as an end card, from her profile: `visual` (or
 * `visual_tokens`) for the colours, `approved_cta` for the button line.
 * A profile without a visual has no card.
 */
export function endCardFromProfile(profile: any): StoryEndCard | null {
  const v = profile?.visual ?? profile?.visual_tokens
  if (!v || typeof v !== 'object') return null
  const cta = profile?.approved_cta
  const button =
    cta && typeof cta === 'object'
      ? [cta.button, cta.bot].filter(Boolean).map(String).join(' · ')
      : ''
  return endCardOf({
    bg: hex(v.bg) ?? hex(v.surface),
    title: hex(v.gold_title) ?? hex(v.title) ?? hex(v.win),
    text: hex(v.text),
    accent: hex(v.accent_cta) ?? hex(v.accent),
    button,
  })
}

/** A list the caller passed back, kept only where it matches the scenes. */
function carried(raw: unknown, n: number): string[] {
  const list = Array.isArray(raw) ? raw.map(x => String(x ?? '').trim()) : []
  return Array.from({ length: n }, (_, i) =>
    /^https?:\/\//.test(list[i] ?? '') ? list[i] : ''
  )
}

type Tool = AgentTool | undefined

/** A borrowed tool's answer, read the same whichever language it answers in. */
function outcome(v: any): {
  ok: boolean
  url: string
  why: string
  pending: boolean
  seconds: number
  voice: string
} {
  const ok =
    v?.done === true || v?.['сделано'] === true || v?.['готово'] === true
  return {
    ok,
    url: String(v?.url ?? ''),
    why: String(v?.reason ?? v?.['причина'] ?? v?.error ?? ''),
    pending: v?.pending === true,
    seconds: Number(v?.seconds) || 0,
    voice: String(v?.['голос'] ?? ''),
  }
}

export function makeStoryReelTool(lookup: (name: string) => Tool): AgentTool {
  return {
    name: 'story_reel',
    description:
      'РИЛС-ИСТОРИЯ ОДНИМ ВЫЗОВОМ (шаблон StoryReel): одно фото с лицом → 1–4 сцены в ОДНОМ стиле и НОВОЙ ' +
      'обстановке каждая → реплика на сцену голосом (for_lead — голос клиента из crm_voice_clone; без него — ' +
      'клон владельца) → липсинк → сборка: склейки, вдох между репликами и в конце ПАУЗА с призывом cta. ' +
      'Реплики по 2–4 с, весь ролик с паузой до 15 с. Если вернулись stills/clips без видео — повтори с ними: ' +
      'готовое не делается и не оплачивается второй раз.',
    parameters: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description:
            'фото с лицом на нашей полке: эталон владельца или crm_client_face клиента',
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              setting: {
                type: 'string',
                description: 'новая обстановка сцены',
              },
              line: {
                type: 'string',
                description:
                  'реплика 2–4 с, названия словами (бот — «Тринити»)',
              },
            },
            required: ['setting', 'line'],
          },
          description: 'сцены по порядку; последняя реплика — призыв',
        },
        style: {
          type: 'string',
          description: 'один стиль на все кадры (свет, тона, канон бренда)',
        },
        for_lead: {
          type: 'string',
          description: 'id клиента: говорить ЕГО голосом (crm_voice_clone)',
        },
        cta: { type: 'string', description: 'надпись в паузе в конце' },
        end_card: {
          type: 'object',
          description:
            'финал в визуале клиента вместо стоп-кадра: bg, title, text, accent (#hex), button — строка кнопки',
          properties: {
            bg: { type: 'string' },
            title: { type: 'string' },
            text: { type: 'string' },
            accent: { type: 'string' },
            button: { type: 'string' },
          },
          additionalProperties: false,
        },
        pause_sec: {
          type: 'number',
          description: `пауза с призывом в конце, 1–4 с (по умолчанию ${STORY_PAUSE_SEC})`,
        },
        stills: {
          type: 'array',
          items: { type: 'string' },
          description:
            'уже готовые кадры (из прошлого ответа) — не рисовать заново',
        },
        clips: {
          type: 'array',
          items: { type: 'string' },
          description:
            'уже готовые липсинки (из прошлого ответа) — не делать заново',
        },
      },
      required: ['image_url', 'scenes'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const scenes = scenesOf(args.scenes)
      if (typeof scenes === 'string') return { done: false, reason: scenes }
      const source = String(args.image_url ?? '').trim()
      if (!/^https?:\/\//.test(source))
        return { done: false, reason: 'image_url: ссылка на фото с лицом' }
      const style = String(args.style ?? '')
      const n = scenes.length
      const pause = Math.min(
        4,
        Math.max(1, Number(args.pause_sec) || STORY_PAUSE_SEC)
      )
      const endCard = endCardOf(args.end_card)
      const stills = carried(args.stills, n)
      const clips = carried(args.clips, n)
      const sofar = () => ({
        stills,
        clips,
        how_to_continue:
          'повтори story_reel с теми же scenes и этими stills и clips: готовое не делается заново',
      })

      const edit = lookup('image_edit')
      const speak = lookup('audio_generate')
      const lip = lookup('lipsync_generate')
      const render = lookup('reel_render')
      if (!edit || !speak || !lip || !render)
        return {
          done: false,
          reason: 'инструменты рилса недоступны на этом сервере',
        }

      // 1. The stills that are missing, all at once, from the one source.
      const drawCtx: ToolContext = { ...ctx, imageWaitMs: STORY_STILL_WAIT_MS }
      const drawing: string[] = []
      await Promise.all(
        scenes.map(async (s, i) => {
          if (stills[i] || clips[i]) return
          const r = outcome(
            await edit
              .handler(
                {
                  image_url: source,
                  prompt: stillPrompt(s.setting, style),
                  aspect_ratio: '9:16',
                },
                drawCtx
              )
              .catch(e => ({ done: false, reason: String(e) }))
          )
          if (r.ok && r.url) stills[i] = r.url
          else drawing.push(`${i + 1}: ${r.pending ? 'ещё рисуется' : r.why}`)
        })
      )
      await ctx.storyProgress?.({ stills, clips }).catch(() => undefined)
      if (stills.some((u, i) => !u && !clips[i])) {
        return {
          done: false,
          reason:
            `кадры не все: ${drawing.join('; ')}. Дорисованный придёт в «мои файлы» (my_assets) — ` +
            'возьми его в stills по порядку сцен, не рисуй заново',
          ...sofar(),
        }
      }

      // 2 + 3. A voice and a lip-sync per scene that has no clip yet.
      const seconds: number[] = Array(n).fill(0)
      let voiceKind = ''
      const failed: string[] = []
      await Promise.all(
        scenes.map(async (s, i) => {
          if (clips[i]) return
          const v = outcome(
            await speak
              .handler(
                {
                  text: s.line,
                  ...(args.for_lead ? { for_lead: String(args.for_lead) } : {}),
                },
                ctx
              )
              .catch(e => ({ сделано: false, причина: String(e) })) // cyrillic-ok: audio_generate's own answer keys
          )
          if (!v.ok || !v.url) {
            failed.push(`голос ${i + 1}: ${v.why}`)
            return
          }
          voiceKind ||= v.voice
          const c = outcome(
            await lip
              .handler({ image_url: stills[i], voice_url: v.url }, ctx)
              .catch(e => ({ done: false, reason: String(e) }))
          )
          if (c.ok && c.url) {
            clips[i] = c.url
            seconds[i] = c.seconds
            await ctx.storyProgress?.({ stills, clips }).catch(() => undefined)
          } else failed.push(`липсинк ${i + 1}: ${c.why}`)
        })
      )
      if (clips.some(c => !c)) {
        return { done: false, reason: failed.join('; '), ...sofar() }
      }

      // 4. The template: cuts, breaths, and the pause with the call to action.
      const r = outcome(
        await render
          .handler(
            {
              compositionId: 'StoryReel',
              props: {
                scenes: clips.map(video => ({ video })),
                pauseSec: pause,
                breathSec: 0.25,
                cta: String(args.cta ?? ''),
                ...(endCard ? { endCard } : {}),
              },
            },
            ctx
          )
          .catch(e => ({ done: false, reason: String(e) }))
      )
      if (!r.ok || !r.url) {
        return { done: false, reason: `сборка: ${r.why}`, ...sofar() }
      }
      const spoken = seconds.reduce((a, b) => a + b, 0)
      return {
        done: true,
        url: r.url,
        stills,
        clips,
        ...(voiceKind ? { voice: voiceKind } : {}),
        ...(spoken
          ? { seconds: Math.round((spoken + 0.25 * (n - 1) + pause) * 10) / 10 }
          : {}),
        give_to_person: r.url,
      }
    },
  }
}

import { describe, it, expect } from 'vitest'
import {
  getServiceDisplayName,
  getServiceDisplayTitle,
  getServiceEmoji,
  resolveUserService,
  serviceFromDescription,
  SERVICE_DESCRIPTION_PREFIX,
  UserService,
} from '@/utils/serviceMapping'

/**
 * EVERY EXPENSE MUST SAY WHAT IT WAS FOR.
 *
 * Owner, 2026-09-09: "this is not a breakdown — we must know exactly what the
 * money went on; fix all the transactions". Measured on the live ledger the
 * same day (17,140 rows, 629 users): 949 of the owner's 3163 expense rows
 * displayed as "Other" and 353 as "Unknown", although metadata, the payment
 * method or the description named the service in 2286 of the 2999 unlabeled
 * rows across all users.
 *
 * Two facts shape this file:
 *  - a database trigger rewrites service_type into a short whitelist, so the
 *    column alone cannot carry the newer modes (AI Photoshop, face swap,
 *    avatar transform became 'other'; Flux Kontext and the upscaler became
 *    'neuro_photo'; AI Reels became 'text_to_video');
 *  - the trigger leaves description alone, so processBalanceOperation now
 *    writes "Payment for service: <mode>" there, and the display resolves it.
 */
const LEDGER_MODES = [
  'ai_photoshop_scene',
  'ai_photoshop',
  'flux_kontext',
  'image_upscaler',
  'face_swap',
  'faceSwapWizard',
  'avatar_transform',
  'AvatarTransform',
  'ai_reels',
  'ai_reels_render',
  'ai_reels_template_1',
  'chat_with_avatar',
  'instagram_parser',
  'neuro_photo',
  'text_to_image',
  'image_to_video',
  'image-to-video',
  'text_to_video',
  'image_to_prompt',
  'lip_sync',
  'digital_avatar_body',
  'text_to_speech',
]
const UNNAMED = new Set(['Другое', 'Неизвестно', 'Other', 'Unknown'])

describe('service mapping names every mode the ledger contains', () => {
  it.each(LEDGER_MODES)(
    '%s has a title in both languages and an emoji',
    mode => {
      expect(UNNAMED.has(getServiceDisplayTitle(mode, undefined, true))).toBe(
        false
      )
      expect(UNNAMED.has(getServiceDisplayTitle(mode, undefined, false))).toBe(
        false
      )
      expect(getServiceEmoji(mode)).not.toBe('❓')
    }
  )

  it('the description written by the app beats a column the trigger collapsed', () => {
    const photoshop = `${SERVICE_DESCRIPTION_PREFIX}ai_photoshop_scene`
    expect(getServiceDisplayTitle('other', photoshop, true)).toBe(
      'AI Photoshop'
    )
    expect(getServiceDisplayName('other', photoshop)).toBe(
      UserService.AiPhotoshop
    )
    expect(getServiceEmoji('other', photoshop)).toBe('🪄')

    // flux_kontext is stored as neuro_photo by the trigger; the description wins.
    const flux = `${SERVICE_DESCRIPTION_PREFIX}flux_kontext`
    expect(resolveUserService('neuro_photo', flux)).toBe(
      UserService.FluxKontext
    )
    expect(getServiceDisplayTitle('neuro_photo', flux, false)).toBe(
      'Photo Editing (Flux Kontext)'
    )
    expect(
      getServiceDisplayName('other', `${SERVICE_DESCRIPTION_PREFIX}face_swap`)
    ).toBe(UserService.FaceSwap)
  })

  it('a generic description invents nothing', () => {
    expect(serviceFromDescription('Payment operation')).toBeNull()
    expect(
      serviceFromDescription(`${SERVICE_DESCRIPTION_PREFIX}unknown_mode`)
    ).toBeNull()
    expect(serviceFromDescription(null)).toBeNull()
    expect(resolveUserService('other', 'Payment operation')).toBe(
      UserService.Other
    )
    expect(resolveUserService(null, null)).toBe(UserService.Unknown)
    expect(getServiceDisplayTitle('unknown_mode', undefined, true)).toBe(
      'Неизвестно'
    )
  })

  it('a real system row stays a system row', () => {
    expect(
      getServiceDisplayName(
        'payment_operation',
        '🎁 Auto-activated subscription: NEUROPHOTO'
      )
    ).toBe(UserService.PaymentOperation)
    expect(
      getServiceDisplayTitle(
        'payment_operation',
        '🎁 Auto-activated subscription: NEUROPHOTO',
        true
      )
    ).toBe('Активация подписки')
  })
})

/**
 * THE LOOKS THE WELCOME GIFT IS MADE IN -- AND THE ORDER TO KEEP THE FACE.
 *
 * The gift is a portrait of the NEWCOMER, made image-to-image from the avatar
 * Telegram already has. Two separate defects made it stop being that, both
 * measured against the live provider (kie.ai, gpt-image-2-5-flare) on
 * 2026-09-22 with a real face as the reference image.
 *
 * 1. THE PROVIDER REFUSED SEVEN OF THE TEN LOOKS WE SHIPPED. The old prompts
 *    named trademarked characters and their signature poses -- "Wonder Woman
 *    iconic pose", "Supergirl flying pose", a red-and-gold suit with a glowing
 *    chest circle, a blue suit with a white star. As text-to-image, 7 of 10
 *    came back refused; as image-to-image against a real face the filter is
 *    STRICTER still -- the one spy prompt that passed text-to-image failed
 *    when a real person was in the frame. In production this is what the owner
 *    saw: his own registration, look "Бэтмен", answered with
 *    "Content review failed. Please adjust the input and try again". No gift,
 *    and an alert on his phone.
 *
 * 2. NO PROMPT EVER MENTIONED THE REFERENCE PHOTO. Not one of the ten asked
 *    the model to keep the person's face. A portrait that passes the filter
 *    and comes back as somebody else is the complaint the owner has made
 *    repeatedly: a gift made from an avatar has to look like the avatar.
 *
 * So: every look below is an ARCHETYPE, not a character -- nothing trademarked
 * to refuse, nothing to imitate instead of the customer. Each one was sent to
 * the live provider as image-to-image with a real face and came back `success`.
 * Measured 2026-09-22, eleven for eleven:
 *
 *   blade · nightAgent · shieldMaiden · frostRanger · stormbringer ·
 *   astronaut · cyberSamurai · forestArcher · desertNomad · deepDiver · plain
 *
 * KEEP_THE_FACE is the half that makes it a gift rather than a picture, and it
 * is prepended to every look. It was measured too: with it, source and result
 * are recognisably the same person.
 *
 * PLAIN_LOOK is the retry. A filter verdict is about the WHOLE request -- the
 * costume as much as the photo -- so when a costume is refused the newcomer is
 * not out of luck: the plain portrait carries no costume to object to, and it
 * is still their own face. Only when that is refused too is the photo itself
 * the problem, and only then is the customer asked for a different one.
 */

/** One look: the id we log, the Russian name the customer reads, the costume. */
export interface GiftLook {
  id: string
  /** Shown in the gift caption -- the only Russian a customer sees from here. */
  ru: string
  /** The costume, pose and background. English: it is a prompt, not copy. */
  costume: string
}

/** The frame every look is shot in: the platform default, 9:16. */
const FRAME =
  '[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]'

/**
 * The order that makes the result a portrait OF THIS PERSON. Explicit about
 * what may not change, because "portrait of a person" alone gets a stranger
 * with a similar haircut.
 */
const KEEP_THE_FACE =
  'Keep the face from the reference photo EXACTLY as it is: same facial ' +
  'features, same face shape, same eyes, same nose, same mouth, same skin ' +
  'tone, same hair colour, clearly recognisable as the same person. Do not ' +
  'beautify, do not change the age or the ethnicity. Change only the ' +
  'clothing, the pose and the background.'

export const GIFT_LOOKS: readonly GiftLook[] = [
  {
    id: 'blade',
    ru: 'Страж клинка', // cyrillic-ok: the gift caption, read by a customer
    costume:
      'A blade master in dark ceremonial armour with silver edging, a long ' +
      'sword held point-down. Calm, unshakeable stance. Background: a stone ' +
      'hall lit by a single shaft of cold light.',
  },
  {
    id: 'nightAgent',
    ru: 'Ночной агент', // cyrillic-ok: the gift caption
    costume:
      'A field agent in a sleek black tactical jacket with a discreet earpiece. ' +
      'Watchful, composed stance. Background: a rain-slick city street at ' +
      'night, headlights blurred behind.',
  },
  {
    id: 'shieldMaiden',
    ru: 'Хранитель щита', // cyrillic-ok: the gift caption
    costume:
      'A guardian in burnished bronze armour over deep blue cloth, a round ' +
      'shield on one arm. Proud, grounded stance. Background: a cliff edge at ' +
      'sunrise, wind in the banners.',
  },
  {
    id: 'frostRanger',
    ru: 'Ледяной следопыт', // cyrillic-ok: the gift caption
    costume:
      'A ranger in a fur-lined grey cloak with frost on the shoulders. Steady, ' +
      'alert stance. Background: a pine forest under falling snow, pale blue ' +
      'winter light.',
  },
  {
    id: 'stormbringer',
    ru: 'Повелитель бури', // cyrillic-ok: the gift caption
    costume:
      'A storm caller in a dark travelling cloak with silver clasps, hair moved ' +
      'by the wind. Background: a high ridge under heavy clouds, distant ' +
      'lightning on the horizon.',
  },
  {
    id: 'astronaut',
    ru: 'Космонавт', // cyrillic-ok: the gift caption
    costume:
      'An explorer in a white spacesuit with a silver visor pushed back and ' +
      'mission patches on the sleeve. Calm, proud stance. Background: a launch ' +
      'pad at dawn, soft golden haze.',
  },
  {
    id: 'cyberSamurai',
    ru: 'Кибер-самурай', // cyrillic-ok: the gift caption
    costume:
      'A cyber-age swordsman in dark lacquered armour with thin neon-blue seams ' +
      'and a woven belt. Steady stance, hand resting on the hilt. Background: a ' +
      'rainy neon alley reflected in wet stone.',
  },
  {
    id: 'forestArcher',
    ru: 'Лесной лучник', // cyrillic-ok: the gift caption
    costume:
      'A forest archer in green and brown leather with a hooded cloak and a ' +
      'longbow. Watchful stance among tall pines. Background: morning mist and ' +
      'shafts of green light.',
  },
  {
    id: 'desertNomad',
    ru: 'Странник пустыни', // cyrillic-ok: the gift caption
    costume:
      'A desert traveller in flowing sand-coloured robes with an indigo scarf. ' +
      'Wind moving the fabric. Background: golden dunes under a wide pale sky.',
  },
  {
    id: 'deepDiver',
    ru: 'Глубоководный ныряльщик', // cyrillic-ok: the gift caption
    costume:
      'A deep-sea diver in a brass-and-steel diving suit with the helmet held ' +
      'under one arm. Background: a harbour at night, lantern light on dark ' +
      'water.',
  },
]

/** The retry: a portrait with nothing in it for a content filter to refuse. */
export const PLAIN_LOOK: GiftLook = {
  id: 'plain',
  ru: 'Кинопортрет', // cyrillic-ok: the gift caption
  costume:
    'An elegant modern portrait: a well-cut dark coat over a simple shirt, ' +
    'relaxed confident posture. Background: a soft dark studio gradient with a ' +
    'warm rim light.',
}

/** The full prompt: the frame, the order to keep the face, then the costume. */
export function giftPrompt(look: GiftLook): string {
  return `${FRAME} ${KEEP_THE_FACE} ${look.costume}`
}

/** Pick a look. `pick` is injected so a test is not at the mercy of a dice roll. */
export function pickGiftLook(pick: () => number = Math.random): GiftLook {
  const index = Math.floor(pick() * GIFT_LOOKS.length)
  return GIFT_LOOKS[Math.min(Math.max(index, 0), GIFT_LOOKS.length - 1)]
}

/** Look up a look by the id we logged, for a step that resumed from cache. */
export function giftLookById(id: string): GiftLook {
  if (id === PLAIN_LOOK.id) return PLAIN_LOOK
  return GIFT_LOOKS.find(look => look.id === id) ?? GIFT_LOOKS[0]
}

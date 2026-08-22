import { CanonSpec, CanonId } from './types'

/**
 * Три фирменных контура. Разделение задано владельцем и подтверждено правками:
 * неоновое промо для клуба было забраковано, поэтому канон выбирается явно,
 * а не «по настроению».
 *
 * Документация канонов: docs/brand/club-reel-noir.md (нуар),
 * docs/brand/blog-reel-identity.md (блог), skill canon-cover-style (обложки).
 */

/** Общая часть промпта нуара: без неё flux возвращает белые очки и худи. */
const NOIR_LOOK = [
  'strict black-and-white monochrome photograph, high contrast film noir,',
  'hard single side light, deep pure black background, subtle film grain.',
  'The man keeps his exact identity: bald head, full salt-and-pepper beard.',
  'He wears CLASSIC BLACK WAYFARER sunglasses (not white, not futuristic),',
  'a white dress shirt, black bow tie, black three-piece tuxedo with waistcoat',
  'and white pocket square. The ONLY colored element in the whole frame is a',
  'small gold triangular geometric lapel pin on his left lapel.',
  'No headphones, no chains.',
].join(' ')

export const CANONS: Record<CanonId, CanonSpec> = {
  noir: {
    id: 'noir',
    entry: 'src/index.noir.ts',
    composition: 'NoirReel',
    faceRef: 'relaunch/scene-tux.jpg',
    shots: {
      close: `Extreme close-up portrait: his face fills most of the frame, head and upper shoulders only, chin slightly down, ${NOIR_LOOK}`,
      tux: `Medium portrait from the chest up, centered, facing camera, ${NOIR_LOOK}`,
      desk: `Medium shot seated at a dark desk with an FPGA circuit board and vintage drafting instruments in front of him, hands on the desk, ${NOIR_LOOK}`,
      wide: `Waist-up shot standing in a dark corridor of faintly lit server racks receding behind him, ${NOIR_LOOK}`,
    },
    music: 'relaunch/phonk1.mp3',
    musicVolume: 0.07,
    voiceEmotion: 'happy',
  },

  promo: {
    id: 'promo',
    entry: 'src/index.ts',
    composition: 'SplitTalkingHead',
    faceRef: 'relaunch/hero-canon.jpg',
    shots: {
      hero: 'Portrait of the exact same man, keep his identity, headphones and sunglasses exactly, neon rim light, photorealistic',
      lab: 'The exact same man at a workbench covered with FPGA boards and oscilloscope, moody blue-orange lab lighting, keep his identity, headphones and sunglasses exactly',
      fab: 'The exact same man in a dark wafer fabrication room, glowing racks behind him, keep his identity, headphones and sunglasses exactly',
    },
    music: 'relaunch/phonk1.mp3',
    musicVolume: 0.07,
    voiceEmotion: 'happy',
  },

  blog: {
    id: 'blog',
    entry: 'src/index.blog.ts',
    composition: 'TrinityBlogReel',
    faceRef: 'relaunch/scene-tux.jpg',
    // У блога кадр — гравюра, а не говорящая голова: единственный план идёт
    // в овальный медальон, поэтому набор планов минимальный.
    shots: {
      medallion: `Medium portrait from the chest up, centered, facing camera, ${NOIR_LOOK}`,
    },
    music: 'relaunch/blog-music.mp3',
    musicVolume: 0.05,
    voiceEmotion: 'calm',
  },
}

export function getCanon(id: string): CanonSpec {
  const canon = CANONS[id as CanonId]
  if (!canon) {
    throw new Error(
      `Неизвестный канон «${id}». Доступны: ${Object.keys(CANONS).join(', ')}`
    )
  }
  return canon
}

import React from 'react'
import { getVideoMetadata } from '@remotion/media-utils'
import { Composition } from 'remotion'
import {
  SplitTalkingHead,
  SplitTalkingHeadSchema,
} from './compositions/SplitTalkingHead'
import { NoirReel, NoirReelSchema } from './compositions/NoirReel'
import {
  TrinityBlogReel,
  TrinityBlogReelSchema,
} from './compositions/TrinityBlogReel'
import {
  LeelaPlanReel,
  LeelaPlanReelSchema,
} from './compositions/LeelaPlanReel'
import { RelaunchReel, RelaunchReelSchema } from './compositions/RelaunchReel'
import { StoryReel, StoryReelSchema } from './compositions/StoryReel'
import { resolveMediaPath } from './shared/mediaPath'
import {
  CAPTION_DEFAULTS,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_AVATAR_CONFIG,
} from './constants/captions'

/**
 * Это ЕДИНСТВЕННЫЙ граф, который бандлит рендер-сервер (render-server.ts,
 * entryPoint ./src/index.ts). Что не зарегистрировано здесь — недоступно ни
 * через `GET /compositions`, ни через `POST /render`, а значит недоступно и
 * мини-аппу. Отдельные точки входа (index.noir.ts, index.blog.ts) остаются
 * для локального CLI-рендера, но регистрация ЗДЕСЬ — то, что открывает
 * шаблоны другим людям.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* RelaunchReel — промо «рилсы прямо в боте». Без внешних медиа:
          рендерится где угодно без сети, в отличие от SplitTalkingHead. */}
      <Composition
        id="RelaunchReel"
        component={RelaunchReel}
        durationInFrames={540}
        fps={30}
        width={1080}
        height={1920}
        schema={RelaunchReelSchema}
        defaultProps={{
          botHandle: '@neuro_blogger_bot',
          ctaCommand: '/start',
          accentA: '#7C3AED',
          accentB: '#06B6D4',
          accentC: '#F472B6',
        }}
      />

      {/* SplitTalkingHead - Main template */}
      <Composition
        id="SplitTalkingHead"
        component={SplitTalkingHead}
        durationInFrames={1020}
        fps={30}
        width={1080}
        height={1920}
        schema={SplitTalkingHeadSchema}
        defaultProps={SplitTalkingHeadSchema.parse({
          lipSyncVideo: '/lipsync/lipsync.mp4',
          captionLanguage: 'ru',
          captionColor: CAPTION_DEFAULTS.textColor,
          splitRatio: 0.5,
          backgroundMusic: '',
          musicVolume: DEFAULT_MUSIC_VOLUME,
          segments: [
            {
              type: 'split' as const,
              startFrame: 0,
              durationFrames: 210,
              bRollUrl: '/b-rolls/00.mp4',
              bRollType: 'video' as const,
              caption: '',
            },
            {
              type: 'split' as const,
              startFrame: 210,
              durationFrames: 180,
              bRollUrl: '/b-rolls/01.mp4',
              bRollType: 'video' as const,
              caption: '',
            },
            {
              type: 'fullscreen' as const,
              startFrame: 390,
              durationFrames: 90,
              caption: '',
            },
            {
              type: 'split' as const,
              startFrame: 480,
              durationFrames: 180,
              bRollUrl: '/b-rolls/02.mp4',
              bRollType: 'video' as const,
              caption: '',
            },
            {
              type: 'fullscreen' as const,
              startFrame: 660,
              durationFrames: 90,
              caption: '',
            },
            {
              type: 'split' as const,
              startFrame: 750,
              durationFrames: 180,
              bRollUrl: '/b-rolls/03.mp4',
              bRollType: 'video' as const,
              caption: '',
            },
            {
              type: 'fullscreen' as const,
              startFrame: 930,
              durationFrames: 90,
              caption: '',
            },
          ],
          ctaText: 'COMMENT PERSONA',
          ctaHighlight: 'PERSONA',
          captions: [],
          showCaptions: true,
          captionStyle: {
            fontSize: 56,
            highlightColor: CAPTION_DEFAULTS.highlightColor,
          },
          // Avatar settings
          avatarSettingsTab: 'split' as const,
          avatarAnimation: 'pop' as const,
          // Avatar border effect
          avatarBorderEffect: 'none' as const,
          avatarBorderColor: DEFAULT_AVATAR_CONFIG.borderColor,
          avatarBorderColor2: DEFAULT_AVATAR_CONFIG.borderColor2,
          avatarBorderWidth: 4,
          avatarBorderIntensity: 1.0,
          // Image overlays
          imageOverlays: [],
        })}
        calculateMetadata={async ({ props }) => {
          const fps = 30
          let durationInFrames = 1020 // Default fallback

          // Get actual video duration
          try {
            const videoUrl = resolveMediaPath(props.lipSyncVideo)
            const metadata = await getVideoMetadata(videoUrl)
            durationInFrames = Math.ceil(metadata.durationInSeconds * fps)
            console.log(
              `📏 LipSync video duration: ${metadata.durationInSeconds.toFixed(2)}s = ${durationInFrames} frames`
            )
          } catch (e) {
            console.warn(
              'Could not get video metadata, using default duration:',
              e
            )
          }

          return {
            durationInFrames,
            props,
          }
        }}
      />

      {/* NoirReel — канон клуба «Золотая Литейная»: ч/б нуар + графика главной t27.ai */}
      <Composition
        id="NoirReel"
        component={NoirReel as never}
        durationInFrames={810}
        fps={30}
        width={1080}
        height={1920}
        schema={NoirReelSchema}
        defaultProps={{
          lipSyncVideo: '',
          captions: [],
          cutaways: [],
          music: '',
          musicVolume: 0.07,
          brand: {
            masthead: 'Trinity S³AI',
            eyebrow: 'Закрытый клуб · набор волнами',
            name: 'Золотая Литейная',
            cta: 't27.ai/foundry',
            sub: 'оплата в боте · @t27ai_bot',
          },
        }}
        calculateMetadata={async ({ props }) => {
          // Длину диктует дорожка: константа рассинхронизирует финал.
          if (!props.lipSyncVideo) return {}
          try {
            const meta = await getVideoMetadata(
              resolveMediaPath(props.lipSyncVideo)
            )
            return { durationInFrames: Math.round(meta.durationInSeconds * 30) }
          } catch {
            return {}
          }
        }}
      />

      {/* TrinityBlogReel — канон блога: барочная гравюра, золото только заголовок */}
      <Composition
        id="TrinityBlogReel"
        component={TrinityBlogReel as never}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        schema={TrinityBlogReelSchema}
        defaultProps={{
          lang: 'ru' as const,
          title: 'Заголовок поста',
          subtitle: '',
          dateline: '',
          tags: [],
          plates: [],
          lesson: 'Проверено измерением, а не заявлено.',
          invariant: 'measured, not claimed',
          url: 't27.ai/blog',
          year: 'MMXXVI',
          musicVolume: 0.05,
          captions: [],
        }}
        calculateMetadata={async ({ props }) => {
          // Акты делят длину долями — длина берётся из последнего слова озвучки.
          const last = props.captions?.length
            ? Math.max(...props.captions.map((c: { endMs: number }) => c.endMs))
            : 0
          if (!last) return {}
          return { durationInFrames: Math.round((last / 1000 + 1.2) * 30) }
        }}
      />

      {/* StoryReel: the owner's mini-story -- one lip-synced scene per line,
          each in its own setting, a call to action and a pause at the end.
          Length comes from the clips, so every cut lands where a line ends. */}
      <Composition
        id="StoryReel"
        component={StoryReel as never}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        schema={StoryReelSchema}
        defaultProps={{
          scenes: [] as { video: string }[],
          sceneFrames: [] as number[],
          pauseSec: 2,
          cta: '',
          musicVolume: 0.06,
        }}
        calculateMetadata={async ({ props }) => {
          // A scene that cannot be measured stops the render here, loudly:
          // the fallback length would stretch every cut to the wrong place.
          const frames = await Promise.all(
            (props.scenes ?? []).map(
              async (scene: { video: string }, i: number) => {
                try {
                  const meta = await getVideoMetadata(
                    resolveMediaPath(scene.video)
                  )
                  return Math.max(1, Math.round(meta.durationInSeconds * 30))
                } catch (e) {
                  throw new Error(
                    `StoryReel: scene ${i + 1} could not be measured (${String(e).slice(0, 160)})`
                  )
                }
              }
            )
          )
          if (!frames.length) return {}
          const pause = Math.round((props.pauseSec ?? 0) * 30)
          return {
            durationInFrames: frames.reduce((a, b) => a + b, 0) + pause,
            props: { ...props, sceneFrames: frames },
          }
        }}
      />

      {/* LeelaPlanReel: one throw, one plan, one observation; every word is canon */}
      <Composition
        id="LeelaPlanReel"
        component={LeelaPlanReel as never}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
        schema={LeelaPlanReelSchema}
        defaultProps={{
          lang: 'ru' as const,
          plan: 6,
          showBoard: true,
          musicVolume: 0.05,
        }}
      />
    </>
  )
}

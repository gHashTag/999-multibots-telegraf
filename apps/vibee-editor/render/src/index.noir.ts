/**
 * Точка входа шаблона NoirReel (клуб «Золотая Литейная»).
 *
 *   npx remotion render src/index.noir.ts NoirReel out/club-noir.mp4 --props=props.json
 *
 * Отдельная точка входа по той же причине, что у блога и промо: основной
 * граф тянет @vibee/atoms → jotai, нуару это не нужно.
 */
import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { getVideoMetadata } from '@remotion/media-utils';
import { NoirReel, NoirReelSchema } from './compositions/NoirReel';

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: 'NoirReel',
    component: NoirReel as never,
    durationInFrames: 810,
    fps: 30,
    width: 1080,
    height: 1920,
    schema: NoirReelSchema,
    // Длину диктует липсинк-дорожка + хвост на финальную карточку: жёсткая
    // константа рассинхронизирует конец (проверено на блог-рилсе).
    calculateMetadata: async ({
      props,
    }: {
      props: { lipSyncVideo?: string; endCardTailSec?: number };
    }) => {
      if (!props.lipSyncVideo) return {};
      try {
        const meta = await getVideoMetadata(props.lipSyncVideo);
        // Хвост по умолчанию 0: OffthreadVideo за пределами своего файла —
        // это ошибка кадра, а финальная карточка и так живёт в тишине после
        // последнего слова (озвучка кончается раньше дорожки).
        const tail = props.endCardTailSec ?? 0;
        return {
          durationInFrames: Math.round((meta.durationInSeconds + tail) * 30),
        };
      } catch {
        return {};
      }
    },
    defaultProps: {
      lipSyncVideo: '',
      captions: [],
      cutaways: [],
      music: '',
      musicVolume: 0.07,
      brand: {
        masthead: 'TRINITY',
        eyebrow: 'Закрытый клуб · набор волнами',
        name: 'Золотая Литейная',
        cta: 't27.ai/foundry',
        sub: 'оплата в боте · @t27ai_bot',
      },
    },
  });

registerRoot(Root);

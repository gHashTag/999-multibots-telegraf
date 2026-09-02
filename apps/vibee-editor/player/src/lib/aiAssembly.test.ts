import { describe, expect, it } from 'vitest'

import { planAiAssembly } from './aiAssembly'

describe('AI assembly plan', () => {
  it('lays new layers end to end on their native editor tracks', () => {
    const plan = planAiAssembly(
      [
        { id: 'image-1', type: 'image', timestamp: 10 },
        { id: 'video-1', type: 'video', timestamp: 20 },
        { id: 'audio-1', type: 'audio', timestamp: 30 },
        { id: 'video-2', type: 'video', timestamp: 40 },
      ],
      [
        {
          id: 'track-video',
          items: [
            { assetId: 'existing-video', startFrame: 0, durationInFrames: 60 },
          ],
        },
        { id: 'track-image', items: [] },
        { id: 'track-audio', items: [] },
      ]
    )

    expect(plan).toEqual([
      {
        assetId: 'image-1',
        type: 'image',
        trackId: 'track-image',
        startFrame: 0,
        durationInFrames: 90,
      },
      {
        assetId: 'video-1',
        type: 'video',
        trackId: 'track-video',
        startFrame: 60,
        durationInFrames: 90,
      },
      {
        assetId: 'audio-1',
        type: 'audio',
        trackId: 'track-audio',
        startFrame: 0,
        durationInFrames: 150,
      },
      {
        assetId: 'video-2',
        type: 'video',
        trackId: 'track-video',
        startFrame: 150,
        durationInFrames: 90,
      },
    ])
  })

  it('never adds an asset that is already on any track', () => {
    expect(
      planAiAssembly(
        [{ id: 'used', type: 'image', timestamp: 10 }],
        [
          {
            id: 'track-video',
            items: [{ assetId: 'used', startFrame: 0, durationInFrames: 90 }],
          },
        ]
      )
    ).toEqual([])
  })
})

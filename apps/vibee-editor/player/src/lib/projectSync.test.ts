import { describe, expect, it, vi } from 'vitest'

vi.mock('./apiFetch', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from './apiFetch'
import {
  buildProjectDocument,
  hydrateProjectDocument,
  listCloudProjects,
  loadCloudProject,
  saveCloudProject,
} from './projectSync'

const project = {
  id: 'project-one',
  name: 'Welcome reel',
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 90,
}
const assets = [
  {
    id: 'asset-one',
    type: 'video' as const,
    name: 'Scene one',
    url: 'https://media.example/scene.mp4',
    thumbnail: 'https://media.example/poster.jpg',
  },
]
const tracks = [
  {
    id: 'track-one',
    type: 'video' as const,
    name: 'Scenes',
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    items: [
      {
        id: 'clip-one',
        trackId: 'track-one',
        assetId: 'asset-one',
        type: 'video' as const,
        volume: 1,
        playbackRate: 1,
        startFrame: 0,
        durationInFrames: 90,
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        rotation: 0,
        opacity: 1,
      },
    ],
  },
]

describe('project sync document', () => {
  it('stores native-readable URLs and restores web editor state', () => {
    const captions = [
      {
        text: 'Hello',
        startMs: 0,
        endMs: 420,
        timestampMs: 0,
        confidence: 0.98,
      },
    ]
    const captionStyle = {
      fontSize: 64,
      textColor: '#fff',
      highlightColor: '#00ff99',
      backgroundColor: '#000',
      bottomPercent: 16,
      maxWidthPercent: 88,
      fontWeight: 800,
      showShadow: true,
      fontFamily: 'Inter',
      animation: 'pop' as const,
    }
    const document = buildProjectDocument({
      project,
      tracks,
      assets,
      captions,
      captionStyle,
      showCaptions: true,
    })

    expect(document.schemaVersion).toBe(1)
    expect(document.tracks[0].items[0]).toMatchObject({
      assetId: 'asset-one',
      url: 'https://media.example/scene.mp4',
    })
    expect(hydrateProjectDocument(document)).toEqual({
      project,
      tracks,
      assets,
      captions,
      captionStyle,
      showCaptions: true,
    })
  })

  it('materializes an asset for a native clip with only a URL', () => {
    const document = buildProjectDocument({
      project,
      tracks,
      assets: [],
      captions: [],
      captionStyle: undefined,
      showCaptions: false,
    })
    document.tracks[0].items[0] = {
      ...document.tracks[0].items[0],
      assetId: undefined,
      url: 'https://media.example/native.mov',
    }
    const restored = hydrateProjectDocument(document)
    expect(restored.assets[0]).toMatchObject({
      id: expect.stringMatching(/^remote-/),
      type: 'video',
      url: 'https://media.example/native.mov',
    })
    expect(restored.tracks[0].items[0].assetId).toBe(restored.assets[0].id)
  })

  it('loads the native iOS composition shape without browser metadata', () => {
    const restored = hydrateProjectDocument({
      schemaVersion: 1,
      fps: 24,
      width: 1080,
      height: 1920,
      tracks,
    })
    expect(restored.project).toMatchObject({
      id: '',
      name: 'Synced project',
      fps: 24,
      durationInFrames: 90,
    })
  })

  it('rejects unsupported documents before atom mutation', () => {
    expect(() =>
      hydrateProjectDocument({ schemaVersion: 2, tracks: [] })
    ).toThrow(/schemaVersion/)
    expect(() => hydrateProjectDocument({ schemaVersion: 1 })).toThrow(/tracks/)
  })
})

describe('project sync API', () => {
  it('uses owner-authenticated routes without a client owner id', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ projects: [] })
      .mockResolvedValueOnce({
        id: project.id,
        name: project.name,
        updated_at: '2026-09-02T00:00:00.000Z',
        composition: { schemaVersion: 1 },
      })
      .mockResolvedValueOnce({
        id: project.id,
        name: project.name,
        updated_at: '2026-09-02T00:00:01.000Z',
      })
    await listCloudProjects()
    await loadCloudProject(project.id)
    await saveCloudProject(project.id, project.name, { schemaVersion: 1 })
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/projects')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/projects/project-one')
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/projects/project-one', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Welcome reel',
        composition: { schemaVersion: 1 },
      }),
    })
    expect(JSON.stringify(vi.mocked(apiFetch).mock.calls)).not.toMatch(
      /telegram(_|I)d/i
    )
  })
})

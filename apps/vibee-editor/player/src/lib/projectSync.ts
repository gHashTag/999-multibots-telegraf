import type { Asset, Project, Track, TrackItem } from '@/store/types'
import type { CaptionItem, CaptionStyle } from '@vibee/atoms'
import { apiFetch } from './apiFetch'

export interface CloudProjectSummary {
  id: string
  name: string
  updated_at: string
}

export interface ProjectDocumentV1 {
  schemaVersion: 1
  project: Project
  fps: number
  width: number
  height: number
  tracks: Array<Track & { items: Array<TrackItem & { url?: string }> }>
  assets: Asset[]
  captions: CaptionItem[]
  captionStyle?: CaptionStyle
  showCaptions: boolean
}

export interface EditorProjectState {
  project: Project
  tracks: Track[]
  assets: Asset[]
  captions: CaptionItem[]
  captionStyle?: CaptionStyle
  showCaptions: boolean
}

interface CloudProject extends CloudProjectSummary {
  composition: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const remoteAssetId = (url: string): string => {
  let hash = 2166136261
  for (let i = 0; i < url.length; i += 1) {
    hash ^= url.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `remote-${(hash >>> 0).toString(16)}`
}

const assetTypeForTrack = (track: Track): Asset['type'] => {
  if (track.type === 'image') return 'image'
  if (track.type === 'voice') return 'voice'
  if (track.type === 'audio') return 'audio'
  return 'video'
}

export function buildProjectDocument(
  state: EditorProjectState
): ProjectDocumentV1 {
  const byId = new Map(state.assets.map(asset => [asset.id, asset]))
  const tracks = state.tracks.map(track => ({
    ...track,
    items: track.items.map(item => {
      const asset = item.assetId ? byId.get(item.assetId) : undefined
      return asset?.url ? { ...item, url: asset.url } : { ...item }
    }),
  }))
  return {
    schemaVersion: 1,
    project: { ...state.project },
    fps: state.project.fps,
    width: state.project.width,
    height: state.project.height,
    tracks,
    assets: state.assets.map(asset => ({ ...asset })),
    captions: state.captions.map(caption => ({ ...caption })),
    captionStyle: state.captionStyle ? { ...state.captionStyle } : undefined,
    showCaptions: state.showCaptions,
  }
}

export function hydrateProjectDocument(value: unknown): EditorProjectState {
  if (!isObject(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported project schemaVersion')
  }
  if (!Array.isArray(value.tracks))
    throw new Error('Project tracks are missing')

  const assets: Asset[] = Array.isArray(value.assets)
    ? value.assets
        .filter(isObject)
        .map(asset => ({ ...asset }) as unknown as Asset)
    : []
  const byUrl = new Map(assets.map(asset => [asset.url, asset]))
  const byId = new Map(assets.map(asset => [asset.id, asset]))

  const tracks = value.tracks.filter(isObject).map(rawTrack => {
    const track = { ...rawTrack } as unknown as Track & {
      items?: Array<TrackItem & { url?: string }>
    }
    const items = Array.isArray(track.items) ? track.items : []
    return {
      ...track,
      items: items.map(rawItem => {
        const item = { ...rawItem } as TrackItem & {
          url?: string
          name?: string
        }
        const url = typeof item.url === 'string' ? item.url : ''
        let asset = item.assetId ? byId.get(item.assetId) : undefined
        if (!asset && url) {
          asset = byUrl.get(url)
          if (!asset) {
            asset = {
              id: remoteAssetId(url),
              type: assetTypeForTrack(track),
              name: item.name || 'Synced media',
              url,
            }
            assets.push(asset)
            byUrl.set(url, asset)
            byId.set(asset.id, asset)
          }
        }
        const { url: _resolvedUrl, ...webItem } = item
        return {
          ...webItem,
          ...(asset ? { assetId: asset.id } : {}),
        } as TrackItem
      }),
    } as Track
  })

  const durationInFrames = tracks
    .flatMap(track => track.items)
    .reduce(
      (max, item) => Math.max(max, item.startFrame + item.durationInFrames),
      0
    )
  const project = isObject(value.project)
    ? ({ ...value.project } as unknown as Project)
    : {
        id: '',
        name: 'Synced project',
        fps: Number(value.fps) || 30,
        width: Number(value.width) || 1080,
        height: Number(value.height) || 1920,
        durationInFrames,
      }

  return {
    project,
    tracks,
    assets,
    captions: Array.isArray(value.captions)
      ? value.captions
          .filter(isObject)
          .map(item => ({ ...item }) as unknown as CaptionItem)
      : [],
    captionStyle: isObject(value.captionStyle)
      ? ({ ...value.captionStyle } as unknown as CaptionStyle)
      : undefined,
    showCaptions: value.showCaptions === true,
  }
}

export function hydrateCloudProject(value: CloudProject): EditorProjectState {
  const state = hydrateProjectDocument(value.composition)
  return {
    ...state,
    project: {
      ...state.project,
      id: value.id,
      name: value.name || state.project.name,
    },
  }
}

export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const result = await apiFetch<{ projects: CloudProjectSummary[] }>(
    '/api/projects'
  )
  return result.projects
}

export async function loadCloudProject(id: string): Promise<CloudProject> {
  return apiFetch<CloudProject>(`/api/projects/${encodeURIComponent(id)}`)
}

export async function saveCloudProject(
  id: string,
  name: string,
  composition: unknown
): Promise<CloudProjectSummary> {
  return apiFetch<CloudProjectSummary>(
    `/api/projects/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ name, composition }),
    }
  )
}

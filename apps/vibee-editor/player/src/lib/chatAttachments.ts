import { API_BASE } from '@/config'
import { apiFetch } from '@/lib/apiFetch'
import { uploadToS3 } from '@/lib/s3Upload'

export const MAX_CHAT_ATTACHMENTS = 4
export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024

export type AgentAttachmentKind = 'image' | 'video'

export interface AgentAttachment {
  id: string
  kind: AgentAttachmentKind
  name: string
  url: string
  size: number
}

export interface AcceptedAttachment {
  file: File
  kind: AgentAttachmentKind
}

export type AttachmentRejectionReason =
  'unsupported-type' | 'too-large' | 'too-many'

export interface AttachmentRejection {
  name: string
  reason: AttachmentRejectionReason
}

export function attachmentKind(
  file: Pick<File, 'type'>
): AgentAttachmentKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

/**
 * Validate before any network call. The render upload route has the same
 * 100 MB hard limit, so the UI cannot promise a file the server will reject.
 */
export function validateAttachmentSelection(
  files: File[],
  existingCount: number
): { accepted: AcceptedAttachment[]; rejected: AttachmentRejection[] } {
  const accepted: AcceptedAttachment[] = []
  const rejected: AttachmentRejection[] = []

  for (const file of files) {
    const kind = attachmentKind(file)
    if (!kind) {
      rejected.push({ name: file.name, reason: 'unsupported-type' })
      continue
    }
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      rejected.push({ name: file.name, reason: 'too-large' })
      continue
    }
    if (existingCount + accepted.length >= MAX_CHAT_ATTACHMENTS) {
      rejected.push({ name: file.name, reason: 'too-many' })
      continue
    }
    accepted.push({ file, kind })
  }

  return { accepted, rejected }
}

/**
 * The model gets only server URLs and media kinds. A user-controlled filename
 * is display metadata, not an instruction, so it never enters the prompt.
 */
export function buildAgentMessageContent(
  text: string,
  attachments: AgentAttachment[] = []
): string {
  const trimmed = text.trim()
  if (!attachments.length) return trimmed
  const request =
    trimmed || 'Используй прикреплённые ассеты для создания контента.'
  const safeAssets = attachments.map(({ kind, url }) => ({ kind, url }))
  return `${request}\n\n<attached_assets>\n${JSON.stringify(safeAssets)}\n</attached_assets>`
}

function localAttachmentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Upload once, then bind the resulting URL to the verified owner profile. */
export async function uploadChatAttachment(
  file: File,
  kind: AgentAttachmentKind,
  signal?: AbortSignal
): Promise<AgentAttachment> {
  const url = await uploadToS3(file, file.name, undefined, signal)
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('upload-failed')
  }

  const registered = await apiFetch<{ id?: string | number }>(
    `${API_BASE}/api/assets`,
    {
      method: 'POST',
      signal,
      body: JSON.stringify({
        url,
        type: kind === 'image' ? 'user_image' : 'user_video',
      }),
    }
  )

  return {
    id: registered.id != null ? String(registered.id) : localAttachmentId(),
    kind,
    name: file.name,
    url,
    size: file.size,
  }
}

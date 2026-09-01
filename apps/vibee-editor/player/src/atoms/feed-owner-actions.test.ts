import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'feed.ts'), 'utf8')

describe('owner template actions use the render API', () => {
  it('deletes through the configured API origin, not the player SPA', () => {
    expect(source).toContain(
      "apiFetch(`${API_BASE}/api/feed/${templateId}`, { method: 'DELETE' })"
    )
    expect(source).not.toContain(
      "apiFetch(`/api/feed/${templateId}`, { method: 'DELETE' })"
    )
  })

  it('carries the remote id from edit into the next publish', () => {
    expect(source).toContain('set(editingFeedTemplateIdAtom, template.id)')
    expect(source).toContain('templateId: editingTemplateId ?? undefined')
    expect(source).toContain('template_id: data.templateId ?? null')
  })
})

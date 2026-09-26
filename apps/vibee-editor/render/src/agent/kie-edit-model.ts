/**
 * The img2img model that keeps the person -- the evidence is in
 * src/kie-image.ts, which re-exports this name.
 *
 * A module without imports, like kie-models.ts: billing-shared.ts prices the
 * `image_edit` operation from this id, and importing it from kie-image.ts
 * instead would close a cycle (kie-image -> kie-web-provider ->
 * billing-shared).
 */
export const EDIT_MODEL = 'google/nano-banana-edit'

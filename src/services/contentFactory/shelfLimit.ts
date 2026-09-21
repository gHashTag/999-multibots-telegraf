/**
 * The largest body the shelf's `POST /upload` accepts: `maxSize` in the
 * `/upload` handler of apps/vibee-editor/render/render-server.ts. The mini app
 * has the same limit. Named here so a refusal can say the real number.
 *
 * Its own module, not storage.ts: many tests replace storage.ts wholesale, and
 * a number is not something a test should have to fake.
 */
export const SHELF_UPLOAD_LIMIT = 100 * 1024 * 1024

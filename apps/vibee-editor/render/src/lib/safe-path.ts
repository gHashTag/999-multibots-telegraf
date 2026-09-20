import path from 'node:path'

/**
 * A PATH UNDER A ROOT, WITH SUBDIRECTORIES, AND NO WAY OUT.
 *
 * The static routes -- `/renders/`, `/public/`, `/hls/` and the prefix-less
 * `/covers/`, `/lipsync/`, `/music/` family -- are all in PUBLIC_PREFIXES, so
 * `authenticate` returns `via: 'public'` before any check runs. Each of them
 * did `path.join(ROOT, rest)` with no validation, and `path.join` RESOLVES
 * `..`:
 *
 *   curl --path-as-is https://host/renders/../../../etc/passwd
 *
 * read that file and served it, to anybody, with no credential. Found by an
 * adversarial sweep on 2026-09-20 and reproduced against a copy of the
 * handler.
 *
 * ── WHY PER SEGMENT ────────────────────────────────────────────────────────
 *
 * A check on the joined string is a check on something `path.join` has
 * already collapsed. So the decision is made on the segments, before any
 * joining happens.
 *
 * ── WHY IT LIVES IN ITS OWN FILE ───────────────────────────────────────────
 *
 * It was first written inside render-server.ts, and the test mirrored it --
 * so deleting the `..` check from the source passed the test untouched. A
 * double that reimplements the rule proves nothing about the rule. Here there
 * is one copy, and the test imports it.
 *
 * `safeJoin` in render-server.ts stays for the stricter case: a single file
 * name with no separator at all.
 */
export function safeUnder(rootDir: string, relPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(relPath)
  } catch {
    // A percent-encoding we cannot decode is a refusal, never a fallback to
    // the raw text -- that fallback is an attacker's second chance.
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null
  const segments = decoded.split('/').filter(seg => seg !== '')
  if (!segments.length) return null
  /*
   * BELT, NOT BRACES -- AND MEASURED AS SUCH.
   *
   * Deleting this loop leaves every traversal test passing: `path.resolve`
   * collapses `..` and the containment check below refuses the result. A
   * mutation run said exactly that, and the honest answer is to record it
   * rather than invent a case that keeps the line "covered".
   *
   * It stays because it refuses BEFORE resolving, so the decision never
   * depends on what resolve does with a path on some other platform -- and
   * because a reader of the containment check alone has to reason about
   * collapsing to see why it is safe.
   */
  for (const seg of segments) {
    if (seg === '.' || seg === '..') return null
  }
  const root = path.resolve(rootDir)
  const resolved = path.resolve(root, segments.join('/'))
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

/**
 * SECRET-SHAPED BY CONSTRUCTION, NOT BY LITERAL.
 *
 * `redactSecrets` exists because a 401 body habitually quotes back the
 * credential it rejected, and the owner's alert group has ordinary members in
 * it. Proving it works means feeding it something with the real shape.
 *
 * Written out as literals, those shapes trip this repository's own pre-commit
 * guard -- correctly. Nothing that reads a diff can tell a synthetic
 * `sk-proj-…` from an issued one; that is the entire reason the guard exists,
 * and it is how a LIVE Fal.ai key once sat unnoticed inside
 * src/__tests__/ai-reels-fal-integration.test.ts (the note is in
 * scripts/security-token-guard.sh). GitHub's scanner cannot tell them apart
 * either, so a literal here also buys a standing alert nobody can close.
 *
 * So the prefix is kept apart from the body and joined at runtime. The string
 * handed to the scrubber is byte-identical to the literal -- only the bytes on
 * disk differ. `security-token-guard.sh` uses this same idiom on its own
 * documentation, for the same reason: the note above its Telegram pattern says
 * the example is deliberately not written as a literal, because it would match
 * the very rule it illustrates.
 *
 * ONLY the two shapes the guard actually matches are assembled. The others
 * (xai-, r8_, ghp_) fall under its length floors and stay readable as
 * literals at their call sites; assembling them too would hide, behind a
 * ceremony, which shapes are genuinely dangerous to write down.
 *
 * WHY NOT `secret-guard-ok:`, WHICH THIS REPOSITORY ALSO USES. Because of what
 * the literal is FOR. In no-secrets-in-repo.test.ts the literal IS the subject:
 * that suite proves the dictionaries catch each shape, so the shape has to sit
 * in its source or the self-check asserts nothing, and the annotation is the
 * only honest answer. Here the value is merely an argument handed to
 * `redactSecrets`; nothing requires it to exist on disk. An annotation would
 * silence the guard and leave the bytes -- and the bytes are what an outside
 * scanner reads.
 */

/** Matches `sk-(ant-)?(proj-)?[A-Za-z0-9_-]{20,}` once joined. */
export const SYNTHETIC_OPENAI_KEY = 'sk-' + 'proj-AbC123dEf456GhI789'

/** Matches `(^|[^0-9])[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}` once joined. */
export const SYNTHETIC_BOT_TOKEN =
  '7612345678:' + 'AA' + 'HdqTcvCH1vGWJxfSeofSAs0K5PALDsaw'

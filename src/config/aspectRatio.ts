/**
 * ONE DEFAULT SHAPE FOR EVERY ASSET: PORTRAIT.
 *
 * Every asset this platform makes is looked at on a phone, in a feed that is
 * taller than it is wide -- Instagram Reels and Stories, TikTok, Telegram. A
 * square or a landscape frame arrives there letterboxed: the subject shrinks
 * into a band in the middle and the customer has to crop it by hand before it
 * is usable anywhere they meant to put it.
 *
 * The defaults did not agree with that. Image generators fell back to '1:1'
 * and video generators to '16:9', each in its own file, each written at a
 * different time -- eleven separate fallbacks, none of them a decision anybody
 * had made twice. New users are already created with `aspect_ratio: '9:16'`
 * (scenes/createUserScene.ts), so the fallbacks only ever applied when the
 * stored preference could not be read -- and then they contradicted it.
 *
 * So the fallback lives here, once, and every generator points at it. A
 * PERSON'S OWN CHOICE STILL WINS: `getAspectRatio()` reads `users.aspect_ratio`
 * and the call sites keep their `dbValue || paramValue || DEFAULT` order. This
 * is what happens when nothing was chosen, not an override of what was.
 *
 * (Not covered on purpose: generateNanoBananaPro's nearest-ratio mapper, which
 * picks the closest supported ratio to an explicit width/height, and every
 * `=== '16:9'` comparison that asks which shape was chosen rather than which
 * to assume. Those read a shape; they do not default one.)
 */

/** The shape an asset takes when nobody said otherwise. */
export const DEFAULT_ASPECT_RATIO = '9:16'

/**
 * Same value for the video generators, named separately only so a reader of
 * KieAiProvider sees that vertical video was meant, not inherited by accident
 * from an image constant. Reels and TikTok are the same frame as Stories.
 */
export const DEFAULT_VIDEO_ASPECT_RATIO = DEFAULT_ASPECT_RATIO

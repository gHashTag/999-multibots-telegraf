#!/usr/bin/env node
// tri guards -- run the critical money/security/reliability RATCHETS as one fast
// focused suite (a self-healing check), instead of the full ~3260-test run.
//
// WHY. Each of these tests pins an INVARIANT a money/security bug had already
// regressed once: a paid generation must never price to 0, a deduction must hold
// the per-user lock, a payment InvId must be deterministic, privileged commands
// must be admin-gated, webhook routes must guard JSON.parse, debug endpoints must
// be NODE_ENV-gated, the public/protected router split must hold, every Inngest
// function must be served-or-explained. Other agents share this repo; running
// this list after a sync catches a regression in seconds. This just codifies the
// list I would otherwise retype by hand each iteration.
//
// Usage: node .claude/loop-opus/guards.mjs        # run + summarize
//        node .claude/loop-opus/guards.mjs --list # print the tracked files

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// The critical invariant ratchets. Add a file here when you ship a new one.
const GUARDS = [
  'src/__tests__/money/unifiedModelPriceFailClosed.test.ts', // #1458 fail-closed price
  'src/__tests__/money/paymentHandlerInvIdDeterministic.test.ts', // #1430 InvId determinism
  'src/__tests__/money/unlockedDeductionLocked.test.ts', // #1432 balance-lock hatch
  'src/__tests__/money/creditNotInLoop.test.ts', // #1468/#1470 credit-in-loop mint
  'src/__tests__/security/privilegedCommandAdminGate.test.ts', // #1441 admin gate (addbalance mints)
  'src/__tests__/security/x402CreditFailClosed.test.ts', // iter189 x402 credit fail-closed (no settlement verify)
  'src/__tests__/security/creditWebhookAuthenticated.test.ts', // iter190 repo-wide: every credit-route authed before crediting
  'src/__tests__/money/inngestMoneyInStepRun.test.ts', // iter191 inngest money mutations wrapped in step.run (retry-idempotent)
  'src/__tests__/reliability/inngestStepIdStaticInLoop.test.ts', // iter192 no static inngest step id inside a loop (memoization collision)
  'src/__tests__/reliability/chatWithAvatarDeliveryFallback.test.ts', // iter194 image delivery has document fallback (charge-no-delivery mitigation)
  'src/__tests__/money/videoPollChargeIdempotent.test.ts', // iter195 i2v poll-loop charge is idempotency-guarded (no 120x re-charge)
  'src/__tests__/security/voiceAvatarNoTokenLog.test.ts', // iter195 createVoiceAvatar does not console.log the bot-token-bearing fileUrl
  'src/__tests__/money/emailWizardPriceAllowlist.test.ts', // iter196 emailWizard setPayments gated by paymentOptions allowlist (no price bypass)
  'src/__tests__/reliability/avatarBrainNoHtmlParse.test.ts', // iter196 avatarBrainWizard no parse_mode:HTML on raw user text (no 400)
  'src/__tests__/helpers/voiceValidation.test.ts', // iter197 voice pointer cleared only on authoritative absence (no wipe on key-gap/outage)
  'src/__tests__/security/statsBotAccessFailClosed.test.ts', // iter197 interactiveStats bot-access guards fail closed on null ownedBots
  'src/__tests__/reliability/aiReelsVoiceCheckGraceful.test.ts', // iter198 ai-reels pre-charge voice check proceeds on non-authoritative (no false recreate)
  'src/__tests__/inngest/trainingDedupIncludesPending.test.ts', // iter198 model-training duplicate guard covers the PENDING window (no dup Replicate train)
  'src/__tests__/security/avatarTransformQuotaGuard.test.ts', // iter199 free-superhero gen has in-flight lock + quota re-check (no concurrent quota bypass)
  'src/__tests__/security/aiPhotoshopMorphingEviction.test.ts', // iter200 aiPhotoshop clears cross-scene morphingImages with every image-source reset
  'src/__tests__/reliability/wan25PollBackoff.test.ts', // iter200 WAN2.5 poll loop backs off on the unknown-state fall-through (no busy-loop)
  'src/__tests__/reliability/i2vAdminNotifyCooldown.test.ts', // iter201 i2v admin-alert fan-outs are cooldown-throttled (no alert storm)
  'src/__tests__/security/trainingPhotosInvalidated.test.ts', // iter201 LoRA training photos invalidated between trainings (no cross-training contamination)
  'src/__tests__/security/startSceneBotResolution.test.ts', // iter201 startScene resolves current bot from ctx.telegram.token (no cross-tenant wrong branding)
  'src/__tests__/security/getRuBillNoErrorLeak.test.ts', // iter202 getRuBillWizard does not leak caught DB error into a user reply (CWE-209)
  'src/__tests__/reliability/writeStreamPipeErrorGuarded.test.ts', // iter202 every piped createWriteStream destination has its own error listener (no uncaughtException -> process.exit)
  'src/__tests__/security/voiceAvatarClearsVeedReturnFlag.test.ts', // iter202 voiceAvatarWizard clears the veed-fabric return flag on leave (no cross-scene hijack of a later voice creation)
  'src/__tests__/reliability/kieVeedFabricStatusFields.test.ts', // iter202 kie-veed-fabric getStatus keys off data.state/resultJson (query shape), not webhook successFlag (no webhook-loss timeout-refund of a succeeded job)
  'src/__tests__/money/modelTrainingV2ProviderTimeouts.test.ts', // iter203 modelTrainingV2 bounds its post-charge ZIP download + BFL fetch with timeouts (hang -> refund, not charged-not-delivered)
  'src/__tests__/scenes/aiPhotoshopUpscaleInflightGuard.test.ts', // iter204 aiPhotoshop direct upscaleImage sites hold an in-flight lock (no double-tap double-charge)
  'src/__tests__/reliability/videoDeliveryEditGuarded.test.ts', // iter204 the Sending-status editMessageText is isolated from replyWithVideo (a stale-message 400 cannot drop a delivered video after the idempotency claim is spent)
  'src/__tests__/reliability/getUserProjectsCacheBounded.test.ts', // iter204 getUserProjects projectsCache is size-capped + evicts (no unbounded-Map leak)
  'src/__tests__/money/voiceAvatarFallbackNotCharged.test.ts', // iter205 voice-avatar Cloudflare fallback (stock Rachel) is not charged as a clone (isFallback gate)
  'src/__tests__/inngest/trainingCompletedReplayDedup.test.ts', // iter206 handleModelTrainingCompleted skips re-notify when the record is already terminal (webhook replay dedup)
  'src/__tests__/reliability/fluxKontextProTempFileCleanup.test.ts', // iter206 generateFluxKontextPro unlinks its saved local image in a finally (no per-call temp-file leak)
  'src/__tests__/reliability/imageEditRemoteDeliverCleanup.test.ts', // iter207 deliver-remote image-edit services (Pro+Qwen+SeedEdit3) unlink their saved local copy (saveFileLocally leak sweep)
  'src/__tests__/reliability/neuroPhotoDirectTempFileCleanup.test.ts', // iter208 generateNeuroPhotoDirect unlinks its orphaned per-image local copy (leak sweep, orphan-in-loop)
  'src/__tests__/money/aiReelsRenderDisplayMatchesCharge.test.ts', // iter209 ai-reels render cost DISPLAY matches the Step 6 charge (no stale x2 formula)
  'src/__tests__/security/tonPaymentOwnershipGuard.test.ts', // iter210 TON top-up check credits only the payment owner (no cross-user top-up theft)
  'src/__tests__/money/upscaleImageConsumeBeforeCharge.test.ts', // iter211 upscale_image consumes the image before charging (stale persistent-button re-tap cannot re-charge)
  'src/__tests__/money/aiPhotoshopUpscaleLastConsumeBeforeCharge.test.ts', // iter212 ai_photoshop_upscale_last consumes the photo before charging (stale button re-tap cannot re-charge a deterministic upscale)
  'src/__tests__/money/upscaleNeuroPhotoConsumeBeforeCharge.test.ts', // iter213 upscale_neurophoto_image consumes the neurophoto before charging (3rd stale-button replay instance, found by tri replay)
  'src/__tests__/money/tonCheckAtomicCreditGuard.test.ts', // iter214 TON check credits MONEY_INCOME only after an atomic status CAS (no concurrent double-credit mint); both ton scenes
  'src/__tests__/reliability/heroValidationErrorLogBounded.test.ts', // iter214 HeroValidationService.errorLog static array is ring-buffer capped (no adversarial slow-OOM); wave-16
  'src/__tests__/reliability/aiPhotoshopDialogReplyGuarded.test.ts', // iter216 aiPhotoshop dialog status reply (raw user text under parse_mode) is isolated in try/catch so a 400 cannot drop the edit or lock the dialog; wave-17
  'src/__tests__/reliability/heygenRenderAnswerCbQuery.test.ts', // iter216 heygenRenderWizard callback steps answer the spinner at top level (no ~30s hang on else/not-found branches); wave-17
  'src/__tests__/reliability/callbackAnswerBeforeBranch.test.ts', // iter217 subscription+menu callback steps answer before branching (no spinner hang on paid subscription flow); spinner-sweep of #1560
  'src/__tests__/reliability/kieWebhookVideoDeliveryEditGuarded.test.ts', // iter218 KIE video webhook status edit is isolated from sendVideo (stale-message 400 cannot drop a paid Sora video after the claim is spent); wave-18, #1528 sibling
  'src/__tests__/reliability/videoTranscriptionGetFileGuarded.test.ts', // iter218 videoTranscription getFile is try-guarded (oversized upload 400 cannot silently drop the video); wave-18
  'src/__tests__/reliability/paidUploadGetFileGuarded.test.ts', // iter219 faceSwap+morphing getFile try-guarded (paid photo-upload getFile sweep of #1563)
  'src/__tests__/reliability/veedFabricResumeStepJump.test.ts', // iter220 veed-fabric resume does not overshoot Step 2 (no selectStep+next off-by-one that broke the resume-after-voice flow); wave-20
  'src/__tests__/reliability/lipSyncModelButtonStripped.test.ts', // iter223 lip_sync_model_* global action strips its keyboard before scene.enter (stale re-tap cannot re-navigate mid-flow); wave-21
  'src/__tests__/money/processBalanceVideoHelperNonPositive.test.ts', // iter224 the LIVE video balance op (processBalanceVideoOperationHelper) refuses a non-positive price before charging (0-cost bypass); the sibling ...NonPositive guards the DEAD processBalanceVideoOperation
  'src/__tests__/money/aiPhotoshopBatchRefundReconciled.test.ts', // iter227 every ALL_MODELS skipBalanceCheck service call reconciles its refund to the batch charge (chargedCostOverride, or qwen size-multiplier) -- dispatch-site guard against a new batch model under-refunding at 2K/4K (#1267 class)
  'src/__tests__/money/processBalanceOperationNonPositive.test.ts', // iter228 the shared IMAGE charge op (processBalanceOperation) refuses a non-positive price before charging (0-cost bypass) -- image twin of #1571's video-helper guard; live fn for the whole image-gen family
  'src/__tests__/reliability/aiPhotoshopPhotoCaptionFallback.test.ts', // iter229 every paid replyWithPhoto with parse_mode:Markdown in aiPhotoshopScene has a plain re-send fallback in its catch (a reserved char in the user prompt caption cannot silently lose the paid image); found by the fresh-lens wave
  'src/__tests__/money/aiPhotoshopAllModelsConsumeInput.test.ts', // iter229 the aiPhotoshop all_models branch consumes aiPhotoshopImage before returning so the persistent continue_same button cannot re-charge the full multi-model cost from stale input (stale-button re-charge class); found by the fresh-lens wave
  'src/__tests__/money/imageToVideoPollClearsJobId.test.ts', // iter230 the image-to-video Plan B poll clears ctx.session.videoJobId after inline delivery so the persistent update_video_status button cannot re-charge the same taskId via the unshared claimVideoJobDelivery guard (double-charge); found by the wave-2 poller lens
  'src/__tests__/money/imageUpscalerProviderTimeout.test.ts', // iter230 imageUpscaler bounds its post-charge replicate.run with a Promise.race timeout so a stuck prediction throws into the existing refund (charged-not-delivered on hang); found by wave-2 charge-then-bare-provider lens
  'src/__tests__/reliability/aiReelsTtsTempFileCleanup.test.ts', // iter230 the AI Reels TTS branch unlinks its temp mp3 in the catch(audioError) (upload-failure path) so a failed TTS upload does not leak a file in os.tmpdir; found by wave-2 tempfile-leak lens
  'src/__tests__/money/replicateWrapperTimeout.test.ts', // iter231 the shared replicate.run wrapper bounds client.run with a Promise.race backstop timeout so no pre-charge caller hangs forever on a stuck prediction (charged-not-delivered class, ~11 callers at once); timeout-sweep generalising the wave-2 charge-then-bare-provider lens
  'src/__tests__/money/neuroPhotoDirectFalTimeout.test.ts', // iter231 generateNeuroPhotoDirect bounds its fal.subscribe (flagship charged path, both default + user-model LoRA) with a timeout so a stuck flux-lora job cannot strand the payment; completes the replicate-wrapper timeout-sweep for the fal path
  'src/__tests__/money/improvePromptInflightGuard.test.ts', // iter232 improvePromptWizard confirm has a reject-before-set in-flight flag before the paid generator so a fast double-tap cannot concurrent-double-charge (every sibling wizard had this, this one was skipped); found by wave-3 double-submit-inflight lens
  'src/__tests__/reliability/morphingSetTimeoutGuarded.test.ts', // iter233 morphingWizard setTimeout(async) milestone callbacks have a .catch/try so a rejected ctx.reply in the detached timer cannot leak an unhandledRejection; found by wave-4 unhandled-rejection lens (crash mitigated by the global handler -> LOW hygiene)
  'src/__tests__/money/creditSiteCensus.test.ts', // iter234 census of every MONEY_INCOME credit call-site (the mint surface); a NEW/added credit site turns RED until reviewed for idempotency+authenticity and allowlisted (income-side analog of money-map/charge-audit)
  'src/__tests__/reliability/morphingProgressCreateGuarded.test.ts', // iter235 morphingWizard progress-card create is behind a reject-before-set guard (+ refresh) so an album upload makes ONE card, not a duplicate per concurrent photo; found by wave-5 session-check-then-act lens (LOW/cosmetic)
  'src/__tests__/money/aiReelsDeliveryWebhookThrows.test.ts', // iter236 generateAIReelsFunction notify-telegram delivery handoff throws on a non-2xx so a failed delivery surfaces (Inngest retries/marks failed) instead of silently reporting success -- the user was charged before dispatch (silent charged-not-delivered); found by wave-6 inngest swallowed-delivery lens
  'src/__tests__/reliability/routesJsonParseGuarded.test.ts', // #1431 webhook JSON.parse
  'src/__tests__/reliability/debugRoutesGated.test.ts', // #1434 debug endpoints NODE_ENV-gated
  'src/__tests__/reliability/routerMountAuthBoundary.test.ts', // #1436 requireInternalKey boundary
  'src/__tests__/inngest/functionGranularRegistration.test.ts', // #1439 Inngest liveness
  'src/__tests__/reliability/aiReelsCallbackForwardsBot.test.ts', // iter237 ai-reels render-callback notifying branches (completed+failed) forward ?bot so the notice is sent from the correct tenant bot, not defaultBot -- latent defense-in-depth symmetry (failed branch currently unreachable); found by wave-7 tenant-isolation lens
  'src/__tests__/reliability/voiceAvatarLevelAfterSave.test.ts', // iter238 createVoiceAvatar advances quest level (updateUserLevelPlusOne) only AFTER the voice_id_elevenlabs save -- previously bumped first, so a voice-create/save failure left level=7 with voice_id=null (quest done, artifact missing); found by wave-8 data-consistency lens
  'src/__tests__/reliability/dedupSettledErrorChecked.test.ts', // iter238 deduplicateUsers gates successCount on the resolved supabase { error }, not Promise status alone -- supabase deletes RESOLVE with {error} (never reject) so allSettled marked a DB-refused delete 'fulfilled' -> false 'Successfully deleted', duplicates persisted; found by wave-8 error-swallow lens
  'src/__tests__/reliability/videoHelperNonUniqueTelegramId.test.ts', // iter241 videoGenerator supabaseHelper uses no .single() on a telegram_id query -- telegram_id is non-unique (~19 dup-row users); .single() errored (PGRST116) so getUserHelper returned null and image-to-video aborted those paying users pre-charge with a false 'not found'; found by wave-10 single-row-absence lens
  'src/__tests__/reliability/ttsVoiceClearAuthoritative.test.ts', // iter241 createAudioFileFromText clears voice_id_elevenlabs only after assertVoiceExistsAuthoritative returns a definitive negative -- a bare 404->clear wiped a valid trained voice on any transient/edge 404 (forced re-train); mirrors voiceValidation.ts; found by wave-10 unintended-overwrite lens
  'src/__tests__/reliability/singleTelegramMigratedFiles.test.ts', // iter242 migrated users-readers (getAspectRatio/getUserLevel/getUserModel) stay off .single()-on-telegram_id (non-unique key); per-file whitelist grows as readers migrate; count 32->29
  'src/__tests__/reliability/createUserInFlightDedup.test.ts', // iter246 createUserByTelegramId dedups concurrent creates via an in-flight map so a double-tap for a brand-new user does not INSERT two users rows -- the ROOT-CAUSE write of the duplicate-telegram_id class (the .single() bugs were symptoms); found by wave-11 insert-race-duplicate lens; definitive UNIQUE(telegram_id) constraint routed to owner
  'src/__tests__/money/superheroQuotaCounterAccumulates.test.ts', // iter249 incrementSuperheroGeneration fallback accumulates the monthly count (read existing + write existing+1), not .upsert-overwrite -- the old upsert stuck the count at 2 so the 3/month free-superhero cap never triggered (unlimited free gens; the RPC has no migration so the fallback is live); found by upsert-onConflict audit
  'src/__tests__/reliability/repoHygieneHookWired.test.ts', // iter247 the repo-hygiene tracked-symlink gate (repo-hygiene-audit.mjs --gate) stays wired in lefthook pre-push -- with CI dead it is the only automated defense against a #1608-style tracked symlink that breaks pull/checkout repo-wide
  'src/__tests__/reliability/ttsFallbackRecursionBounded.test.ts', // iter256 createAudioFileFromText's 404 fallback recursion is bounded by a voice_id===fallbackVoiceId throw-guard BEFORE the recursive self-call -- getFallbackVoiceId is a constant, so a fallback that itself 404s would otherwise recurse forever (unbounded ElevenLabs call loop, paid TTS never delivered); found by wave22 recent-change adversarial review; refuse/bound direction (autonomous)
  'src/__tests__/money/voiceAvatarFallbackNotPersisted.test.ts', // iter257 createVoiceAvatar must NOT persist the stock Rachel fallback over a real clone nor bump the quest level on the Cloudflare-block path -- both side effects gated by if(!isCloudflareBlocked); caller already skips the CHARGE on isFallback, this stops the DATA loss (overwriting a paid clone) + honors the level-couples-to-a-real-voice invariant; wave22
  'src/__tests__/money/aiReelsCallbackReleasesClaimOnPreSendFailure.test.ts', // iter258 the AI Reels completion callback releases its delivery claim on a PRE-send failure (S3 download timeout) so a legit at-least-once retry can re-deliver, but NOT after a send was attempted (double-send guard) -- claim was add-only = charged-not-delivered; found+self-verified by wave23 + a 3-skeptic double-send panel
  'src/__tests__/money/paymentPairAtomicInsert.test.ts', // paired MONEY_INCOME + compensating MONEY_OUTCOME (club fee, feed-star gift) are ONE atomic multi-row setPayments([income,outcome]) insert -- two separate inserts let a transient failure on the 2nd leave the income alone = orphaned SPENDABLE balance minted at owner cost, no rollback, no retry; wave23 finding
  'src/__tests__/money/tonJettonAmountParsedFromBoc.test.ts', // OWNER-GATED draft: USDT jetton amount parsed from the BoC body (VarUInteger16) via jettonBody.ts -- the fixed-offset readUInt32BE(0) read hit the BoC magic, returned 0 for EVERY transfer, and getJettonTransactions dropped every incoming USDT payment (paid on-chain, never credited); lib-built fixtures + structural + mutation; wave23
]

const ROOT = process.cwd()

function main() {
  if (process.argv[2] === '--list') {
    for (const g of GUARDS) console.log(g)
    return
  }
  // A stale entry (a renamed/removed ratchet) must fail loud, not be skipped --
  // a guard list that silently drops a guard is worse than no list.
  const missing = GUARDS.filter(g => !fs.existsSync(path.join(ROOT, g)))
  if (missing.length) {
    console.error('tri guards: tracked ratchet file(s) missing:')
    for (const m of missing) console.error('  ' + m)
    process.exit(2)
  }
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vitest')
  try {
    // vitest exits non-zero if any test fails; inherit stdio so the report shows.
    execFileSync(bin, ['run', ...GUARDS], { stdio: 'inherit', cwd: ROOT })
    console.log(`\ntri guards: all ${GUARDS.length} invariant ratchets GREEN.`)
  } catch {
    console.error(
      `\ntri guards: a critical invariant ratchet is RED (regression). Fix before shipping.`
    )
    process.exit(1)
  }
}

main()

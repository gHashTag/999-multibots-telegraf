# Реестр денежных ратчетов

**Файл сгенерирован.** Правки руками будут стёрты: источник — заголовки
`describe` самих тестов, а сверку делает
`src/__tests__/money/moneyRatchetsIndexIsCurrent.test.ts`.

Зачем плоский список, а не группировка по семьям: группировка измерялась
дважды и оба раза оказалась выдумкой (по ключевым словам 42 файла из 97
попадали сразу в три семьи; по авторской оговорке «(no ...)» покрывается 25
файлов на 20 разных оговорок). Двенадцать НАСТОЯЩИХ семей живут в
[карте инвариантов](money-invariants.md) — они выведены чтением, а не
матчером. Здесь — полный список того, что репозиторий уже утверждает сам.

Ратчетов: 131. Без заголовка: 0.

| файл                                                   | что утверждает                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `aRefusalIsNotAnnouncedAsSuccess.test.ts`              | a refusal is shown as a refusal                                                               |
| `aRefusedChargeStopsTheGeneration.test.ts`             | refuseUnpaidGeneration tells an empty wallet from a broken one                                |
| `aiCoverRefundChecked.test.ts`                         | aiCover refund result is checked and reported truthfully                                      |
| `aiPhotoshopAllModelsConsumeInput.test.ts`             | aiPhotoshopScene all_models branch consumes input before returning (no stale re-charge)       |
| `aiPhotoshopBatchRefundReconciled.test.ts`             | aiPhotoshopScene batch skipBalanceCheck calls reconcile refunds to the charge                 |
| `aiPhotoshopPriceCommentsMatch.test.ts`                | AI Photoshop price comments state what the code computes                                      |
| `aiPhotoshopUpscaleLastConsumeBeforeCharge.test.ts`    | ai_photoshop_upscale_last consumes the photo before charging (no stale-tap replay)            |
| `aiReelsCallbackDeliveryIdempotency.test.ts`           | ai-reels callback video delivery is idempotent per job                                        |
| `aiReelsCallbackReleasesClaimOnPreSendFailure.test.ts` | AI Reels callback releases its delivery claim on a pre-send failure                           |
| `aiReelsChargeChecked.test.ts`                         | ai-reels render charges before dispatch (no unbilled free render)                             |
| `aiReelsDeliveryWebhookThrows.test.ts`                 | generateAIReelsFunction delivery handoff surfaces a non-2xx (no silent charged-not-delivered) |
| `aiReelsRenderDisplayMatchesCharge.test.ts`            | AI Reels Render cost display matches the Step 6 charge                                        |
| `aiReelsWizardRefundChecked.test.ts`                   | ai-reels-wizard critical-error refund checks its result (refundAndTell)                       |
| `balanceRefusalIsToldApartFromAnOutage.test.ts`        | a balance refusal is told apart from an outage                                                |
| `batchRefundReconciliation.test.ts`                    | aiPhotoshop batch refunds reconcile the exact charge                                          |
| `cache-invalidation-isolated-ratchet.test.ts`          | every invalidateBalanceCache call is isolated in its own try (#1397)                          |
| `charge-order.test.ts`                                 | деньги не уходят раньше работы                                                                |
| `chargeNotBeforeDelivery.test.ts`                      | a failure costs the user nothing in the files that never refund                               |
| `chargeReachability.test.ts`                           | the set of callers that can reach a charge is frozen                                          |
| `chargeResultIsChecked.test.ts`                        | money calls whose result is thrown away                                                       |
| `chargeSiteCensus.test.ts`                             | charge-site census: no unreviewed place that takes money                                      |
| `chargedGenerationFailureIsHonest.test.ts`             | a failed generation the user already paid for                                                 |
| `consumeOnceCensus.test.ts`                            | consume-once guards: registered, and marking before they spend                                |
| `createSuccessfulPayment-schema.test.ts`               | createSuccessfulPayment schema contract                                                       |
| `creditGuardsHold.test.ts`                             | the guard each credit site is described as having still exists                                |
| `creditNotInLoop.test.ts`                              | user credits are not called inside a loop (scalar-credit mint #1468/#1470)                    |
| `creditSiteCensus.test.ts`                             | credit-site census: no unreviewed mint surface                                                |
| `creditedIsNotOk.test.ts`                              | ok is not credited                                                                            |
| `directPaymentPostCommit.test.ts`                      | directPayment isolates post-commit side-effects from the committed return (#1397)             |
| `emailWizardPriceAllowlist.test.ts`                    | emailWizard setPayments is allowlist-guarded                                                  |
| `fluxKontextSendRefund.test.ts`                        | generateFluxKontext refunds a send failure (no charged-no-refund)                             |
| `fluxMaxBatchRefundExactCharge.test.ts`                | generateFluxKontextMax batch refund reconciles the exact charge                               |
| `geminiChargedNoRefund.test.ts`                        | generateGeminiImage refunds a failed paid generation (no charged-no-refund)                   |
| `guardsAssumeOneProcess.test.ts`                       | the money guards assume exactly one process                                                   |
| `hedraRefundChecked.test.ts`                           | hedra-render refund result is checked (no silent unrefunded charge)                           |
| `heygenRefundChecked.test.ts`                          | heygen-render refund result is checked and reported truthfully                                |
| `i2v-deduct-result-checked.test.ts`                    | generateImageToVideo checks every deductBalanceAfterSuccess result                            |
| `i2v-sora-webhook-no-double-charge.test.ts`            | Sora i2v webhook path does not double-charge via the status button                            |
| `imageToVideoPollClearsJobId.test.ts`                  | generateImageToVideo poll disarms the update-status button after inline delivery              |
| `imageUpscalerProviderTimeout.test.ts`                 | imageUpscaler bounds its post-charge replicate.run with a timeout                             |
| `improvePromptInflightGuard.test.ts`                   | improvePromptWizard confirm has a reject-before-set in-flight guard                           |
| `inngest-credit-in-step.test.ts`                       | Inngest balance credits run inside step.run                                                   |
| `inngestMoneyInStepRun.test.ts`                        | inngest money mutations are inside step.run (retry-idempotent)                                |
| `instagramParserChargeChecked.test.ts`                 | instagramParser charge result is checked (no discard, no mint)                                |
| `instagramSceneChargeChecked.test.ts`                  | instagramParserScene checks its charge result (no silent discard)                             |
| `inv-id-update.test.ts`                                | updateUserBalance с существующим inv_id                                                       |
| `invariantsMapPointsAtRealThings.test.ts`              | the money invariants map points at real things                                                |
| `kie-webhook-charge.test.ts`                           | kie webhook billing                                                                           |
| `kieWebhookDeliveryIdempotency.test.ts`                | kie/sora webhook video delivery is idempotent per job                                         |
| `lapsedPayersCannotCountSeedingAsMoney.test.ts`        | the lapsed-payer segment cannot count seeded credit as money                                  |
| `ledgerGateActuallyGoesRed.test.ts`                    | the ledger gate goes red on a violation, and only then                                        |
| `ledgerInvariantsCanFail.test.ts`                      | every ledger invariant can actually fail                                                      |
| `lipSyncRefundChecked.test.ts`                         | lipSyncWizard missing-URLs refund checks its result (refundAndTell)                           |
| `lipsyncRefundIdempotent.test.ts`                      | async-lipsync refund is idempotent per job (no double refund)                                 |
| `lipsyncWebhookCannotContradictASettledJob.test.ts`    | a webhook cannot contradict a job the poller already settled                                  |
| `marketplace-deduct-guarded.test.ts`                   | marketplace purchaseItem checks item existence before deducting                               |
| `marketplaceAuthorPayout.test.ts`                      | marketplace author payout is checked (no silent unpaid author)                                |
| `marketplaceInFlightReleased.test.ts`                  | marketplace purchase releases its in-flight key                                               |
| `marketplacePurchaseIdempotent.test.ts`                | marketplace purchase is idempotent under a concurrent double-tap                              |
| `modelTrainingV2ProviderTimeouts.test.ts`              | modelTrainingV2 bounds its post-charge provider calls (no charged-not-delivered hang)         |
| `money-invariants.test.ts`                             | карта денег: типы операций                                                                    |
| `moneyMapKnowsBothCreditSpellings.test.ts`             | money-map knows both spellings of giving money back                                           |
| `moneyRatchetsIndexIsCurrent.test.ts`                  | the money ratchet index is current                                                            |
| `moneyWriteVocabulary.test.ts`                         | the vocabulary of money movement                                                              |
| `nanoAllModelsBilled.test.ts`                          | aiPhotoshop all_models charges nano_banana (no unbilled-paid)                                 |
| `neuroImageDoubleCharge.test.ts`                       | neuroImageGeneration charges exactly once (no double charge)                                  |
| `neuroPhotoDirectFalTimeout.test.ts`                   | generateNeuroPhotoDirect bounds its fal.subscribe with a timeout                              |
| `neurophoto-multi-batch-gate.test.ts`                  | generateNeuroPhotoMulti gates the full batch before charging                                  |
| `no-fabricated-returns.test.ts`                        | нет выдуманных возвратов                                                                      |
| `no-invented-price.test.ts`                            | цена не выдумывается                                                                          |
| `oneEmptyWalletIsOneRefusal.test.ts`                   | the fallback chain stops at the first money refusal                                           |
| `oneEventOneCharger.test.ts`                           | one event, at most one registered charger                                                     |
| `ownerDebtPaymentsUnknown.test.ts`                     | owner debt: unknown payments are not zero payments                                            |
| `paidServicesTableUnread.test.ts`                      | the two dollar-cost tables                                                                    |
| `payment-record-not-silent.test.ts`                    | запись платежа                                                                                |
| `paymentHandlerInvIdDeterministic.test.ts`             | handleSuccessfulPayment InvIds are deterministic (idempotent on Telegram retry)               |
| `paymentMethodCensus.test.ts`                          | no payment method takes money it cannot deliver                                               |
| `paymentPairAtomicInsert.test.ts`                      | paired income+outcome payments are one atomic insert                                          |
| `paymentTypeVocabularyComplete.test.ts`                | the money vocabulary of the refund census                                                     |
| `pendingRowsAreTriagedNotAccused.test.ts`              | a pending row is triaged, not accused                                                         |
| `processBalanceOperationNonPositive.test.ts`           | processBalanceOperation refuses a non-positive price before charging                          |
| `processBalanceVideoHelperNonPositive.test.ts`         | processBalanceVideoOperationHelper refuses a non-positive price before charging               |
| `promoBonusIdempotent.test.ts`                         | promo bonus grant is idempotent (no star mint on concurrent /start)                           |
| `prompt-outcome.test.ts`                               | исход генерации записывается                                                                  |
| `qwenRefundQualityMultiplier.test.ts`                  | generateQwenImageEdit refunds the size-adjusted charge (no wrong-refund-amount)               |
| `referral-on-topup.test.ts`                            | награда за первое пополнение приглашённого                                                    |
| `referral-reward.test.ts`                              | награда за приглашение                                                                        |
| `refund-needs-charge.test.ts`                          | возврат требует состоявшегося списания                                                        |
| `refund-reason.test.ts`                                | возврат денег называет причину                                                                |
| `refundFailureIsAnnounced.test.ts`                     | a refund that failed is announced too                                                         |
| `refundHidesBehindTheChargeItClaims.test.ts`           | generateGptImage25 refunds only what it actually took                                         |
| `refusalOffersAWayToPay.test.ts`                       | the shared money refusal hands over the button, not directions                                |
| `refusalReachesTheCaller.test.ts`                      | a refusal that is returned still reaches somebody with a button                               |
| `remainingBalanceNeverCostsTheResult.test.ts`          | the remaining balance is shown, and never costs the result                                    |
| `replicateWrapperTimeout.test.ts`                      | shared replicate.run wrapper bounds client.run with a timeout                                 |
| `resultKeyboardOffersAPrice.test.ts`                   | a result keyboard shows what more of this costs                                               |
| `robokassa-claim-once.test.ts`                         | robokassa ResultURL credits a payment once                                                    |
| `robokassa-order.test.ts`                              | порядок обработки оплаты                                                                      |
| `robokassa-result-url-is-mounted.test.ts`              | the ResultURL handed to Robokassa is a path this app answers                                  |
| `robokassa-webhook-behaviour.test.ts`                  | вебхук Робокассы: поведение, а не форма                                                       |
| `robokassaReconcileNeverSaysUnpaid.test.ts`            | did not pay                                                                                   |
| `sessionPaymentAmountNeverUnbacked.test.ts`            | the session field the cancel button refunds                                                   |
| `sibling-batch-double-refund.test.ts`                  | sibling image services refund a batch failure at most once                                    |
| `stuck-trainings-visible.test.ts`                      | застрявшее обучение видно человеку                                                            |
| `stuckPaymentsWatchdog.test.ts`                        | the stuck-payment watchdog cannot report a comfortable zero                                   |
| `superheroQuotaCounterAccumulates.test.ts`             | superhero generation quota counter accumulates (no upsert-overwrite)                          |
| `theFreeDemoOfferSurvivesTheMenu.test.ts`              | the offer at the end of the free demo survives the menu that follows                          |
| `theFreeGenerationWasNeverFree.test.ts`                | the two halves of the bypass agree on one string                                              |
| `theSignIsSetByTypeOnEveryWriter.test.ts`              | the sign is set by type, on every writer                                                      |
| `theTwoCohortsAreReadApart.test.ts`                    | the two cohorts are read apart                                                                |
| `ton-payment-claim-once.test.ts`                       | %s credits a TON payment once                                                                 |
| `tonAmountVerificationParity.test.ts`                  | the two on-chain payment finders                                                              |
| `tonCheckAtomicCreditGuard.test.ts`                    | TON check credits only after an atomic status CAS (no double-credit mint)                     |
| `training-refunds-checked.test.ts`                     | generateModelTraining: списание и возврат                                                     |
| `unchecked-money-result.test.ts`                       | результат денежной операции не выбрасывается                                                  |
| `unifiedModelPriceFailClosed.test.ts`                  | getUnifiedModelPrice fails closed on an unpriced input (no free paid generation)              |
| `unlockedDeductionLocked.test.ts`                      | every updateUserBalanceUnlocked call is inside withUserBalanceLock (#999 double-spend)        |
| `unregisteredChargers.test.ts`                         | unregistered money handlers are a known, fixed set                                            |
| `upscaleImageConsumeBeforeCharge.test.ts`              | upscale_image consumes the image before charging (no stale-tap replay)                        |
| `upscaleNeuroPhotoConsumeBeforeCharge.test.ts`         | upscale_neurophoto_image consumes the image before charging (no stale-tap replay)             |
| `veedFabricOuterRefund.test.ts`                        | veed-fabric outer catch refunds a post-charge failure (no charged-no-refund)                  |
| `veo3FastCostSplit.test.ts`                            | the two Veo 3 Fast costs are a known, recorded divergence                                     |
| `videoChargeChecked.test.ts`                           | handleVideoReady checks its charge result (no silent free video)                              |
| `videoDoubleChargeIdempotency.test.ts`                 | video delivery is idempotent per job (no double charge)                                       |
| `videoPollChargeIdempotent.test.ts`                    | image-to-video poll-loop charge is idempotency-guarded                                        |
| `videoRefundWithoutCharge.test.ts`                     | the video generator that refunded without charging                                            |
| `videoWizardsInflightGuard.test.ts`                    | video wizards guard against concurrent double-generate                                        |
| `voiceAvatarFallbackNotCharged.test.ts`                | voice-avatar Cloudflare fallback is not charged as a clone                                    |
| `voiceAvatarFallbackNotPersisted.test.ts`              | createVoiceAvatar does not persist the stock fallback voice (no clone overwrite)              |
| `whatTheFirstGenerationWasOn.test.ts`                  | what the first generation was on                                                              |
| `x402-is-not-offered-while-it-cannot-credit.test.ts`   | x402 is not offered while nothing can credit it                                               |

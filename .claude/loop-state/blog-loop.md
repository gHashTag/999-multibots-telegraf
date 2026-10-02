# Blog-share / agent-browser night loop (2026-10-02)

<!-- loop-branch: fix/blog-share-approval-ttl -->
<!-- loop-pr: 3235 -->
<!-- loop-tests: cd apps/vibee-editor/render && npx vitest run blog-share-wiring-path.test.ts the-blog-is-shared-only-after-a-yes.test.ts browser-approvals.test.ts -->
<!-- loop-not-mine: .claude/launch.json -->

Run each tick as `TRI_LOOP=blog tri loop-guard start` … `tri no-verify-debt` … `TRI_LOOP=blog tri loop-guard end`.

Done: per-question TTL, expired told, failed≠posted, receipts (all networks + X thread),
confirmed tab closes, honest headline, real-path test, tri blog-share [reoffer], tri no-verify-debt.
Waiting on the owner: merge #3235, then `tri blog-share reoffer --apply` (9 articles).
Next: plan step 1 (find the post on the own profile), separate PR.

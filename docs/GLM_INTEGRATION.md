# z.ai GLM integration

Trinity S³AI prefers the z.ai coding endpoint for Agent chat. Secrets are
configured only in the deployment secret store; never paste a credential into
this repository, a command history, a URL, the browser DOM or logs.

## Required production variables

| Variable         | Purpose                 | Safe example                          |
| ---------------- | ----------------------- | ------------------------------------- |
| `AGENT_PROVIDER` | Preferred provider      | `zai`                                 |
| `GLM_API_KEY`    | z.ai credential         | `<set-in-secret-store>`               |
| `ZAI_BASE_URL`   | Coding API base         | `https://api.z.ai/api/coding/paas/v4` |
| `AGENT_MODEL`    | Optional model override | `glm-5.3`                             |

The server may retain an OpenAI fallback only when its key is valid. A present
but rejected key is not a healthy provider.

## Safe setup

1. Create or rotate the key in the provider console.
2. Set `GLM_API_KEY` through Railway or the approved secret manager UI. Do not
   pass the value on a shared command line.
3. Set `AGENT_PROVIDER=zai` and keep the coding base URL above unless the
   provider publishes a migration.
4. Run the repository provider-health test. It reports only provider/status,
   never the credential.
5. Revoke any key that has ever appeared in Git, chat, logs or screenshots.

## Runtime behavior

Provider selection is implemented in
`apps/vibee-editor/render/src/agent/provider.ts`. The Agent tries configured
providers in preference order and returns a redacted diagnosis for 401, quota
and model errors. SAFE BETA exposes only read and draft tools; provider access
does not enable generation, charges or publication.

## Troubleshooting

- `401`: rotate the credential and update the secret store.
- `429` or provider balance error: check the coding subscription/quota.
- model `404`: remove the override or choose a model supported by the coding
  endpoint.
- missing key: verify presence in the target service/environment without
  printing the value.

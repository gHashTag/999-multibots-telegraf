#!/bin/bash

# Get Infisical token
TOKEN=$(curl -s -X POST "https://app.infisical.com/api/v1/auth/universal-auth/login" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "88fcf0cd-cce9-4844-bad2-8e19b4bad3ed", "clientSecret": "b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314"}' | python3 -c "import sys, json; print(json.load(sys.stdin)['accessToken'])")

echo "Token: ${#TOKEN} chars"

# Get secrets
SECRETS=$(curl -s "https://app.infisical.com/api/v3/secrets/raw?workspaceId=fd763fa3-35d5-4045-93bd-1795c5f00fc3&environment=prod" \
  -H "Authorization: Bearer $TOKEN")

SUPABASE_URL=$(echo "$SECRETS" | python3 -c "import sys, json; secrets = json.load(sys.stdin)['secrets']; print(next((s['secretValue'] for s in secrets if s['secretKey'] == 'SUPABASE_URL'), ''))")
SUPABASE_SERVICE_KEY=$(echo "$SECRETS" | python3 -c "import sys, json; secrets = json.load(sys.stdin)['secrets']; print(next((s['secretValue'] for s in secrets if s['secretKey'] == 'SUPABASE_SERVICE_KEY'), ''))")

echo "SUPABASE_URL=$SUPABASE_URL"
echo "SUPABASE_SERVICE_KEY length: ${#SUPABASE_SERVICE_KEY}"

export SUPABASE_URL
export SUPABASE_SERVICE_KEY

# Run node script to update
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('$SUPABASE_URL', '$SUPABASE_SERVICE_KEY');
(async () => {
  const { data, error } = await supabase
    .from('payments_v2')
    .update({ type: 'MONEY_INCOME' })
    .in('telegram_id', [693774948, 691324065])
    .eq('description', 'Бонус от администратора для баланса 1000⭐')
    .select('telegram_id, type, stars');
  console.log('Updated:', JSON.stringify({ data, error }, null, 2));

  // Check new balance
  for (const tid of ['693774948', '691324065']) {
    const { data: bal } = await supabase.rpc('get_user_balance', { user_telegram_id: tid });
    console.log('Balance for ' + tid + ':', bal);
  }
})();
"

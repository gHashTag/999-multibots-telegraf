import { InfisicalSDK } from '@infisical/sdk';

const clientId = process.env.INFISICAL_CLIENT_ID;
const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
const projectId = process.env.INFISICAL_PROJECT_ID;

if (!clientId || !clientSecret || !projectId) {
  console.error('Missing Infisical credentials');
  process.exit(1);
}

const infisicalClient = new InfisicalSDK({
  siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
});

await infisicalClient.auth().universalAuth.login({
  clientId,
  clientSecret
});

console.log('Connected to Infisical');

const result = await infisicalClient.secrets().listSecrets({
  projectId,
  environment: 'prod',
  secretPath: '/'
});

console.log('\nChecking BOT_TOKENs in prod environment...\n');

const botTokens = result.secrets
  .filter(s => s.secretKey.startsWith('BOT_TOKEN_'))
  .sort((a, b) => a.secretKey.localeCompare(b.secretKey));

console.log(`Found ${botTokens.length} BOT_TOKEN_* secrets:\n`);

for (const s of botTokens) {
  const len = s.secretValue ? s.secretValue.length : 0;
  const status = len > 50 ? 'OK' : (len > 0 ? 'SHORT' : 'EMPTY');
  console.log(`  ${status.padStart(5)} ${s.secretKey}: ${len} chars`);
}

// Check for missing tokens
const expectedTokens = [];
for (let i = 1; i <= 11; i++) {
  expectedTokens.push(`BOT_TOKEN_${i}`);
}

const missingTokens = expectedTokens.filter(t => !botTokens.find(s => s.secretKey === t && s.secretValue?.length > 50));

if (missingTokens.length > 0) {
  console.log(`\n⚠️  Missing or empty tokens: ${missingTokens.join(', ')}`);
}

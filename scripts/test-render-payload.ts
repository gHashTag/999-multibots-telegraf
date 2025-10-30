/**
 * 🧪 TEST: Render Server Payload Validation
 *
 * Проверяет что payload соответствует новому API формату
 */

import { createRenderAvatarPayload } from '../src/inngest_app/render-server-client'

console.log('🧪 Testing Render Server Payload Generation\n')

// Test 1: Hedra Avatar Payload
console.log('Test 1: Hedra Avatar Payload')
const hedraPayload = createRenderAvatarPayload(
  '123456789',
  'Hello, this is a test message for Hedra avatar generation.',
  'https://example.com/avatar.jpg',
  'voice_id_123',
  {
    coverUrl: 'https://example.com/cover.jpg',
    introText1: 'Test Title 1',
    introText2: 'Test Title 2',
    avatarService: 'hedra',
  }
)

console.log('✅ Hedra Payload Structure:', {
  job_id: hedraPayload.job_id.substring(0, 30) + '...',
  intro_text_1_position: hedraPayload.intro_text_1.position,
  intro_text_2_position: hedraPayload.intro_text_2.position,
  intro_text_2_font_size: hedraPayload.intro_text_2.font_size,
  has_heygen_settings: !!hedraPayload.avatar_settings.heygen,
  has_hedra_settings: !!hedraPayload.avatar_settings.hedra,
  hedra_avatar_id: hedraPayload.avatar_settings.hedra?.avatar_id.substring(0, 30),
  hedra_voice_id: hedraPayload.avatar_settings.hedra?.voice_id,
})

// Validation: Hedra должна быть заполнена, HeyGen - null
if (!hedraPayload.avatar_settings.hedra) {
  console.error('❌ ERROR: Hedra settings should be filled!')
  process.exit(1)
}
if (hedraPayload.avatar_settings.heygen !== null) {
  console.error('❌ ERROR: HeyGen settings should be null!')
  process.exit(1)
}

console.log('\n' + '='.repeat(60) + '\n')

// Test 2: HeyGen Avatar Payload
console.log('Test 2: HeyGen Avatar Payload')
const heygenPayload = createRenderAvatarPayload(
  '987654321',
  'Hello, this is a test message for HeyGen avatar generation.',
  'https://example.com/avatar2.jpg', // ignored for HeyGen
  'voice_id_456',
  {
    coverUrl: 'https://example.com/cover2.jpg',
    introText1: 'HeyGen Test 1',
    introText2: 'HeyGen Test 2',
    avatarService: 'heygen',
    heygenApiKey: 'sk_test_heygen_api_key',
    heygenAvatarId: 'test_avatar_id_heygen',
  }
)

console.log('✅ HeyGen Payload Structure:', {
  job_id: heygenPayload.job_id.substring(0, 30) + '...',
  intro_text_1_position: heygenPayload.intro_text_1.position,
  intro_text_2_position: heygenPayload.intro_text_2.position,
  intro_text_2_font_size: heygenPayload.intro_text_2.font_size,
  has_heygen_settings: !!heygenPayload.avatar_settings.heygen,
  has_hedra_settings: !!heygenPayload.avatar_settings.hedra,
  heygen_avatar_id: heygenPayload.avatar_settings.heygen?.avatar_id,
  heygen_voice_id: heygenPayload.avatar_settings.heygen?.voice_id,
  heygen_api_key_prefix: heygenPayload.avatar_settings.heygen?.api_key.substring(0, 15),
})

// Validation: HeyGen должна быть заполнена, Hedra - null
if (!heygenPayload.avatar_settings.heygen) {
  console.error('❌ ERROR: HeyGen settings should be filled!')
  process.exit(1)
}
if (heygenPayload.avatar_settings.hedra !== null) {
  console.error('❌ ERROR: Hedra settings should be null!')
  process.exit(1)
}

console.log('\n' + '='.repeat(60) + '\n')

// Test 3: Payload Field Validation
console.log('Test 3: Payload Field Validation')

// Check that all required fields exist and match the new API structure
const requiredFields = [
  'job_id',
  'eleven_labs_api_key',
  'kie_api_key',
  'cover_url',
  'intro_text_1',
  'intro_text_2',
  'avatar_settings',
  'callback_url',
]

const missingFields = requiredFields.filter(field => !(field in hedraPayload))
if (missingFields.length > 0) {
  console.error('❌ ERROR: Missing required fields:', missingFields)
  process.exit(1)
}

// Check intro_text structures
if (!('text' in hedraPayload.intro_text_1) ||
    !('position' in hedraPayload.intro_text_1) ||
    !('font_size' in hedraPayload.intro_text_1)) {
  console.error('❌ ERROR: intro_text_1 has incorrect structure!')
  process.exit(1)
}

// Check positions match new API
if (hedraPayload.intro_text_1.position[0] !== 202 ||
    hedraPayload.intro_text_1.position[1] !== 960) {
  console.error('❌ ERROR: intro_text_1 position incorrect! Expected [202, 960], got:', hedraPayload.intro_text_1.position)
  process.exit(1)
}

if (hedraPayload.intro_text_2.position[0] !== 720 ||
    hedraPayload.intro_text_2.position[1] !== 960) {
  console.error('❌ ERROR: intro_text_2 position incorrect! Expected [720, 960], got:', hedraPayload.intro_text_2.position)
  process.exit(1)
}

if (hedraPayload.intro_text_2.font_size !== 75) {
  console.error('❌ ERROR: intro_text_2 font_size incorrect! Expected 75, got:', hedraPayload.intro_text_2.font_size)
  process.exit(1)
}

console.log('✅ All required fields present')
console.log('✅ intro_text_1 position: [202, 960] ✓')
console.log('✅ intro_text_2 position: [720, 960] ✓')
console.log('✅ intro_text_2 font_size: 75 ✓')

console.log('\n' + '='.repeat(60))
console.log('✅ ALL TESTS PASSED!')
console.log('='.repeat(60) + '\n')

console.log('📊 Summary:')
console.log('  • Hedra payload: ✅ Valid')
console.log('  • HeyGen payload: ✅ Valid')
console.log('  • Field validation: ✅ All fields present')
console.log('  • Position validation: ✅ Matches new API')
console.log('  • Font size validation: ✅ Matches new API')
console.log('\n✨ Payload structure is ready for production!\n')

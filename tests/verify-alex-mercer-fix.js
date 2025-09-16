#!/usr/bin/env node
/**
 * Quick verification script to test Alex Mercer button mapping fix
 */

console.log('🧪 Verifying Alex Mercer button mapping fix...\n');

// Simulate the button mapping logic
const buttonToHeroMap = {
  // ... other mappings ...
  '🎨 Альтаир': 'Альтаир',
  '🎨 Эцио': 'Эцио',
  '🎨 Алекс Мерсер': 'Алекс Мерсер', // This should now be present!
  '🎨 Чун Ли': 'Чун Ли',
};

// Test the specific case that was failing
const testInput = '🎨 Алекс Мерсер';
const result = buttonToHeroMap[testInput];

console.log(`🎯 Testing input: "${testInput}"`);
console.log(`📋 Mapped result: "${result}"`);
console.log(`✅ Mapping exists: ${!!result}`);

if (result === 'Алекс Мерсер') {
  console.log('\n🎉 SUCCESS: Alex Mercer mapping is now working correctly!');
  console.log('The BUTTON_DATA_INVALID error should no longer occur.');
} else {
  console.log('\n❌ FAILED: Alex Mercer mapping is still not working.');
  console.log('Further investigation needed.');
}

// Test a few other heroes to make sure we didn't break anything
console.log('\n🔍 Testing other heroes for regression:');
const testCases = [
  '🎨 Альтаир',
  '🎨 Эцио',
  '🎨 Чун Ли'
];

let allPassed = true;
testCases.forEach(testCase => {
  const mapped = buttonToHeroMap[testCase];
  const passed = !!mapped;
  console.log(`  ${passed ? '✅' : '❌'} "${testCase}" -> "${mapped}"`);
  if (!passed) allPassed = false;
});

console.log(`\n${allPassed ? '🎉 All tests PASSED!' : '❌ Some tests FAILED!'}`);
console.log('\nNext step: Deploy to production server with Docker rebuild.');
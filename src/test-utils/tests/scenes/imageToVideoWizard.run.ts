/**
 * Runner file for imageToVideoWizard tests
 * This file is designed to be executed with tsx, which handles ESM imports properly
 */

// Import the test runner
import runImageToVideoWizardTests from './imageToVideoWizard.test';

// Make mock objects available globally
import '../../core/mock';
import * as supabaseModule from '@/supabase';
import mockApi from '../../core/mock';
import * as database from '@/libs/database';
import { InngestService } from '@/services/inngest.service';

// Make sure Supabase is mocked
try {
  (supabaseModule as any).supabase = mockApi.mockSupabase();
} catch (error) {
  console.log('Supabase mock already defined, skipping redefinition');
}

// Mock database functions
try {
  (database as any).getUserSub = mockApi.create();
  (database as any).getUserBalance = mockApi.create();
  (database as any).getUserByTelegramId = mockApi.create();
} catch (error) {
  console.log('Database mocks already defined, skipping redefinition');
}

// Run the tests
async function main() {
  console.log('🧪 Running imageToVideoWizard tests...');
  
  try {
    const results = await runImageToVideoWizardTests();
    
    // Print results
    let failures = 0;
    
    console.log('\n📊 Test Results:');
    results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.log(`❌ ${result.name}: ${result.message}`);
        failures++;
      }
    });
    
    // Print summary
    console.log('\n📈 Summary:');
    console.log(`Total tests: ${results.length}`);
    console.log(`Passed: ${results.length - failures}`);
    console.log(`Failed: ${failures}`);
    
    // Exit with appropriate code
    process.exit(failures > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 
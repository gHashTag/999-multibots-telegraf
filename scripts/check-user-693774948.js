const { supabase } = require('../dist/core/supabase/index.js');

async function main() {
  console.log('Checking model_trainings for user 693774948...\n');
  
  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', '693774948')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  console.log('Total records:', data ? data.length : 0);
  console.log('---\n');
  
  if (data && data.length > 0) {
    data.forEach((r, i) => {
      console.log(`Record ${i + 1}:`);
      console.log('  Model name:', r.model_name);
      console.log('  Training ID:', r.replicate_training_id);
      console.log('  Status:', r.status);
      console.log('  Model URL:', r.model_url || 'N/A');
      console.log('  Created:', r.created_at);
      console.log('  Trigger:', r.trigger_word);
      console.log('');
    });
  } else {
    console.log('No records found - need to create entry manually!');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

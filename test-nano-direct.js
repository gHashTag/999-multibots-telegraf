#!/usr/bin/env node

const Replicate = require('replicate');

async function testNanoBanana() {
  console.log('🧪 Testing Nano Banana directly...');
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  try {
    console.log('🎨 Calling replicate.run...');
    const output = await replicate.run(
      "google/nano-banana",
      {
        input: {
          prompt: "Transform person into mighty Russian warrior Ilya Muromets. Ancient Russian armor.",
          image_input: ["https://api.telegram.org/file/bot7313269542:AAG6NLu6NRSblDvWhd2-M26auR1BLNZiLoU/photos/file_6.jpg"]
        }
      }
    );

    console.log('\n📦 Raw output:');
    console.log(output);
    
    console.log('\n📊 Output analysis:');
    console.log('- Type:', typeof output);
    console.log('- Is Array:', Array.isArray(output));
    console.log('- Keys (if object):', output && typeof output === 'object' ? Object.keys(output) : 'N/A');
    console.log('- Stringified:', JSON.stringify(output));
    
    if (output && typeof output === 'object' && !Array.isArray(output)) {
      console.log('\n🔍 Checking object properties:');
      console.log('- output.url:', output.url);
      console.log('- output.output:', output.output);
      console.log('- output.prediction:', output.prediction);
      console.log('- output.result:', output.result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

testNanoBanana();
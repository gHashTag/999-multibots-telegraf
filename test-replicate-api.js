#!/usr/bin/env node

require('dotenv').config({ path: '/Users/playra/999-agents-telegraf/.env' });
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function testImageToPrompt() {
  const testImageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/200px-PNG_transparency_demonstration_1.png';
  
  console.log('Testing Replicate CLIP Interrogator...');
  console.log('Image URL:', testImageUrl);
  console.log('REPLICATE_API_TOKEN:', process.env.REPLICATE_API_TOKEN ? 'SET' : 'NOT SET');
  
  try {
    console.log('\n1. Testing CLIP Interrogator (main model)...');
    const output = await replicate.run(
      "pharmapsychotic/clip-interrogator:8151e1c9f47e696fa316146a2e35812ccf79cfc9ebb255ae6f7dda6ae5b65de5",
      {
        input: {
          image: testImageUrl,
          mode: "best",
          clip_model_name: "ViT-L-14/openai"
        }
      }
    );

    if (output) {
      console.log('✅ Success with CLIP Interrogator!');
      console.log('Generated caption:');
      console.log('---');
      console.log(output);
      console.log('---');
    } else {
      console.log('❌ No caption generated from CLIP Interrogator');
    }
  } catch (error) {
    console.error('❌ Error with CLIP Interrogator:', error.message);
    
    // Try alternative model
    console.log('\n2. Trying alternative model img2prompt...');
    try {
      const alternativeOutput = await replicate.run(
        "methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5",
        {
          input: {
            image: testImageUrl
          }
        }
      );
      
      if (alternativeOutput) {
        console.log('✅ Success with img2prompt!');
        console.log('Generated caption:');
        console.log('---');
        console.log(alternativeOutput);
        console.log('---');
      } else {
        console.log('❌ No caption from img2prompt');
      }
    } catch (altError) {
      console.error('❌ Error with img2prompt:', altError.message);
    }
  }
}

testImageToPrompt();
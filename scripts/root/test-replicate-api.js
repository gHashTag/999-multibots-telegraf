// Тест Replicate API для диагностики
const replicate = require('replicate');

async function testReplicateAPI() {
  console.log('🧪 Тестирование Replicate API...');

  const token = process.env.REPLICATE_API_TOKEN;
  console.log('Token available:', !!token);
  console.log('Token preview:', token ? `${token.substring(0, 10)}...` : 'NULL');

  if (!token) {
    console.error('❌ REPLICATE_API_TOKEN not found!');
    return;
  }

  try {
    // Простая модель для теста
    const model = 'ghashtag/test3:ghashtag/test3-1764358687119:66f8afa9f49bc73f05085bc090aa4c26af563778264e7976f1e30356cce2a7db';

    console.log('🚀 Вызов replicate.run()...');
    const output = await replicate.run(
      model,
      {
        input: {
          prompt: 'Test image, male, shaman',
          negative_prompt: 'nsfw, ugly, bad quality',
          num_inference_steps: 40,
          output_format: 'jpg',
          guidance_scale: 3,
          output_quality: 80,
          num_outputs: 1,
        }
      },
      {
        auth: token
      }
    );

    console.log('✅ Replicate API call succeeded!');
    console.log('Output type:', typeof output);
    console.log('Output:', JSON.stringify(output, null, 2));

  } catch (error) {
    console.error('❌ Error calling Replicate API:', error.message);
    console.error('Full error:', error);
  }
}

testReplicateAPI();

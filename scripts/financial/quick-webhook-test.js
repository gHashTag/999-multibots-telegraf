const axios = require('axios');

async function quickTest() {
  console.log('🚀 Quick webhook test...\n');

  try {
    const response = await axios.get('https://three-head-dragon.shop/api/telegram/ai-reels-callback', {
      timeout: 5000
    });

    console.log(`✅ HTTP ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Data: ${error.response.data}`);
    }
  }
}

quickTest();

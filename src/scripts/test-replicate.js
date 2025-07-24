const fetch = require("node-fetch");

async function testReplicate() {
  console.log("🧪 Testing Replicate API...");
  
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "0f7b04e6b3b3c6d03339b5b31d2a5b5b5f4f4f4f",
      input: {
        image1: "http://localhost:2999/assets/temp_reels_images/reels_144022504_1751326943788_0.jpeg",
        image2: "http://localhost:2999/assets/temp_reels_images/reels_144022504_1751326943795_1.jpeg"
      }
    })
  });
  
  const result = await response.json();
  console.log("📊 Replicate response:", result);
}

testReplicate().catch(console.error);

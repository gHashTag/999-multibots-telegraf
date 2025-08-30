#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN_1;

async function clearWebhook() {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`
    );
    console.log('Webhook cleared:', response.data);
  } catch (error) {
    console.error('Error clearing webhook:', error.message);
  }
}

clearWebhook();
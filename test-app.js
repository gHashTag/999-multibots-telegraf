// Simple test app for Railway
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    message: 'Railway test app is running!',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    botToken: process.env.BOT_TOKEN_1 ? 'Token is set' : 'No bot token'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(`Test app listening on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Bot token 1 exists: ${!!process.env.BOT_TOKEN_1}`);
});
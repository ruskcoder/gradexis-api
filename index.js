/* eslint-disable no-undef */
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

try {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('Firebase Admin initialized');
} catch (error) {
  console.warn('Firebase Admin not initialized - service account file not found');
}

const app = express();

app.use(express.json());

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid JSON: ' + err.message 
    });
  }
  next(err);
});

const webPushService = require('./web-push.js');
const hac = require('./hac/index.js');
const hacv2 = require('./hac-v2/index.js');
const demo = require('./demo/index.js');
const powerschool = require('./powerschool/index.js');

app.use(cors());
app.use('/hac', hac);
app.use('/v2/hac', hacv2);
app.use('/demo', demo);
app.use('/powerschool', powerschool);

app.use('/static', express.static(__dirname + '/static'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/vapid-public-key', (req, res) => {
  const { platform } = req.query;
  const publicKey = webPushService.getVapidPublicKey(platform);
  res.json({ publicKey });
});

app.post('/subscribe', (req, res) => {
  console.log('New Device')
  const { payload, platform = 'web' } = req.body;
  webPushService.addSubscription(payload, platform);
  res.status(201).json({ message: 'Subscription received successfully.' });
});

async function sendPushToAllDevices() {
  return webPushService.sendPushToAllDevices();
}

app.get('/send-test-push', async (req, res) => {
  await sendPushToAllDevices();
  res.send('Test push notification sent.');
});

setInterval(() => {
  sendPushToAllDevices()
    .catch(() => console.error('Failed to send push notifications.'));
}, 1000 * 60 * 30); // Every 30 minutes

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  if (!res.headersSent) {
    res.status(status).json({ 
      success: false, 
      message 
    });
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Main App listening on http://localhost:${port}`);
});

module.exports = app; 
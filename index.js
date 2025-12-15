import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

try {
  const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-service-account.json'), 'utf-8'));
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

import * as webPushService from './web-push.js';
import { getReferralInfo } from './referrals.js';
import supabase from './database.js';
import hac from './hac/index.js';
import hacv2 from './hac-v2/index.js';
import demo from './demo/index.js';
import powerschool from './powerschool/index.js';

app.use(cors());
app.use('/hac', hac);
app.use('/v2/hac', hacv2);
app.use('/demo', demo);
app.use('/powerschool', powerschool);

app.use('/static', express.static(__dirname + '/static'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/referral', async (req, res) => {
  try {
    let { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username is required' });
    username = username.toLowerCase();

    const blockedEnv = process.env.BLOCKED_USERS || '';
    const blockedList = blockedEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const blocked = blockedList.includes(username);

    const { referralCode, numReferrals } = await getReferralInfo(username);

    res.json({ referralCode, numReferrals, blocked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/vapid-public-key', (req, res) => {
  const { platform } = req.query;
  const publicKey = webPushService.getVapidPublicKey(platform);
  res.json({ publicKey });
});

app.get('/web-notifications', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

export default app; 
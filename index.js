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
import { createPlatformRoutes } from './core/index.js';
import hac from './hac/index.js';
import demo from './demo/index.js';

// Every platform is a registry object; core turns it into routes and mounts it
// at its declared prefix. Add a platform by importing it and pushing it here.
// (powerschool/ still lives on disk but is not yet migrated to the registry
// model, so it stays unmounted.)
const platforms = [hac];

app.use(cors());
for (const platform of platforms) {
  app.use(platform.mount, createPlatformRoutes(platform));
}
app.use('/demo', demo);

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

// Public read of the announcements table for the web app. These are broadcast
// notices, not per-user data, so no auth is required.
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

app.post('/subscribe', async (req, res) => {
  try {
    const { payload, platform = 'web' } = req.body;
    if (!payload) {
      return res.status(400).json({ message: 'payload is required' });
    }
    await webPushService.addSubscription(payload, platform);
    console.log('New device subscribed:', platform);
    res.status(201).json({ message: 'Subscription received successfully.' });
  } catch (error) {
    console.error('Failed to save subscription:', error);
    res.status(500).json({ message: error.message });
  }
});

async function sendPushToAllDevices() {
  return webPushService.sendPushToAllDevices();
}

// How often to fire the "go fetch" trigger, in minutes. Falls back to 1 hour.
const pushIntervalMinutes = Number(process.env.PUSH_INTERVAL_MINUTES) || 60;
setInterval(() => {
  sendPushToAllDevices()
    .catch(() => console.error('Failed to send push notifications.'));
}, 1000 * 60 * pushIntervalMinutes);
console.log(`Push trigger scheduled every ${pushIntervalMinutes} minute(s)`);

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
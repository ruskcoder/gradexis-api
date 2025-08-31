/* eslint-disable no-undef */
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
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

const hac = require('./hac/index.js');
const demo = require('./demo/index.js');
const powerschool = require('./powerschool/index.js');
// const classlinkAuth = require('./auth/classlink.js');

app.use(cors());
app.use('/hac', hac);
app.use('/demo', demo);
app.use('/powerschool', powerschool);
// app.use('/auth/classlink', classlinkAuth);

app.get('/', (req, res) => {
  res.send("Gradexis API is running!");
});

// Endpoint to get the appropriate public key for web push
app.get('/vapid-public-key', (req, res) => {
  const { platform } = req.query;
  
  if (platform === 'web-firebase') {
    res.json({ publicKey: firebasePublicKey });
  } else {
    res.json({ publicKey: webPublicKey });
  }
});

const port = 3000;

// VAPID Keys for web push notifications
const webPublicKey = "BBXwLd6Bj9NMB8PrS7CoWUMvY345XnMrqlEyjhWF_bEJjbhO465fN0m637BMmcYqtHX0BGPiLzQd33c6tlUDfNI";
const webPrivateKey = process.env.VAPID_PRIVATE_KEY;

// Firebase Web Push Certificate (for unified Firebase experience)
const firebasePublicKey = process.env.FIREBASE_PUBLIC_KEY;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;

// Set default VAPID details for web push
webPush.setVapidDetails(
  'mailto:ruskcoder@gradexis.com',
  webPublicKey,
  webPrivateKey
);

const subscriptions = [];

// Store subscriptions with platform info
app.post('/subscribe', (req, res) => {
  console.log('New Device')
  const { payload, platform = 'web' } = req.body;
  subscriptions.push({ subscription: payload, platform });
  res.status(201).json({ message: 'Subscription received successfully.' });
});

async function sendPushToAllDevices() {
  console.log('Sending push to', subscriptions.length, 'subscriptions');
  const notificationPayload = "trigger";
  const sentUrls = new Set();
  
  const promises = subscriptions
    .filter(({ subscription }) => {
      const endpoint = subscription.endpoint || subscription.token;
      if (sentUrls.has(endpoint)) return false;
      sentUrls.add(endpoint);
      return true;
    })
    .map(async ({ subscription, platform }) => {
      try {
        if (platform === 'android' && subscription.token) {
          if (admin.apps.length > 0) {
            const message = {
              token: subscription.token,
              data: {
                trigger: 'grade_check'
              },
              android: {
                priority: 'high',
              }
            };
            const result = await admin.messaging().send(message);
            console.log('Grade check trigger sent successfully');
            return result;
          } else {
            console.log('Firebase Admin not available');
          }
        } else if (platform === 'web-firebase') {
          // Send Firebase web push notification
          webPush.setVapidDetails(
            'mailto:ruskcoder@gradexis.com',
            firebasePublicKey,
            firebasePrivateKey
          );
          return webPush.sendNotification(subscription, notificationPayload);
        } else {
          // Send traditional web push notification
          webPush.setVapidDetails(
            'mailto:ruskcoder@gradexis.com',
            webPublicKey,
            webPrivateKey
          );
          return webPush.sendNotification(subscription, notificationPayload);
        }
      } catch (error) {
        console.error(`Failed to send notification to ${platform}:`, error);
      }
    });
  
  return Promise.all(promises);
}

app.get('/send-test-push', async (req, res) => {
  await sendPushToAllDevices();
  res.send('Test push notification sent.');
});

setInterval(() => {
  sendPushToAllDevices()
    .catch(() => console.error('Failed to send push notifications.'));
}, 1000 * 60 * 30); // Every 30 minutes

app.listen(port, () => {
  console.log(`Main App listening on http://localhost:${port}`);
});

module.exports = app; 
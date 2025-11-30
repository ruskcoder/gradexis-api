import webPush from 'web-push';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

const webPublicKey = "BBXwLd6Bj9NMB8PrS7CoWUMvY345XnMrqlEyjhWF_bEJjbhO465fN0m637BMmcYqtHX0BGPiLzQd33c6tlUDfNI";
const webPrivateKey = process.env.VAPID_PRIVATE_KEY;

const firebasePublicKey = process.env.FIREBASE_PUBLIC_KEY;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;

webPush.setVapidDetails(
  'mailto:ruskcoder@gradexis.com',
  webPublicKey,
  webPrivateKey
);

const subscriptions = [];

/**
 * Add a subscription
 * @param {Object} payload - The subscription payload
 * @param {string} platform - The platform type (web, android, web-firebase)
 */
function addSubscription(payload, platform = 'web') {
  subscriptions.push({ subscription: payload, platform });
}

/**
 * Get all subscriptions
 * @returns {Array} Array of subscriptions
 */
function getSubscriptions() {
  return subscriptions;
}

/**
 * Send push notification to all devices
 */
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

/**
 * Get the appropriate VAPID public key
 * @param {string} platform - The platform type
 * @returns {string} The public key
 */
function getVapidPublicKey(platform) {
  if (platform === 'web-firebase') {
    return firebasePublicKey;
  }
  return webPublicKey;
}

export {
  addSubscription,
  getSubscriptions,
  sendPushToAllDevices,
  getVapidPublicKey
};

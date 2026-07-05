import webPush from 'web-push';
import admin from 'firebase-admin';
import axios from 'axios';
import dotenv from 'dotenv';
import process from 'process';
import supabase from './database.js';

dotenv.config();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const webPublicKey = "BBXwLd6Bj9NMB8PrS7CoWUMvY345XnMrqlEyjhWF_bEJjbhO465fN0m637BMmcYqtHX0BGPiLzQd33c6tlUDfNI";
const webPrivateKey = process.env.VAPID_PRIVATE_KEY;

const firebasePublicKey = process.env.FIREBASE_PUBLIC_KEY;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;

webPush.setVapidDetails(
  'mailto:ruskcoder@gradexis.com',
  webPublicKey,
  webPrivateKey
);

/**
 * The stable identity of a subscription: web push endpoint or FCM token.
 * Used as the UNIQUE dedupe_key so re-subscribing the same device updates the
 * row in place instead of piling up duplicates.
 * @param {Object} payload
 * @returns {string|null}
 */
function dedupeKeyFor(payload) {
  return payload?.endpoint || payload?.token || null;
}

/**
 * Add (or refresh) a subscription. Upserts on dedupe_key so redundant
 * subscriptions for the same device collapse into one row.
 * @param {Object} payload - The subscription payload
 * @param {string} platform - web | web-firebase | android | ios
 */
async function addSubscription(payload, platform = 'web') {
  const dedupeKey = dedupeKeyFor(payload);
  if (!dedupeKey) {
    throw new Error('Subscription payload missing endpoint/token');
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        dedupe_key: dedupeKey,
        platform,
        subscription: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key' }
    );

  if (error) throw error;
}

/**
 * Get all subscriptions from the store.
 * @returns {Promise<Array<{platform: string, subscription: Object}>>}
 */
async function getSubscriptions() {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('platform, subscription');

  if (error) throw error;
  return data || [];
}

/**
 * Delete a dead subscription (expired endpoint / unregistered token).
 * @param {string} dedupeKey
 */
async function removeSubscription(dedupeKey) {
  if (!dedupeKey) return;
  await supabase.from('push_subscriptions').delete().eq('dedupe_key', dedupeKey);
}

/**
 * True if the error means the subscription is permanently gone and should be
 * pruned (as opposed to a transient failure worth keeping for next time).
 */
function isGoneError(error, platform) {
  if (platform === 'android' || platform === 'ios') {
    return (
      error?.code === 'messaging/registration-token-not-registered' ||
      error?.code === 'messaging/invalid-registration-token'
    );
  }
  // web / web-firebase
  return error?.statusCode === 404 || error?.statusCode === 410;
}

/**
 * Send an FCM message and prune the subscription if the token is dead.
 */
async function sendFcm(message, dedupeKey, platform, label) {
  if (admin.apps.length === 0) {
    console.log('Firebase Admin not available');
    return;
  }
  try {
    const result = await admin.messaging().send(message);
    console.log(`Grade check trigger sent successfully (${label})`);
    return result;
  } catch (error) {
    if (isGoneError(error, platform)) {
      console.log(`Pruning dead ${label} subscription`);
      await removeSubscription(dedupeKey);
    } else {
      console.error(`Failed to send notification to ${platform}:`, error);
    }
  }
}

/**
 * Send the "go fetch" trigger to Expo push tokens (the mobile app). Batched
 * 100/request per Expo's limit. `_contentAvailable` makes it a silent
 * background push on iOS; `priority: high` wakes Android from a data message.
 * Tokens Expo reports as DeviceNotRegistered are pruned.
 * @param {Array<{subscription: Object}>} expoSubs
 */
async function sendExpoPush(expoSubs) {
  if (expoSubs.length === 0) return;

  for (let i = 0; i < expoSubs.length; i += 100) {
    const batchSubs = expoSubs.slice(i, i + 100);
    const messages = batchSubs.map(({ subscription }) => ({
      to: subscription.token,
      data: { trigger: 'grade_check' },
      priority: 'high',
      _contentAvailable: true,
    }));

    try {
      const res = await axios.post(EXPO_PUSH_URL, messages, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const tickets = res.data?.data ?? [];
      await Promise.all(
        tickets.map(async (ticket, idx) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            console.log('Pruning dead expo subscription');
            await removeSubscription(dedupeKeyFor(batchSubs[idx].subscription));
          }
        })
      );
      console.log(`Grade check trigger sent (expo x${batchSubs.length})`);
    } catch (error) {
      console.error('Failed to send Expo push batch:', error?.response?.data || error.message);
    }
  }
}

/**
 * Send the "go fetch" trigger to every subscribed device.
 * Duplicates are already prevented by the UNIQUE dedupe_key, so no in-memory
 * dedup is needed here.
 */
async function sendPushToAllDevices() {
  const subscriptions = await getSubscriptions();
  console.log('Sending push to', subscriptions.length, 'subscriptions');
  const notificationPayload = "trigger";

  // Expo tokens go out as one (or few) batched request(s); everything else is
  // sent per-subscription below.
  const expoSubs = subscriptions.filter(
    ({ platform, subscription }) => platform === 'expo' && subscription?.token
  );
  const expoPromise = sendExpoPush(expoSubs);

  const promises = subscriptions
    .filter(({ platform }) => platform !== 'expo')
    .map(async ({ subscription, platform }) => {
    const dedupeKey = dedupeKeyFor(subscription);

    if (platform === 'android' && subscription.token) {
      return sendFcm(
        {
          token: subscription.token,
          data: { trigger: 'grade_check' },
          android: { priority: 'high' },
        },
        dedupeKey,
        platform,
        'android'
      );
    }

    if (platform === 'ios' && subscription.token) {
      // iOS silent/background push via FCM -> APNs. iOS never lets the server
      // run the fetch, so we only wake the app: content-available:1 with no
      // alert/sound/badge makes this a background push. APNs requires priority 5
      // and apns-push-type "background" for these, otherwise the push is
      // rejected or the app is not woken.
      const headers = {
        'apns-push-type': 'background',
        'apns-priority': '5',
      };
      if (process.env.APNS_BUNDLE_ID) {
        headers['apns-topic'] = process.env.APNS_BUNDLE_ID;
      }
      return sendFcm(
        {
          token: subscription.token,
          data: { trigger: 'grade_check' },
          apns: {
            headers,
            payload: { aps: { 'content-available': 1 } },
          },
        },
        dedupeKey,
        platform,
        'ios'
      );
    }

    // web / web-firebase
    try {
      if (platform === 'web-firebase') {
        webPush.setVapidDetails('mailto:ruskcoder@gradexis.com', firebasePublicKey, firebasePrivateKey);
      } else {
        webPush.setVapidDetails('mailto:ruskcoder@gradexis.com', webPublicKey, webPrivateKey);
      }
      return await webPush.sendNotification(subscription, notificationPayload);
    } catch (error) {
      if (isGoneError(error, platform)) {
        console.log('Pruning dead web subscription');
        await removeSubscription(dedupeKey);
      } else {
        console.error(`Failed to send notification to ${platform}:`, error);
      }
    }
  });

  return Promise.all([expoPromise, ...promises]);
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
  removeSubscription,
  sendPushToAllDevices,
  getVapidPublicKey
};

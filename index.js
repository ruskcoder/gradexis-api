/* eslint-disable no-undef */
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
require('dotenv').config();

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

const port = 3000;

const publicKey = "BBXwLd6Bj9NMB8PrS7CoWUMvY345XnMrqlEyjhWF_bEJjbhO465fN0m637BMmcYqtHX0BGPiLzQd33c6tlUDfNI";
const privateKey = process.env.VAPID_PRIVATE_KEY

webPush.setVapidDetails(
  'mailto:ruskcoder@gradexis.com',
  publicKey,
  privateKey
);

const subscriptions = [];

app.post('/subscribe', (req, res) => {
  const subscription = req.body.payload;
  subscriptions.push(subscription);
  res.status(201).json({ message: 'Subscription received successfully.' });
});

function sendPushToAllDevices() {
  const notificationPayload = "trigger";
  const sentUrls = new Set();
  const notificationPromises = subscriptions
    .filter(subscription => {
      const endpoint = subscription.endpoint;
      if (sentUrls.has(endpoint)) {
        return false;
      }
      sentUrls.add(endpoint);
      return true;
    })
    .map((subscription) =>
      webPush.sendNotification(subscription, notificationPayload)
        .catch((error) => console.error('Error sending notification'))
    );
  return Promise.all(notificationPromises);
}

app.post('/send-notification', (req, res) => {
  sendPushToAllDevices()
    .then(() => res.status(200).json({ message: 'Notifications sent successfully.' }))
    .catch((error) => {
      res.status(500).json({ message: 'Failed to send notifications.' });
    });
});

setInterval(() => {
  sendPushToAllDevices()
    .catch(() => console.error('Failed to send push notifications.'));
}, 30 * 60 * 1000); // Every 30 minutes

app.listen(port, () => {
  console.log(`Main App listening on http://localhost:${port}`);
});

module.exports = app;
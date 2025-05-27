/* eslint-disable no-undef */
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');

const app = express();
app.use(express.json());

const hac = require('./hac/index.js');
const demo = require('./demo/index.js');
const powerschool = require('./powerschool/index.js');

app.use(cors());
app.use('/hac', hac);
app.use('/demo', demo);
app.use('/powerschool', powerschool);

const port = 3000;
const publicKey = "BMsCbudBN3my0pcAZQhVGd6Z1XwloKFdM5Gwv58geE20j-DUbQYCO4xzUeMZsrXiM4a0CYAqqT0KKkrbB3SlJHM";
const privateKey = "jAIwVjs74ZqbvePohNwaQZJAhJYilnXJl_SRyYXRW3M";
webPush.setVapidDetails(
  'mailto:gradexis.app@gmail.com',
  publicKey,
  privateKey
);

const subscriptions = [];

app.post('/subscribe', (req, res) => {
  const subscription = req.body.payload;
  subscriptions.push(subscription);
  res.status(201).json({ message: 'Subscription received successfully.' });
});

app.post('/send-notification', (req, res) => {
  const notificationPayload = req.body.payload;

  // Track URLs to avoid duplicates
  const sentUrls = new Set();

  // Send notification to unique endpoints only
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
        .catch((error) => console.error('Error sending notification:', error))
    );

  Promise.all(notificationPromises)
    .then(() => res.status(200).json({ message: 'Notifications sent successfully.' }))
    .catch((error) => {
      console.error('Error sending notifications:', error);
      res.status(500).json({ message: 'Failed to send notifications.' });
    });
});

app.listen(port, () => {
  console.log(`Main App listening on http://localhost:${port}`);
});

module.exports = app;
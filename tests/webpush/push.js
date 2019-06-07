/* WebPush Prototype */

var webpush = require('web-push');

// VAPID keys should only be generated only once.
// var vapidKeys = webpush.generateVAPIDKeys();

webpush.setGCMAPIKey(
  'AAAARM9VDGs:APA91bFTsVBhu9mLYMYOFOc6QaFqg4RPGXsSvmlfBMWVBRxAtprFxs-l4wbpfu5SJ8sNdvo0hwTHjYzYXRg7W3CAFTdBwn8nfFXDtM8cz-ySxpLVGJQCJSKxc8M5lk5MLpUxYrMjop9x '
);
webpush.setVapidDetails(
  'mailto:suculent@me.com',
  'BIAJ-5R8Ea2AUnOxnHy_Nud2iNgA5bmkt3c1TGZvCyaHrHynQEoIhHa99t8vDkbdaTY4WOw6jxBF32w7OnUdBHg',
  'sjdo4Cof3IlbeHZjt_1ouOmT2dFyn2JavA7hs1Ax7k4'
);

// This is the same output of calling JSON.stringify on a PushSubscription
var pushSubscription = {
  endpoint: 'http://rtm.thinx.cloud:7442/push',
  keys: {
    auth: 'authkey',
    p256dh: 'p256-diffie-hellman'
  }
};

webpush.sendNotification(pushSubscription, 'Your Push Payload Text');

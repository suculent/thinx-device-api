'use strict';

const express = require('express');
const simpleOauthModule = require('simple-oauth2');
// const hd = require('os').homedir();
const cfg = require('./.google.json');
const https = require('https');

const app = express();
const oauth2 = simpleOauthModule.create({
  client: {
    id: cfg.web.client_id,
    secret: cfg.web.client_secret,
  },
  auth: {
    tokenHost: 'https://accounts.google.com/',
    authorizePath: '/o/oauth2/auth',
    tokenPath: '/o/oauth2/token'
  },
});

// Authorization uri definition
const authorizationUri = oauth2.authorizationCode.authorizeURL({
  redirect_uri: cfg.web.redirect_uris[0],
  scope: 'email openid profile',
  state: '3(#0/!~12345', // this string shall be random (returned upon auth provider call back)
});

// Initial page redirecting to OAuth2 provider
app.get('/oauth/auth', (req, res) => {
  console.log(authorizationUri);
  res.redirect(authorizationUri);
});

// Callback service parsing the authorization token and asking for the access token
app.get('/oauth/cb', (req, res) => {
  const code = req.query.code;
  const options = {
    code: code,
    redirect_uri: cfg.web.redirect_uris[0]
  };

  var t = oauth2.authorizationCode.getToken(options, (error, result) => {
    if (error) {
      console.error('Access Token Error', error.message);
      return res.json('Authentication failed');
    }

    console.log('The resulting token: ', result);
    const token = oauth2.accessToken.create(result);
    return token;
  });
  t.then(res2 => {
    console.log(res2);

    https.get('https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + res2
      .access_token, (resp) => {
        let data = '';
        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
          console.log(JSON.parse(data));

          // Sample data
          // { id: '1',
          // email: 'a@b.c',
          //  verified_email: true,
          //  name: 'Matěj Sychra',
          //  given_name: 'Matěj',
          //  family_name: 'Sychra',
          //  picture: 'https://lh6.googleusercontent.com/-EvPu53ri3zs/AAAAAAAAAAI/AAAAAAAAAA8/YKTOivykmHY/photo.jpg',
          //  locale: 'en-GB',
          //  hd: 'syxra.cz' }

          // TODO: extract e-mail, given_name, family_name and picture if any
          const email = JSON.parse(data).email;
          // const owner_id = sha256(email);

        });
        res.redirect('/oauth/success');
      }).on("error", (err) => {
      console.log("Error: " + err.message);
      res.redirect('/oauth/error');
    });
  }).catch(err => {
    console.log(err);
    res.redirect('/oauth/error');
  });
});

app.get('/oauth/success', (req, res) => {
  res.send('success');
});

app.get('/oauth/error', (req, res) => {
  res.send('error');
});

app.get('/oauth/', (req, res) => {
  res.send('Hello<br><a href="/oauth/auth">Log in with OAuth2</a>');
});

app.listen(8444, () => {
  console.log('Express server started on port 8444'); // eslint-disable-line
});

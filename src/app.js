require('dotenv').config();
const axios = require('axios');
const SteamUser = require('steam-user');
const express = require('express');
const Conf = require('conf');
const querystring = require('querystring');
const btoa = require('btoa');
const cookieParser = require('cookie-parser');
const open = require('open');
const app = express();

const config = new Conf();
const client = new SteamUser({});

let clientId = process.env.CLIENTID;
let clientSecret = process.env.CLIENTSECRET;
let SteamUsername = process.env.STEAMUSERNAME;
let SteamPassword = process.env.STEAMPASSWORD;


if (!clientId) throw new Error('Missing Spotify Client ID')
if (!clientSecret) throw new Error('Missing Spotify Client Secret')
if (!SteamUsername) throw new Error('Missing Steam Username')
if (!SteamPassword) throw new Error('Missing Steam Password')


function main() {
  const access_token = config.get('access_token'),
    refresh_token = config.get('refresh_token');

  let options = {
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    json: true
  };

  return new Promise((resolve, reject) => {
    axios.get(options.url, options)
      .then(res => {
        if (res.data == "") {
          // No song playing
          resolve('')
        } else {
          // The song and artist
          resolve(`Listening to ${res.data.item.name} by ${res.data.item.artists[0].name}`)
        }
      })
      .catch(err => {
        if (error.response && error.response.status == 401) {
          // Token Expired - Refresh token
          axios
            .get('http://localhost:8888/refresh_token?refresh_token=' + refresh_token)
            .then((res) => {
              config.set('access_token', res.data.access_token);
              console.log('Token refreshed!\n');
              main()
            })
            .catch((err) => console.error(error + 'While getting token from refresh token on Cli'));
        } else {
          console.log(error);
          process.exit(0);
        }
      })
  })
}



let generateRandomString = function (length) {
  let text = '';
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

let stateKey = 'spotify_auth_state';
let redirect_uri = 'http://localhost:8888/callback';

app.use(cookieParser());

app.get('/login', function (req, res) {
  let state = generateRandomString(16);
  res.cookie(stateKey, state);
  //Authorization
  let scope = 'user-read-private user-read-email user-read-playback-state';
  res.redirect(
    'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    })
  );
});


app.get('/callback', function (req, res) {
  let code = req.query.code || null;
  let state = req.query.state || null;
  let storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect(
      '/#' +
      querystring.stringify({
        error: 'state_mismatch'
      })
    );
    console.log('State Mismatch');
    process.exit(0);
  } else {
    res.clearCookie(stateKey);
    axios
      .post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirect_uri
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret).toString('base64')
          }
        }
      )
      .then(function (response) {
        let body = response.data;
        let access_token = body.access_token,
          refresh_token = body.refresh_token;

        config.set('access_token', access_token);
        config.set('refresh_token', refresh_token);

        res.send('<h1>Close this window and restart steam spotify</h1>');
      })
      .catch((err) => console.error(err));
  }
});


app.get('/refresh_token', function (req, res) {
  let refresh_token = req.query.refresh_token;

  axios
    .post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
        redirect_uri: redirect_uri
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret).toString('base64')
        }
      }
    )
    .then(function (response) {
      let body = response.data;
      let access_token = body.access_token,
        refresh_token = body.refresh_token;

      res.send({
        access_token: access_token
      });
    })
    .catch((err) => console.error(err));
});



app.listen(8888);

(async () => {
  if (config.get('access_token') && config.get('refresh_token')) {
    console.log('Starting Steam Spotify')
    client.logOn({
      "accountName": SteamUsername,
      "password": SteamPassword
    })
    client.on('loggedOn', function (details) {
      client.setPersona(SteamUser.EPersonaState.Online);
      setInterval(() => {
        main()
          .then(status => client.gamesPlayed(status))
          .catch(err => console.log(err))
      }, 1000)
    });
  } else {
    await open('http://localhost:8888/login')
  }
})();
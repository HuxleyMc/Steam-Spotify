require('dotenv').config();
var request = require('request');
const axios = require('axios');
const SteamUser = require('steam-user');


let clientId = process.env.CLIENTID;
let clientSecret = process.env.CLIENTSECRET;
let token = process.env.TOKEN;
let loggedIn = false;


const client = new SteamUser({});

client.logOn({
  "accountName": process.env.ACCOUNTNAME,
  "password": process.env.PASSWORD
})

client.on('loggedOn', function (details) {
  client.setPersona(SteamUser.EPersonaState.Online);
  loggedIn = true;
  setInterval(() => {
    if (loggedIn && token) {
      let option = {
        url: "https://api.spotify.com/v1/me/player/currently-playing",
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        }
      }
      axios(option)
        .then(res => {
          if (loggedIn) {
            client.gamesPlayed(`Listening to ${res.data.item.name} by ${res.data.item.artists[0].name}`)
          }
        })
        .catch(err => console.error(err))
    }
  }, 1000)
});




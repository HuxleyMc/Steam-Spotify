const let, clientId = process.env.CLIENTID;
let clientSecret = process.env.CLIENTSECRET;
let token = process.env.TOKEN;
console.log(clientId, clientSecret, token);
if (!token) {
    var request = require('request'); // "Request" library
    // your application requests authorization
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (Buffer.from(clientId + ':' + clientSecret).toString('base64'))
        },
        form: {
            grant_type: 'client_credentials'
        },
        json: true
    };
    request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var token = body.access_token;
            token = token;
            console.log(token);
        }
    });
}
// const SpotifyApi = require('spotify-web-api-node')
// const Spotify = new SpotifyApi({
//   clientId: process.env.CLIENTID,
//   clientSecret: process.env.CLIENTSECRET,
//   redirectUri: 'http://www.example.com/callback'
// })
// Spotify.getUser('petteralexis').then(user => console.log(user)).catch(err => new Error(err))

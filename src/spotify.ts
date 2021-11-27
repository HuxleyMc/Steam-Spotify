import SpotifyWebApi from "spotify-web-api-node";
import { Express } from "express";
import { config, DOMAIN } from "./config";

const initSpotify = async (
  clientId: string,
  clientSecret: string,
  server: Express
) => {
  const spotifyApi = new SpotifyWebApi({
    clientId,
    clientSecret,
    redirectUri: `${DOMAIN}/callback`,
  });

  let tokenRefreshInterval: NodeJS.Timeout;

  const access_token = config.get("access_token") as string;
  const refresh_token = config.get("refresh_token") as string;
  const expires_in = config.get("expires_in") as number;

  if (access_token && refresh_token && expires_in) {
    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);

    tokenRefreshInterval = setInterval(async () => {
      const data = await spotifyApi.refreshAccessToken();
      const access_token = data.body["access_token"];

      console.log("The access token has been refreshed!");
      console.log("access_token:", access_token);
      spotifyApi.setAccessToken(access_token);
    }, (expires_in / 2) * 1000);
  }

  server.get("/login", (req, res) => {
    const scopes = ["user-read-currently-playing", "user-read-playback-state"];
    res.redirect(spotifyApi.createAuthorizeURL(scopes, "state"));
  });

  server.get("/callback", async (req, res) => {
    const error = req.query.error;
    const code = req.query.code as string;

    if (error) {
      console.error("Callback Error:", error);
      process.exit(1);
    }

    const codeGrant = await spotifyApi.authorizationCodeGrant(code);
    const access_token = codeGrant.body["access_token"];
    const refresh_token = codeGrant.body["refresh_token"];
    const expires_in = codeGrant.body["expires_in"];

    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);
    config.set("access_token", access_token);
    config.set("refresh_token", refresh_token);
    config.set("expires_in", expires_in);

    res.send("Success! You can now close the window.");

    tokenRefreshInterval = setInterval(async () => {
      const data = await spotifyApi.refreshAccessToken();
      const access_token = data.body["access_token"];

      console.log("The access token has been refreshed!");
      console.log("access_token:", access_token);
      spotifyApi.setAccessToken(access_token);
    }, (expires_in / 2) * 1000);
  });

  if (!spotifyApi.getAccessToken()) {
    console.log(
      `Please log in to Spotify in the browser and allow access - ${DOMAIN}/login`
    );
  }

  while (!spotifyApi.getAccessToken()) {
    console.log("Waiting for user to authorize the app...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("Spotify API ready!");

  return spotifyApi;
};

export { initSpotify };

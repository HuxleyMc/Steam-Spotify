import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { loadSpotifyTokens, saveSpotifyTokens } from "./config";

const AUTH_WAIT_INTERVAL_MS = 5000;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REDIRECT_URI = "http://localhost:8888/callback";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const CURRENT_TRACK_URL =
  "https://api.spotify.com/v1/me/player/currently-playing";

export type CurrentTrack = {
  id: string;
  name: string;
};

export type TrackDetails = {
  name: string;
  artists: Array<{ name: string }>;
};

export type SpotifyClient = {
  getMyCurrentPlayingTrack: () => Promise<{
    is_playing: boolean;
    item: CurrentTrack | null;
  }>;
  getTrack: (id: string) => Promise<TrackDetails>;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

const writeText = (res: ServerResponse, statusCode: number, text: string) => {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
};

const toBasicAuth = (clientId: string, clientSecret: string) => {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
};

const requestToken = async (
  clientId: string,
  clientSecret: string,
  params: URLSearchParams
): Promise<SpotifyTokenResponse> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBasicAuth(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spotify token request failed (${response.status}): ${body}`
    );
  }

  return (await response.json()) as SpotifyTokenResponse;
};

const initSpotify = async (
  clientId: string,
  clientSecret: string
): Promise<SpotifyClient> => {
  let accessToken = "";
  let refreshToken = "";
  let expiresIn = 3600;
  let authState = "";

  const persistedTokens = await loadSpotifyTokens();
  if (persistedTokens) {
    accessToken = persistedTokens.accessToken;
    refreshToken = persistedTokens.refreshToken;
    expiresIn = persistedTokens.expiresIn;
  }

  const refreshAccessToken = async () => {
    if (!refreshToken) {
      throw new Error("No refresh token available.");
    }

    const refreshed = await requestToken(
      clientId,
      clientSecret,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    );

    accessToken = refreshed.access_token;
    expiresIn = refreshed.expires_in;
    if (refreshed.refresh_token) {
      refreshToken = refreshed.refresh_token;
    }

    await saveSpotifyTokens({
      accessToken,
      refreshToken,
      expiresIn,
    });

    console.log("The access token has been refreshed!");
  };

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", REDIRECT_URI);

      if (url.pathname === "/login") {
        authState = randomUUID();
        const scopes = [
          "user-read-currently-playing",
          "user-read-playback-state",
        ];
        const authorizeUrl = new URL(AUTHORIZE_URL);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("scope", scopes.join(" "));
        authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
        authorizeUrl.searchParams.set("state", authState);

        res.writeHead(302, { Location: authorizeUrl.toString() });
        res.end();
        return;
      }

      if (url.pathname === "/callback") {
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (error) {
          console.error("Callback Error:", error);
          writeText(res, 400, "Spotify callback failed. Check app settings.");
          return;
        }

        if (!code) {
          writeText(res, 400, "Missing authorization code.");
          return;
        }

        if (!state || state !== authState) {
          writeText(res, 400, "Invalid OAuth state. Please retry /login.");
          return;
        }

        try {
          const codeGrant = await requestToken(
            clientId,
            clientSecret,
            new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: REDIRECT_URI,
            })
          );

          accessToken = codeGrant.access_token;
          refreshToken = codeGrant.refresh_token || refreshToken;
          expiresIn = codeGrant.expires_in;

          await saveSpotifyTokens({
            accessToken,
            refreshToken,
            expiresIn,
          });

          writeText(
            res,
            200,
            "Success! Spotify is connected. You can close this tab."
          );
        } catch (grantError) {
          console.error(
            "Failed to complete Spotify authorization:",
            grantError
          );
          writeText(
            res,
            500,
            "Authorization failed. Check CLIENTID, CLIENTSECRET, and redirect URI."
          );
        }

        return;
      }

      writeText(res, 404, "Not found");
    }
  );

  server.listen(8888, () => {
    console.log("OAuth server listening at http://localhost:8888");
  });

  if (!accessToken) {
    console.log("Open http://localhost:8888/login to connect Spotify.");
    console.log(
      `If authorization fails, confirm the Spotify redirect URI is exactly ${REDIRECT_URI}.`
    );
  }

  const authStartedAt = Date.now();

  while (!accessToken) {
    console.log("Waiting for user to authorize the app...");

    if (Date.now() - authStartedAt > AUTH_TIMEOUT_MS) {
      console.error("Timed out waiting for Spotify authorization.");
      console.error("Open http://localhost:8888/login and complete the flow.");
      console.error(
        `Make sure your Spotify app redirect URI is ${REDIRECT_URI}.`
      );
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, AUTH_WAIT_INTERVAL_MS));
  }

  setInterval(async () => {
    try {
      await refreshAccessToken();
    } catch (refreshError) {
      console.error("Failed to refresh Spotify token:", refreshError);
      console.error(
        "Please re-open http://localhost:8888/login to re-authorize."
      );
    }
  }, (expiresIn / 2) * 1000);

  console.log("Spotify API ready!");

  const spotifyRequest = async <T>(
    input: string,
    retryWithRefresh = true
  ): Promise<T> => {
    const response = await fetch(input, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401 && retryWithRefresh && refreshToken) {
      await refreshAccessToken();
      return spotifyRequest<T>(input, false);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Spotify API request failed (${response.status}): ${body}`
      );
    }

    return (await response.json()) as T;
  };

  return {
    getMyCurrentPlayingTrack: async () => {
      type SpotifyCurrentTrackResponse = {
        is_playing: boolean;
        item: CurrentTrack | null;
      };

      const response = await fetch(CURRENT_TRACK_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 204) {
        return { is_playing: false, item: null };
      }

      if (response.status === 401 && refreshToken) {
        await refreshAccessToken();
        return spotifyRequest<SpotifyCurrentTrackResponse>(
          CURRENT_TRACK_URL,
          false
        );
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Spotify API request failed (${response.status}): ${body}`
        );
      }

      return (await response.json()) as SpotifyCurrentTrackResponse;
    },
    getTrack: async (id: string) => {
      const trackUrl = `https://api.spotify.com/v1/tracks/${id}`;
      return spotifyRequest<TrackDetails>(trackUrl);
    },
  };
};

export { initSpotify };

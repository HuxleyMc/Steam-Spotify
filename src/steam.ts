import SteamUser from "steam-user";

import { SpotifyClient } from "./spotify";

const client = new SteamUser({});
const STEAM_GUARD_REQUIRED_MARKER = "STEAM_GUARD_REQUIRED";
let steamLogHandlersBound = false;

const bindSteamRuntimeLogs = () => {
  if (steamLogHandlersBound) {
    return;
  }

  steamLogHandlersBound = true;

  client.on("disconnected", (eresult, msg) => {
    const reason = msg ? `: ${msg}` : "";
    console.warn(`[steam] Disconnected (eresult=${eresult})${reason}`);
  });

  client.on("webSession", () => {
    console.log("[steam] Web session established.");
  });

  client.on("playingState", (blocked, playingApp) => {
    console.log(
      `[steam] Playing state updated (blocked=${blocked}, app=${playingApp}).`
    );
  });

  if (process.env.STEAM_DEBUG?.trim() === "1") {
    client.on("debug", (message) => {
      console.log(`[steam-debug] ${message}`);
    });
  }
};

const requestSteamGuardCode = (
  domain: string | null,
  lastCodeWrong: boolean
): Promise<string> => {
  const configuredCode = process.env.STEAMGUARD?.trim();
  if (configuredCode) {
    console.log("Steam Guard challenge received. Using STEAMGUARD code.");
    return Promise.resolve(configuredCode);
  }

  const domainLabel = domain || "unknown";
  const retryLabel = lastCodeWrong ? "true" : "false";
  console.log(
    `${STEAM_GUARD_REQUIRED_MARKER} domain=${domainLabel} retry=${retryLabel}`
  );
  console.error("Steam Guard challenge received.");
  if (domain) {
    console.error(`Enter the code sent by Steam to: ${domain}`);
  }
  if (lastCodeWrong) {
    console.error("The previous Steam Guard code was incorrect.");
  }
  console.error(
    "Awaiting Steam Guard code from stdin (desktop prompt or terminal input)."
  );

  return new Promise<string>((resolve, reject) => {
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    let buffered = "";

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
    };

    const onData = (chunk: string | Buffer) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";

      for (const line of lines) {
        const code = line.trim();
        if (!code) {
          continue;
        }

        cleanup();
        resolve(code);
        return;
      }
    };

    const onEnd = () => {
      cleanup();
      reject(new Error("stdin ended before receiving Steam Guard code."));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
  });
};

export const initSteam = async (username: string, password: string) => {
  bindSteamRuntimeLogs();
  console.log("Attempting Steam login...");

  return new Promise<SteamUser>((resolve, reject) => {
    const onLoggedOn = () => {
      console.log("Logged into Steam");
      client.setPersona(SteamUser.EPersonaState.Online);
      cleanup();
      resolve(client);
    };

    const onError = (error: Error) => {
      console.error("Failed to login to steam: ", error);
      console.error(
        "Verify STEAMUSERNAME and STEAMPASSWORD in .env, then try again."
      );
      cleanup();
      reject(error);
    };

    const onSteamGuard = (
      domain: string | null,
      callback: (code: string) => void,
      lastCodeWrong = false
    ) => {
      requestSteamGuardCode(domain, lastCodeWrong)
        .then((code) => {
          console.log("Submitting Steam Guard code...");
          callback(code);
        })
        .catch((error) => {
          console.error("Failed to obtain Steam Guard code:", error);
          cleanup();
          reject(error);
        });
    };

    const cleanup = () => {
      client.removeListener("loggedOn", onLoggedOn);
      client.removeListener("error", onError);
      client.removeListener("steamGuard", onSteamGuard);
    };

    client.on("loggedOn", onLoggedOn);
    client.on("error", onError);
    client.on("steamGuard", onSteamGuard);

    client.logOn({
      accountName: username,
      password: password,
    });
  });
};

export const updatePlayingSong = async (
  spotify: SpotifyClient,
  notPlaying: string
) => {
  let currentId = "";
  setInterval(async () => {
    try {
      const currentlyPlaying = await spotify.getMyCurrentPlayingTrack();
      if (currentlyPlaying.is_playing && currentlyPlaying.item) {
        const track = currentlyPlaying.item;
        const songId = track.id;
        if (songId !== currentId) {
          console.log("Now playing:", track.name);
          const fullTrack = await spotify.getTrack(track.id);
          const playing = `Listening to ${fullTrack.name} • ${fullTrack.artists
            .map(({ name }) => name)
            .join(", ")}`;
          client.gamesPlayed(playing);
          currentId = songId;
        }
      } else {
        if (currentId !== notPlaying) {
          console.log("Not playing anything");
          client.gamesPlayed(notPlaying);
          currentId = notPlaying;
        }
      }
    } catch (error) {
      console.error("Failed to fetch current Spotify playback:", error);
    }
  }, 2000);
};

import SteamUser from "steam-user";

import { SpotifyClient } from "./spotify";

const client = new SteamUser({});

export const initSteam = async (username: string, password: string) => {
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
      callback: (code: string) => void
    ) => {
      const configuredCode = process.env.STEAMGUARD?.trim();

      if (configuredCode) {
        console.log("Steam Guard challenge received. Using STEAMGUARD code.");
        callback(configuredCode);
        return;
      }

      console.error("Steam Guard challenge received.");
      if (domain) {
        console.error(`Enter the code sent by Steam to: ${domain}`);
      }
      console.error(
        "Set STEAMGUARD in your environment (or desktop settings) and restart sync."
      );
      cleanup();
      reject(new Error("Steam Guard code required."));
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

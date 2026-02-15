import { initConfig } from "./config";
import { initSteam, updatePlayingSong } from "./steam";
import { initSpotify } from "./spotify";

const main = async () => {
  const { SteamUsername, SteamPassword, ClientId, ClientSecret, NotPlaying } =
    initConfig();

  const spotify = await initSpotify(ClientId, ClientSecret);

  await initSteam(SteamUsername, SteamPassword);

  await updatePlayingSong(spotify, NotPlaying);
};

main();

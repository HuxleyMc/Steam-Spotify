import { initConfig } from "./config";
import { initSteam, updatePlayingSong } from "./steam";
import { initSpotify } from "./spotify";

const handleShutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down.`);
  process.exit(0);
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

const main = async () => {
  const { SteamUsername, SteamPassword, ClientId, ClientSecret, NotPlaying } =
    initConfig();

  console.log("Initializing Spotify client...");
  const spotify = await initSpotify(ClientId, ClientSecret);

  console.log("Initializing Steam session...");
  await initSteam(SteamUsername, SteamPassword);

  console.log("Starting playback sync loop...");
  await updatePlayingSong(spotify, NotPlaying);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Initialize dotenv as early as possible
require("dotenv").config();

import express from "express";

import { initConfig } from "./config";
import { initSteam, updatePlayingSong } from "./steam";
import { initSpotify } from "./spotify";

const server = express();

const main = async () => {
  const { SteamUsername, SteamPassword, ClientId, ClientSecret, NotPlaying } =
    initConfig();

  const spotify = await initSpotify(ClientId, ClientSecret, server);

  await initSteam(SteamUsername, SteamPassword);

  await updatePlayingSong(spotify, NotPlaying);
};

server.listen(8888, () => {});

main();

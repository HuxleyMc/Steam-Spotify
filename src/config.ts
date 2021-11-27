import Conf from "conf";

export const config = new Conf({});

const ClientId = process.env.CLIENTID;
const ClientSecret = process.env.CLIENTSECRET;
const SteamUsername = process.env.STEAMUSERNAME;
const SteamPassword = process.env.STEAMPASSWORD;
const NotPlaying = process.env.NOTPLAYING || "Monkey";
export const DOMAIN = process.env.DOMAIN || "http://localhost:3000";

export const initConfig = () => {
  if (!ClientId || !ClientSecret || !SteamUsername || !SteamPassword) {
    console.error("Missing config values: ", {
      ClientId,
      ClientSecret,
      SteamUsername,
      SteamPassword,
    });
    process.exit(1);
  }
  console.log("Config loaded");
  return {
    ClientId,
    ClientSecret,
    SteamUsername,
    SteamPassword,
    NotPlaying,
  };
};

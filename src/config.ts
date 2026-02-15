import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const getTokenStorePath = () => {
  return path.join(process.cwd(), ".steam-spotify-tokens.json");
};

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export const initConfig = () => {
  const clientId = process.env.CLIENTID;
  const clientSecret = process.env.CLIENTSECRET;
  const steamUsername = process.env.STEAMUSERNAME;
  const steamPassword = process.env.STEAMPASSWORD;
  const notPlaying = process.env.NOTPLAYING || "Monkey";

  const missingKeys: string[] = [];

  if (!clientId) {
    missingKeys.push("CLIENTID");
  }

  if (!clientSecret) {
    missingKeys.push("CLIENTSECRET");
  }

  if (!steamUsername) {
    missingKeys.push("STEAMUSERNAME");
  }

  if (!steamPassword) {
    missingKeys.push("STEAMPASSWORD");
  }

  if (missingKeys.length > 0) {
    console.error(
      `Missing required environment variables: ${missingKeys.join(", ")}`
    );
    console.error("Copy example.env to .env and fill in all required values.");
    process.exit(1);
  }

  console.log("Config loaded.");

  return {
    ClientId: clientId as string,
    ClientSecret: clientSecret as string,
    SteamUsername: steamUsername as string,
    SteamPassword: steamPassword as string,
    NotPlaying: notPlaying,
  };
};

export const loadSpotifyTokens = async (): Promise<SpotifyTokens | null> => {
  const tokenStorePath = getTokenStorePath();

  try {
    const content = await readFile(tokenStorePath, "utf8");
    const parsed = JSON.parse(content) as Partial<SpotifyTokens>;

    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.expiresIn === "number"
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresIn: parsed.expiresIn,
      };
    }

    return null;
  } catch {
    return null;
  }
};

export const saveSpotifyTokens = async (tokens: SpotifyTokens) => {
  const tokenStorePath = getTokenStorePath();

  await mkdir(path.dirname(tokenStorePath), { recursive: true });
  await writeFile(tokenStorePath, JSON.stringify(tokens, null, 2), "utf8");
};

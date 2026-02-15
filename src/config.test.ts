import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { initConfig, loadSpotifyTokens, saveSpotifyTokens } from "./config";

const REQUIRED_ENV_KEYS = [
  "CLIENTID",
  "CLIENTSECRET",
  "STEAMUSERNAME",
  "STEAMPASSWORD",
  "NOTPLAYING",
] as const;

const TOKEN_FILE = ".steam-spotify-tokens.json";

describe("config", () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "steam-spotify-test-"));
    process.chdir(tempDir);

    for (const key of REQUIRED_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    process.exit = originalExit;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns validated config and NOTPLAYING default", () => {
    process.env.CLIENTID = "cid";
    process.env.CLIENTSECRET = "secret";
    process.env.STEAMUSERNAME = "steam-user";
    process.env.STEAMPASSWORD = "steam-pass";

    console.log = () => {};

    const config = initConfig();

    expect(config).toEqual({
      ClientId: "cid",
      ClientSecret: "secret",
      SteamUsername: "steam-user",
      SteamPassword: "steam-pass",
      NotPlaying: "Monkey",
    });
  });

  test("exits with missing key list when required env is absent", () => {
    const errors: string[] = [];

    console.error = (...args: unknown[]) => {
      errors.push(args.join(" "));
    };
    process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as typeof process.exit;

    expect(() => initConfig()).toThrow("process.exit:1");
    expect(errors.some((line) => line.includes("CLIENTID"))).toBeTrue();
    expect(errors.some((line) => line.includes("CLIENTSECRET"))).toBeTrue();
    expect(errors.some((line) => line.includes("STEAMUSERNAME"))).toBeTrue();
    expect(errors.some((line) => line.includes("STEAMPASSWORD"))).toBeTrue();
  });

  test("persists and reloads spotify tokens", async () => {
    await saveSpotifyTokens({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 3600,
    });

    const loaded = await loadSpotifyTokens();

    expect(loaded).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 3600,
    });
  });

  test("returns null for malformed token file", async () => {
    const tokenPath = path.join(tempDir, TOKEN_FILE);
    await writeFile(tokenPath, '{"accessToken":123}', "utf8");

    const loaded = await loadSpotifyTokens();

    expect(loaded).toBeNull();
  });
});

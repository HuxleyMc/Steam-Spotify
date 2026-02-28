import SteamUser from "steam-user";

import { SpotifyClient } from "./spotify";

const client = new SteamUser({
  protocol: SteamUser.EConnectionProtocol.TCP,
});
const STEAM_GUARD_REQUIRED_MARKER = "STEAM_GUARD_REQUIRED";
const STEAM_UI_STATUS_MARKER = "STEAM_UI_STATUS";
const STEAM_GUARD_APPROVED_TOKEN = "__STEAM_APPROVED__";
const STEAM_LOGIN_TIMEOUT_MS = 90_000;
const STEAM_APPROVAL_RETRY_DELAY_MS = 3_000;
let steamLogHandlersBound = false;
let steamGuardInputBound = false;
let steamGuardInputBuffer = "";
let steamGuardCodeSubmittedHook: ((code: string) => void) | null = null;
let lastSteamUiStatusSignature = "";
const pendingSteamGuardCodes: string[] = [];
const steamGuardWaiters: Array<{
  resolve: (code: string) => void;
  reject: (error: Error) => void;
}> = [];

const emitSteamUiStatus = (state: string, detail: string) => {
  const signature = `${state}|${detail}`;
  if (signature === lastSteamUiStatusSignature) {
    return;
  }

  lastSteamUiStatusSignature = signature;
  const encodedDetail = encodeURIComponent(detail);
  console.log(
    `${STEAM_UI_STATUS_MARKER} state=${state} detail=${encodedDetail}`
  );
};

const bindSteamRuntimeLogs = () => {
  if (steamLogHandlersBound) {
    return;
  }

  steamLogHandlersBound = true;

  client.on("disconnected", (eresult, msg) => {
    const reason = msg ? `: ${msg}` : "";
    console.warn(`[steam] Disconnected (eresult=${eresult})${reason}`);
    emitSteamUiStatus(
      "disconnected",
      `Steam disconnected (eresult=${eresult})${reason || "."}`
    );
  });

  client.on("webSession", () => {
    console.log("[steam] Web session established.");
    emitSteamUiStatus("connected", "Steam web session established.");
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

const deliverSteamGuardCode = (code: string) => {
  const waiter = steamGuardWaiters.shift();
  if (waiter) {
    waiter.resolve(code);
    return;
  }

  if (steamGuardCodeSubmittedHook) {
    steamGuardCodeSubmittedHook(code);
    return;
  }

  pendingSteamGuardCodes.push(code);
};

const bindSteamGuardInput = () => {
  if (steamGuardInputBound) {
    return;
  }

  steamGuardInputBound = true;
  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  process.stdin.on("data", (chunk: string | Buffer) => {
    steamGuardInputBuffer += chunk.toString();
    const lines = steamGuardInputBuffer.split(/\r?\n/);
    steamGuardInputBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const code = line.trim();
      if (!code) {
        continue;
      }

      if (code === STEAM_GUARD_APPROVED_TOKEN) {
        console.log("[steam] Received Steam Guard approval confirmation.");
        deliverSteamGuardCode("");
        continue;
      }

      console.log(`[steam] Received Steam Guard input (${code.length} chars).`);
      deliverSteamGuardCode(code);
    }
  });

  process.stdin.on("end", () => {
    const error = new Error("stdin ended before receiving Steam Guard code.");
    while (steamGuardWaiters.length > 0) {
      steamGuardWaiters.shift()?.reject(error);
    }
  });

  process.stdin.on("error", (error: Error) => {
    while (steamGuardWaiters.length > 0) {
      steamGuardWaiters.shift()?.reject(error);
    }
  });
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
  const mode = domain ? "code" : "approval";
  console.log(
    `${STEAM_GUARD_REQUIRED_MARKER} domain=${domainLabel} retry=${retryLabel} mode=${mode}`
  );
  emitSteamUiStatus(
    "guard",
    domain
      ? `Steam Guard required for ${domain}.`
      : "Steam sign-in approval required."
  );
  console.error("Steam Guard challenge received.");
  if (domain) {
    console.error(`Enter the code sent by Steam to: ${domain}`);
  } else {
    console.error(
      "Approve the Steam sign-in request in the Steam app, then continue from the UI prompt."
    );
  }
  if (lastCodeWrong) {
    console.error("The previous Steam Guard code was incorrect.");
  }
  console.error(
    domain
      ? "Awaiting Steam Guard code from stdin (desktop prompt or terminal input)."
      : "Awaiting Steam sign-in approval confirmation from stdin (desktop prompt or terminal input)."
  );

  if (!domain) {
    if (lastCodeWrong) {
      console.log(
        `[steam] Approval not confirmed yet. Re-checking in ${Math.round(
          STEAM_APPROVAL_RETRY_DELAY_MS / 1000
        )}s...`
      );
    }

    const delayMs = lastCodeWrong ? STEAM_APPROVAL_RETRY_DELAY_MS : 0;
    return new Promise<string>((resolve) => {
      setTimeout(() => resolve(""), delayMs);
    });
  }

  bindSteamGuardInput();

  if (pendingSteamGuardCodes.length > 0) {
    console.log("[steam] Using queued Steam Guard code.");
    return Promise.resolve(pendingSteamGuardCodes.shift() as string);
  }

  return new Promise<string>((resolve, reject) => {
    steamGuardWaiters.push({ resolve, reject });
  });
};

export const initSteam = async (username: string, password: string) => {
  bindSteamRuntimeLogs();
  console.log("[steam] Connection protocol: TCP");
  emitSteamUiStatus("connecting", "Connecting to Steam...");
  console.log("Attempting Steam login...");

  return new Promise<SteamUser>((resolve, reject) => {
    steamGuardCodeSubmittedHook = (code: string) => {
      if (settled) {
        return;
      }

      console.log(
        "[steam] Steam Guard code submitted manually. Retrying logon with provided code."
      );
      emitSteamUiStatus("connecting", "Submitting Steam Guard code...");
      client.logOn({
        accountName: username,
        password: password,
        twoFactorCode: code,
        authCode: code,
      });
    };

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Timed out waiting for Steam login."));
    }, STEAM_LOGIN_TIMEOUT_MS);

    const onLoggedOn = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      console.log("Logged into Steam");
      emitSteamUiStatus("connected", "Logged into Steam.");
      client.setPersona(SteamUser.EPersonaState.Online);
      cleanup();
      resolve(client);
    };

    const onError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      console.error("Failed to login to steam: ", error);
      emitSteamUiStatus(
        "error",
        `Steam login failed: ${error.message || "unknown error"}.`
      );
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
      console.log(
        `[steam] Steam Guard challenge received (domain=${
          domain || "unknown"
        }, retry=${lastCodeWrong}).`
      );
      requestSteamGuardCode(domain, lastCodeWrong)
        .then((code) => {
          console.log("Submitting Steam Guard code...");
          emitSteamUiStatus("connecting", "Submitting Steam Guard code...");
          callback(code);
        })
        .catch((error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          console.error("Failed to obtain Steam Guard code:", error);
          emitSteamUiStatus(
            "error",
            `Failed to obtain Steam Guard code: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          cleanup();
          reject(error);
        });
    };

    const onDisconnected = (eresult: number, msg?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const reason = msg ? ` (${msg})` : "";
      emitSteamUiStatus(
        "disconnected",
        `Steam disconnected during login (eresult=${eresult})${reason}`
      );
      reject(
        new Error(
          `Steam disconnected during login (eresult=${eresult})${reason}`
        )
      );
    };

    const cleanup = () => {
      client.removeListener("loggedOn", onLoggedOn);
      client.removeListener("error", onError);
      client.removeListener("steamGuard", onSteamGuard);
      client.removeListener("disconnected", onDisconnected);
      steamGuardCodeSubmittedHook = null;
    };

    client.on("loggedOn", onLoggedOn);
    client.on("error", onError);
    client.on("steamGuard", onSteamGuard);
    client.on("disconnected", onDisconnected);

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
          emitSteamUiStatus("playing", `Steam status: ${playing}`);
          currentId = songId;
        }
      } else {
        if (currentId !== notPlaying) {
          console.log("Not playing anything");
          client.gamesPlayed(notPlaying);
          emitSteamUiStatus("idle", `Steam status: ${notPlaying}`);
          currentId = notPlaying;
        }
      }
    } catch (error) {
      console.error("Failed to fetch current Spotify playback:", error);
      emitSteamUiStatus("error", "Spotify playback fetch failed; retrying.");
    }
  }, 2000);
};

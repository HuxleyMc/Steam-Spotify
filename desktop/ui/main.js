const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;

const clientId = document.querySelector("#clientId");
const clientSecret = document.querySelector("#clientSecret");
const redirectUri = document.querySelector("#redirectUri");
const steamUsername = document.querySelector("#steamUsername");
const steamPassword = document.querySelector("#steamPassword");
const notPlaying = document.querySelector("#notPlaying");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const stopButton = document.querySelector("#stopButton");
const loginButton = document.querySelector("#loginButton");
const steamGuardOpenButton = document.querySelector("#steamGuardOpenButton");
const clearLogsButton = document.querySelector("#clearLogsButton");
const steamGuardPrompt = document.querySelector("#steamGuardPrompt");
const steamGuardPromptDetail = document.querySelector(
  "#steamGuardPromptDetail"
);
const steamGuardPromptInput = document.querySelector("#steamGuardPromptInput");
const steamGuardSubmitButton = document.querySelector(
  "#steamGuardSubmitButton"
);
const statusEl = document.querySelector("#status");
const statusDetailEl = document.querySelector("#statusDetail");
const steamStatusEl = document.querySelector("#steamStatus");
const steamStatusDetailEl = document.querySelector("#steamStatusDetail");
const logsEl = document.querySelector("#logs");
const logCountEl = document.querySelector("#logCount");
const streamStateEl = document.querySelector("#streamState");
const credentialsFieldsEl = document.querySelector("#credentialsFields");
const credentialsToggleButton = document.querySelector(
  "#credentialsToggleButton"
);

const steamGuardMarker = "STEAM_GUARD_REQUIRED";
const steamUiStatusMarker = "STEAM_UI_STATUS";
const credentialsCollapsedStorageKey = "steamSpotify.credentialsCollapsed";

let syncRunning = false;
let actionInProgress = false;
let logLineCount = 0;

const statusClassNames = [
  "status-idle",
  "status-running",
  "status-starting",
  "status-stopping",
  "status-disconnected",
  "status-error",
];

const streamClassNames = ["stream-idle", "stream-live", "stream-error"];
const steamStatusClassNames = [
  "steam-state-idle",
  "steam-state-connecting",
  "steam-state-guard",
  "steam-state-connected",
  "steam-state-playing",
  "steam-state-disconnected",
  "steam-state-error",
];

const statusVariants = {
  idle: {
    className: "status-idle",
    label: "Status: idle",
    detail: "Sync is not running.",
  },
  running: {
    className: "status-running",
    label: "Status: running",
    detail: "Sync process is running.",
  },
  starting: {
    className: "status-starting",
    label: "Status: starting",
    detail: "Launching sync process.",
  },
  stopping: {
    className: "status-stopping",
    label: "Status: stopping",
    detail: "Stopping sync process.",
  },
  disconnected: {
    className: "status-disconnected",
    label: "Status: disconnected",
    detail: "Sync process exited unexpectedly.",
  },
  error: {
    className: "status-error",
    label: "Status: error",
    detail: "An error occurred. Check logs for details.",
  },
};

const streamVariants = {
  idle: {
    className: "stream-idle",
    label: "stream idle",
  },
  live: {
    className: "stream-live",
    label: "stream live",
  },
  error: {
    className: "stream-error",
    label: "stream alert",
  },
};

const streamByStatus = {
  idle: "idle",
  running: "live",
  starting: "live",
  stopping: "live",
  disconnected: "error",
  error: "error",
};

const steamStatusVariants = {
  idle: {
    className: "steam-state-idle",
    label: "Steam: idle",
    detail: "Waiting for sync to start.",
  },
  connecting: {
    className: "steam-state-connecting",
    label: "Steam: connecting",
    detail: "Attempting Steam login.",
  },
  guard: {
    className: "steam-state-guard",
    label: "Steam: guard required",
    detail: "Steam Guard code is required.",
  },
  connected: {
    className: "steam-state-connected",
    label: "Steam: connected",
    detail: "Steam session is authenticated.",
  },
  playing: {
    className: "steam-state-playing",
    label: "Steam: status set",
    detail: "Steam presence was updated.",
  },
  disconnected: {
    className: "steam-state-disconnected",
    label: "Steam: disconnected",
    detail: "Steam disconnected.",
  },
  error: {
    className: "steam-state-error",
    label: "Steam: error",
    detail: "Steam integration reported an error.",
  },
};

const setStreamState = (state) => {
  if (!streamStateEl) {
    return;
  }

  const variant = streamVariants[state] ?? streamVariants.error;
  streamStateEl.classList.remove(...streamClassNames);
  streamStateEl.classList.add(variant.className);
  streamStateEl.textContent = variant.label;
};

const setSteamStatus = (state, detail) => {
  if (!steamStatusEl || !steamStatusDetailEl) {
    return;
  }

  const variant = steamStatusVariants[state] ?? steamStatusVariants.error;
  steamStatusEl.classList.remove(...steamStatusClassNames);
  steamStatusEl.classList.add(variant.className);
  steamStatusEl.textContent = variant.label;
  steamStatusDetailEl.textContent = detail ?? variant.detail;
};

const parseSteamUiStatus = (line) => {
  const markerIndex = line.indexOf(steamUiStatusMarker);
  if (markerIndex === -1) {
    return null;
  }

  const payload = line.slice(markerIndex + steamUiStatusMarker.length).trim();
  const stateMatch = payload.match(/\bstate=([a-z-]+)/i);
  if (!stateMatch) {
    return null;
  }

  const rawDetail = payload.match(/\bdetail=([^\s]+)/)?.[1];
  let detail;
  if (rawDetail) {
    try {
      detail = decodeURIComponent(rawDetail);
    } catch {
      detail = rawDetail;
    }
  }

  return {
    state: stateMatch[1].toLowerCase(),
    detail,
  };
};

const setCredentialsCollapsed = (collapsed) => {
  if (!credentialsFieldsEl || !credentialsToggleButton) {
    return;
  }

  credentialsFieldsEl.hidden = collapsed;
  credentialsToggleButton.textContent = collapsed
    ? "Show Credentials"
    : "Hide Credentials";
  credentialsToggleButton.setAttribute("aria-expanded", String(!collapsed));
};

const loadCollapsedCredentialsPreference = () => {
  try {
    return window.localStorage.getItem(credentialsCollapsedStorageKey) === "1";
  } catch {
    return false;
  }
};

const saveCollapsedCredentialsPreference = (collapsed) => {
  try {
    window.localStorage.setItem(
      credentialsCollapsedStorageKey,
      collapsed ? "1" : "0"
    );
  } catch {
    // Ignore storage write failures; toggle still works for this session.
  }
};

const updateLogCount = () => {
  if (!logCountEl) {
    return;
  }

  const lineLabel = logLineCount === 1 ? "line" : "lines";
  logCountEl.textContent = `${logLineCount} ${lineLabel} captured`;
};

const hideSteamGuardPrompt = () => {
  if (!steamGuardPrompt) {
    return;
  }

  steamGuardPrompt.hidden = true;

  if (steamGuardPromptInput) {
    steamGuardPromptInput.value = "";
  }

  syncControls();
};

const showSteamGuardPrompt = (detail) => {
  if (!steamGuardPrompt) {
    return;
  }

  steamGuardPrompt.hidden = false;

  if (steamGuardPromptDetail) {
    steamGuardPromptDetail.textContent = detail;
  }

  if (steamGuardPromptInput) {
    steamGuardPromptInput.focus();
  }

  syncControls();
};

const appendLog = (line) => {
  logsEl.textContent += `${line}\n`;
  logLineCount += 1;
  updateLogCount();
  logsEl.scrollTop = logsEl.scrollHeight;
};

const setStatus = (state, detail) => {
  const variant = statusVariants[state] ?? statusVariants.error;
  statusEl.classList.remove(...statusClassNames);
  statusEl.classList.add(variant.className);
  statusEl.textContent = variant.label;
  statusDetailEl.textContent = detail ?? variant.detail;
  setStreamState(streamByStatus[state] ?? "error");
};

const formatError = (error) => {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const getSettings = () => {
  return {
    clientId: clientId.value.trim(),
    clientSecret: clientSecret.value.trim(),
    spotifyRedirectUri: redirectUri.value.trim(),
    steamUsername: steamUsername.value.trim(),
    steamPassword: steamPassword.value,
    notPlaying: notPlaying.value.trim() || "Monkey",
  };
};

const applySettings = (settings) => {
  clientId.value = settings.clientId ?? "";
  clientSecret.value = settings.clientSecret ?? "";
  redirectUri.value =
    settings.spotifyRedirectUri ?? "http://127.0.0.1:8888/callback";
  steamUsername.value = settings.steamUsername ?? "";
  steamPassword.value = settings.steamPassword ?? "";
  notPlaying.value = settings.notPlaying ?? "Monkey";
};

const persistSettings = async () => {
  const settings = getSettings();
  await invoke("save_settings", { settings });
};

const hasRequiredCredentials = (settings) => {
  return (
    Boolean(settings.clientId) &&
    Boolean(settings.clientSecret) &&
    Boolean(settings.steamUsername) &&
    Boolean(settings.steamPassword)
  );
};

const syncControls = () => {
  if (!invoke || !listen) {
    startButton.disabled = true;
    restartButton.disabled = true;
    stopButton.disabled = true;
    loginButton.disabled = true;
    steamGuardOpenButton.disabled = true;
    if (steamGuardSubmitButton) {
      steamGuardSubmitButton.disabled = true;
    }
    return;
  }

  startButton.disabled = actionInProgress || syncRunning;
  restartButton.disabled = actionInProgress || !syncRunning;
  stopButton.disabled = actionInProgress || !syncRunning;
  loginButton.disabled = actionInProgress || !syncRunning;
  steamGuardOpenButton.disabled = actionInProgress || !syncRunning;

  if (steamGuardSubmitButton) {
    const promptVisible = Boolean(steamGuardPrompt) && !steamGuardPrompt.hidden;
    steamGuardSubmitButton.disabled = actionInProgress || !promptVisible;
  }
};

const runAction = async (operation) => {
  actionInProgress = true;
  syncControls();
  try {
    await operation();
  } finally {
    actionInProgress = false;
    syncControls();
  }
};

const handleLifecycleEvent = (payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  switch (payload.state) {
    case "starting":
      setStatus("starting", payload.message || undefined);
      setSteamStatus("connecting", "Starting Steam login...");
      break;
    case "running":
      syncRunning = true;
      syncControls();
      setStatus("running", payload.message || undefined);
      break;
    case "stopping":
      setStatus("stopping", payload.message || undefined);
      break;
    case "stopped":
    case "idle":
      syncRunning = false;
      hideSteamGuardPrompt();
      syncControls();
      setStatus("idle", payload.message || undefined);
      setSteamStatus("idle", "Sync process is not running.");
      break;
    case "exited": {
      syncRunning = false;
      hideSteamGuardPrompt();
      syncControls();
      const detail =
        payload.message ||
        (typeof payload.exitCode === "number"
          ? `Sync process exited with code ${payload.exitCode}.`
          : undefined);
      setStatus("disconnected", detail);
      setSteamStatus("disconnected", "Sync process exited.");
      break;
    }
    case "error":
      syncRunning = false;
      hideSteamGuardPrompt();
      syncControls();
      setStatus("error", payload.message || undefined);
      setSteamStatus("error", payload.message || undefined);
      break;
    default:
      break;
  }
};

if (credentialsToggleButton) {
  setCredentialsCollapsed(loadCollapsedCredentialsPreference());

  credentialsToggleButton.addEventListener("click", () => {
    const collapsed = !(credentialsFieldsEl?.hidden ?? false);
    setCredentialsCollapsed(collapsed);
    saveCollapsedCredentialsPreference(collapsed);
  });
}

if (invoke && listen) {
  updateLogCount();
  hideSteamGuardPrompt();
  syncControls();
  setStatus("idle");
  setSteamStatus("idle");

  startButton.addEventListener("click", async () => {
    const settings = getSettings();

    if (!hasRequiredCredentials(settings)) {
      setStatus("error", "Missing required credentials.");
      return;
    }

    try {
      await runAction(async () => {
        hideSteamGuardPrompt();
        setStatus("starting", "Launching sync process...");
        await persistSettings();
        await invoke("start_sync", { settings });
        syncRunning = true;
        syncControls();
        setStatus("running", "Sync process is running.");
        appendLog("[ui] Started sync process.");
      });
    } catch (error) {
      appendLog(`[ui] Failed to start: ${error}`);
      setStatus("error", "Failed to start sync process.");
    }
  });

  restartButton.addEventListener("click", async () => {
    const settings = getSettings();

    if (!hasRequiredCredentials(settings)) {
      setStatus("error", "Missing required credentials.");
      return;
    }

    try {
      await runAction(async () => {
        hideSteamGuardPrompt();
        setStatus("starting", "Restarting sync process...");
        await persistSettings();
        await invoke("stop_sync");
        await invoke("start_sync", { settings });
        syncRunning = true;
        syncControls();
        setStatus("running", "Sync process restarted.");
        appendLog("[ui] Restarted sync process.");
      });
    } catch (error) {
      appendLog(`[ui] Failed to restart: ${error}`);
      setStatus("error", "Failed to restart sync process.");
    }
  });

  for (const field of [
    clientId,
    clientSecret,
    redirectUri,
    steamUsername,
    steamPassword,
    notPlaying,
  ]) {
    field.addEventListener("change", () => {
      persistSettings().catch((error) => {
        appendLog(`[ui] Failed to save settings: ${error}`);
      });
    });
  }

  stopButton.addEventListener("click", async () => {
    try {
      await runAction(async () => {
        setStatus("stopping", "Stopping sync process...");
        await invoke("stop_sync");
        syncRunning = false;
        hideSteamGuardPrompt();
        syncControls();
        setStatus("idle", "Sync process stopped.");
        appendLog("[ui] Stopped sync process.");
      });
    } catch (error) {
      appendLog(`[ui] Failed to stop: ${error}`);
      setStatus("error", "Failed to stop sync process.");
    }
  });

  loginButton.addEventListener("click", async () => {
    try {
      await invoke("open_spotify_login");
      appendLog("[ui] Opened Spotify login URL.");
    } catch (error) {
      appendLog(`[ui] Failed to open login URL: ${error}`);
      setStatus("error", "Sync must be running before opening login.");
    }
  });

  steamGuardOpenButton?.addEventListener("click", () => {
    showSteamGuardPrompt("Enter your latest Steam Guard code.");
    setStatus("starting", "Waiting for Steam Guard code...");
    setSteamStatus("guard", "Enter your latest Steam Guard code.");
  });

  clearLogsButton?.addEventListener("click", () => {
    logsEl.textContent = "";
    logLineCount = 0;
    updateLogCount();
  });

  steamGuardSubmitButton?.addEventListener("click", async () => {
    const code = steamGuardPromptInput?.value.trim() ?? "";

    if (!code) {
      setStatus("error", "Steam Guard code is required.");
      return;
    }

    try {
      await runAction(async () => {
        appendLog("[ui] Sending Steam Guard code...");
        await invoke("submit_steam_guard_code", { code });
      });
      appendLog("[ui] Submitted Steam Guard code.");
      hideSteamGuardPrompt();
      setStatus("starting", "Submitted Steam Guard code. Waiting for login...");
      setSteamStatus(
        "connecting",
        "Submitted Steam Guard code. Waiting for login..."
      );
    } catch (error) {
      const message = formatError(error);
      appendLog(`[ui] Failed to submit Steam Guard code: ${message}`);
      setStatus("error", `Failed to submit Steam Guard code: ${message}`);
      setSteamStatus("error", `Failed to submit Steam Guard code: ${message}`);
    }
  });

  steamGuardPromptInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    steamGuardSubmitButton?.click();
  });

  listen("sync-log", (event) => {
    const payload = event.payload;
    const line =
      typeof payload === "string"
        ? payload
        : `[${payload.stream}] ${payload.line}`;
    const steamStatusUpdate = parseSteamUiStatus(line);

    if (steamStatusUpdate) {
      setSteamStatus(steamStatusUpdate.state, steamStatusUpdate.detail);
      return;
    }

    if (line.includes(steamGuardMarker)) {
      const domainMatch = line.match(/domain=([^\s]+)/);
      const retry = /retry=true/.test(line);
      const domain =
        domainMatch?.[1] && domainMatch[1] !== "unknown"
          ? domainMatch[1]
          : null;
      const detail = retry
        ? "Previous code was invalid. Enter a new Steam Guard code."
        : domain
        ? `Enter the Steam Guard code sent to ${domain}.`
        : "Enter the latest Steam Guard code to continue login.";

      showSteamGuardPrompt(detail);
      setStatus("starting", "Steam Guard code required.");
      setSteamStatus("guard", detail);
    } else if (line.includes("Logged into Steam")) {
      hideSteamGuardPrompt();
      setSteamStatus("connected", "Logged into Steam.");
    }

    appendLog(line);
  });

  listen("sync-lifecycle", (event) => {
    handleLifecycleEvent(event.payload);
  });

  invoke("get_sync_status")
    .then((result) => {
      syncRunning = Boolean(result?.running);
      syncControls();
      setStatus(syncRunning ? "running" : "idle");
    })
    .catch((error) => {
      appendLog(`[ui] Failed to load status: ${error}`);
      setStatus("error", "Could not load sync status.");
    });

  invoke("load_settings")
    .then((settings) => {
      if (settings) {
        applySettings(settings);
        appendLog("[ui] Loaded saved settings.");
      }
    })
    .catch((error) => {
      appendLog(`[ui] Failed to load saved settings: ${error}`);
    });
} else {
  appendLog(
    "[ui] Tauri API is unavailable. Run this UI through the Tauri app, not a regular browser."
  );
  setStatus("error", "Tauri API unavailable in this context.");
  setSteamStatus("error", "Tauri API unavailable in this context.");
  setStreamState("error");
  hideSteamGuardPrompt();
  syncControls();
}

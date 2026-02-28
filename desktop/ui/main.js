const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;

const clientId = document.querySelector("#clientId");
const clientSecret = document.querySelector("#clientSecret");
const redirectUri = document.querySelector("#redirectUri");
const steamUsername = document.querySelector("#steamUsername");
const steamPassword = document.querySelector("#steamPassword");
const steamGuardCode = document.querySelector("#steamGuardCode");
const notPlaying = document.querySelector("#notPlaying");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const stopButton = document.querySelector("#stopButton");
const loginButton = document.querySelector("#loginButton");
const clearLogsButton = document.querySelector("#clearLogsButton");
const statusEl = document.querySelector("#status");
const statusDetailEl = document.querySelector("#statusDetail");
const logsEl = document.querySelector("#logs");
const logCountEl = document.querySelector("#logCount");
const streamStateEl = document.querySelector("#streamState");
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

const setStreamState = (state) => {
  if (!streamStateEl) {
    return;
  }

  const variant = streamVariants[state] ?? streamVariants.error;
  streamStateEl.classList.remove(...streamClassNames);
  streamStateEl.classList.add(variant.className);
  streamStateEl.textContent = variant.label;
};

const updateLogCount = () => {
  if (!logCountEl) {
    return;
  }

  const lineLabel = logLineCount === 1 ? "line" : "lines";
  logCountEl.textContent = `${logLineCount} ${lineLabel} captured`;
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

const getSettings = () => {
  return {
    clientId: clientId.value.trim(),
    clientSecret: clientSecret.value.trim(),
    spotifyRedirectUri: redirectUri.value.trim(),
    steamUsername: steamUsername.value.trim(),
    steamPassword: steamPassword.value,
    steamGuardCode: steamGuardCode.value.trim(),
    notPlaying: notPlaying.value.trim() || "Monkey",
  };
};

const applySettings = (settings) => {
  clientId.value = settings.clientId ?? "";
  clientSecret.value = settings.clientSecret ?? "";
  redirectUri.value = settings.spotifyRedirectUri ?? "http://127.0.0.1:8888/callback";
  steamUsername.value = settings.steamUsername ?? "";
  steamPassword.value = settings.steamPassword ?? "";
  steamGuardCode.value = settings.steamGuardCode ?? "";
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
    return;
  }

  startButton.disabled = actionInProgress || syncRunning;
  restartButton.disabled = actionInProgress || !syncRunning;
  stopButton.disabled = actionInProgress || !syncRunning;
  loginButton.disabled = actionInProgress || !syncRunning;
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
      syncControls();
      setStatus("idle", payload.message || undefined);
      break;
    case "exited": {
      syncRunning = false;
      syncControls();
      const detail =
        payload.message ||
        (typeof payload.exitCode === "number"
          ? `Sync process exited with code ${payload.exitCode}.`
          : undefined);
      setStatus("disconnected", detail);
      break;
    }
    case "error":
      syncRunning = false;
      syncControls();
      setStatus("error", payload.message || undefined);
      break;
    default:
      break;
  }
};

if (invoke && listen) {
  updateLogCount();
  syncControls();
  setStatus("idle");

  startButton.addEventListener("click", async () => {
    const settings = getSettings();

    if (!hasRequiredCredentials(settings)) {
      setStatus("error", "Missing required credentials.");
      return;
    }

    try {
      await runAction(async () => {
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
    steamGuardCode,
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

  clearLogsButton?.addEventListener("click", () => {
    logsEl.textContent = "";
    logLineCount = 0;
    updateLogCount();
  });

  listen("sync-log", (event) => {
    const payload = event.payload;
    if (typeof payload === "string") {
      appendLog(payload);
      return;
    }

    appendLog(`[${payload.stream}] ${payload.line}`);
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
    "[ui] Tauri API is unavailable. Run this UI through the Tauri app, not a regular browser.",
  );
  setStatus("error", "Tauri API unavailable in this context.");
  setStreamState("error");
  syncControls();
}

const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;

const clientId = document.querySelector("#clientId");
const clientSecret = document.querySelector("#clientSecret");
const steamUsername = document.querySelector("#steamUsername");
const steamPassword = document.querySelector("#steamPassword");
const notPlaying = document.querySelector("#notPlaying");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const stopButton = document.querySelector("#stopButton");
const loginButton = document.querySelector("#loginButton");
const statusEl = document.querySelector("#status");
const statusDetailEl = document.querySelector("#statusDetail");
const logsEl = document.querySelector("#logs");
let syncRunning = false;
let actionInProgress = false;

const statusClassNames = [
  "status-idle",
  "status-running",
  "status-starting",
  "status-stopping",
  "status-disconnected",
  "status-error",
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

const appendLog = (line) => {
  logsEl.textContent += `${line}\n`;
  logsEl.scrollTop = logsEl.scrollHeight;
};

const setStatus = (state, detail) => {
  const variant = statusVariants[state] ?? statusVariants.error;
  statusEl.classList.remove(...statusClassNames);
  statusEl.classList.add(variant.className);
  statusEl.textContent = variant.label;
  statusDetailEl.textContent = detail ?? variant.detail;
};

const getSettings = () => {
  return {
    clientId: clientId.value.trim(),
    clientSecret: clientSecret.value.trim(),
    steamUsername: steamUsername.value.trim(),
    steamPassword: steamPassword.value,
    notPlaying: notPlaying.value.trim() || "Monkey",
  };
};

const applySettings = (settings) => {
  clientId.value = settings.clientId ?? "";
  clientSecret.value = settings.clientSecret ?? "";
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
  syncControls();
}

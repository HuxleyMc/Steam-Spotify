const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;

const clientId = document.querySelector("#clientId");
const clientSecret = document.querySelector("#clientSecret");
const steamUsername = document.querySelector("#steamUsername");
const steamPassword = document.querySelector("#steamPassword");
const notPlaying = document.querySelector("#notPlaying");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const loginButton = document.querySelector("#loginButton");
const statusEl = document.querySelector("#status");
const logsEl = document.querySelector("#logs");

if (!invoke || !listen) {
  statusEl.textContent = "Status: tauri api unavailable";
  logsEl.textContent =
    "[ui] Tauri API is unavailable. Run this UI through the Tauri app, not a regular browser.\n";
}

const setStatus = (message) => {
  statusEl.textContent = `Status: ${message}`;
};

const appendLog = (line) => {
  logsEl.textContent += `${line}\n`;
  logsEl.scrollTop = logsEl.scrollHeight;
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

const setRunningUi = (running) => {
  startButton.disabled = running;
  stopButton.disabled = !running;
  setStatus(running ? "running" : "idle");
};

const syncStatus = async () => {
  const result = await invoke("get_sync_status");
  setRunningUi(result.running);
};

if (invoke && listen) {
  startButton.addEventListener("click", async () => {
    const settings = getSettings();

    if (
      !settings.clientId ||
      !settings.clientSecret ||
      !settings.steamUsername ||
      !settings.steamPassword
    ) {
      setStatus("missing required credentials");
      return;
    }

    try {
      await persistSettings();
      await invoke("start_sync", { settings });
      appendLog("[ui] Started sync process.");
      setRunningUi(true);
    } catch (error) {
      appendLog(`[ui] Failed to start: ${error}`);
      setStatus("failed to start");
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
      await invoke("stop_sync");
      appendLog("[ui] Stopped sync process.");
      setRunningUi(false);
    } catch (error) {
      appendLog(`[ui] Failed to stop: ${error}`);
    }
  });

  loginButton.addEventListener("click", async () => {
    try {
      await invoke("open_spotify_login");
      appendLog("[ui] Opened Spotify login URL.");
    } catch (error) {
      appendLog(`[ui] Failed to open login URL: ${error}`);
      setStatus("start sync first");
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

  syncStatus().catch((error) => {
    appendLog(`[ui] Failed to load status: ${error}`);
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
}

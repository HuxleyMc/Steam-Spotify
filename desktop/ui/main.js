import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

const setRunningUi = (running) => {
  startButton.disabled = running;
  stopButton.disabled = !running;
  setStatus(running ? "running" : "idle");
};

const syncStatus = async () => {
  const result = await invoke("get_sync_status");
  setRunningUi(result.running);
};

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
    await invoke("start_sync", { settings });
    appendLog("[ui] Started sync process.");
    setRunningUi(true);
  } catch (error) {
    appendLog(`[ui] Failed to start: ${error}`);
    setStatus("failed to start");
  }
});

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

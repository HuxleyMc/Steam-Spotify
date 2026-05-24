import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(
  scriptDir,
  "../src-tauri/target/release/bundle/macos/Steam Spotify.app"
);

if (!existsSync(appPath)) {
  console.warn(`Skipping app signing because ${appPath} does not exist.`);
  process.exit(0);
}

const sign = spawnSync(
  "codesign",
  ["--force", "--deep", "--sign", "-", appPath],
  {
    stdio: "inherit",
  }
);

if (sign.status !== 0) {
  process.exit(sign.status ?? 1);
}

const verify = spawnSync("codesign", ["--verify", "--verbose=4", appPath], {
  stdio: "inherit",
});

process.exit(verify.status ?? 1);

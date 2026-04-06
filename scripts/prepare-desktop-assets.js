const { existsSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const rootDir = join(__dirname, "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (process.platform === "darwin") {
  const scriptPath = join(rootDir, "scripts", "build-mac-overlay.sh");
  if (!existsSync(scriptPath)) {
    console.error("Missing mac overlay build script:", scriptPath);
    process.exit(1);
  }

  run(scriptPath, []);
}

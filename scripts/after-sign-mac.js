const { spawnSync } = require("child_process");
const { join } = require("path");

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`Ad-hoc signing failed for ${appPath}`);
  }
};

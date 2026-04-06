#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/native-overlay/JarvisOverlay.swift"
DIST_DIR="$ROOT_DIR/native-overlay/dist"
APP_DIR="$ROOT_DIR/native-overlay/dist/JarvisOverlay.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
EXECUTABLE_PATH="$MACOS_DIR/JarvisOverlay"
PLAIN_EXECUTABLE_PATH="$DIST_DIR/JarvisOverlay"
PLIST_PATH="$CONTENTS_DIR/Info.plist"
MODULE_CACHE_DIR="$ROOT_DIR/.swift-module-cache"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping mac overlay build on non-macOS host."
  exit 0
fi

mkdir -p "$DIST_DIR" "$MACOS_DIR" "$RESOURCES_DIR" "$MODULE_CACHE_DIR"

export CLANG_MODULE_CACHE_PATH="$MODULE_CACHE_DIR"
export SWIFT_MODULE_CACHE_PATH="$MODULE_CACHE_DIR"
xcrun swiftc \
  -O \
  -sdk "$SDK_PATH" \
  -target arm64-apple-macos13.0 \
  -parse-as-library \
  -module-cache-path "$MODULE_CACHE_DIR" \
  -framework AppKit \
  "$SOURCE_FILE" \
  -o "$PLAIN_EXECUTABLE_PATH"

cp "$PLAIN_EXECUTABLE_PATH" "$EXECUTABLE_PATH"

chmod +x "$PLAIN_EXECUTABLE_PATH"
chmod +x "$EXECUTABLE_PATH"
cp "$ROOT_DIR/build/icon.icns" "$RESOURCES_DIR/icon.icns"

cat > "$PLIST_PATH" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>Jarvis Overlay</string>
    <key>CFBundleExecutable</key>
    <string>JarvisOverlay</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.jarvis.desktop.overlay</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Jarvis Overlay</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>0.1.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
  </dict>
</plist>
PLIST

echo "Built native overlay at $APP_DIR"
echo "Built plain overlay executable at $PLAIN_EXECUTABLE_PATH"

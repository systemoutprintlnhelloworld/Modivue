#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_BUNDLE="$PROJECT_ROOT/dist/Modivue.app"
DMG_PATH="$PROJECT_ROOT/dist/Modivue-macos-arm64.dmg"
STAGING_DIRECTORY="$(mktemp -d "$PROJECT_ROOT/dist/.dmg.XXXXXX")"
trap 'rm -rf "$STAGING_DIRECTORY"' EXIT

for name in MACOS_SIGN_IDENTITY APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD; do
  if [ -z "${!name:-}" ]; then echo "Missing required release secret: $name" >&2; exit 1; fi
done
if [ ! -d "$APP_BUNDLE" ]; then echo "Build dist/Modivue.app before packaging" >&2; exit 1; fi

rm -f "$DMG_PATH"
ditto "$APP_BUNDLE" "$STAGING_DIRECTORY/Modivue.app"
ln -s /Applications "$STAGING_DIRECTORY/Applications"
hdiutil create -volname Modivue -srcfolder "$STAGING_DIRECTORY" -ov -format UDZO "$DMG_PATH"
codesign --force --timestamp --sign "$MACOS_SIGN_IDENTITY" "$DMG_PATH"
xcrun notarytool submit "$DMG_PATH" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG_PATH"
echo "$DMG_PATH"

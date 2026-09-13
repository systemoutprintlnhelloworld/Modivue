#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$PROJECT_ROOT/dist"
BUILD_DIRECTORY="$(mktemp -d "$PROJECT_ROOT/dist/.build.XXXXXX")"
APP_BUNDLE="$BUILD_DIRECTORY/Modivue.app"
CONTENTS="$APP_BUNDLE/Contents"
RESOURCES="$CONTENTS/Resources"
APP_RESOURCES="$RESOURCES/app"
NODE_EXECUTABLE="$(command -v node)"
NODE_EXECUTABLE="$(realpath "$NODE_EXECUTABLE")"
NODE_LIBRARY_DIRECTORY="$(dirname "$NODE_EXECUTABLE")/../lib"

if [ -d "$APP_BUNDLE" ]; then chmod -R u+w "$APP_BUNDLE"; fi
mkdir -p "$CONTENTS/MacOS" "$RESOURCES/runtime" "$RESOURCES/lib" "$APP_RESOURCES/src/core" "$APP_RESOURCES/cli" "$APP_RESOURCES/node_modules"
swiftc -parse-as-library -O -framework AppKit -framework WebKit "$PROJECT_ROOT/desktop/ModivueApp.swift" -o "$CONTENTS/MacOS/Modivue"
swiftc -O -framework CoreGraphics -framework ImageIO -framework UniformTypeIdentifiers "$PROJECT_ROOT/scripts/make-macos-icon.swift" -o "$PROJECT_ROOT/dist/.modivue-icon-builder"
"$PROJECT_ROOT/dist/.modivue-icon-builder" "$RESOURCES/Modivue.icns"
chmod u+w "$PROJECT_ROOT/dist/.modivue-icon-builder"
cp "$PROJECT_ROOT/desktop/Info.plist" "$CONTENTS/Info.plist"
cp "$NODE_EXECUTABLE" "$RESOURCES/runtime/node"
chmod u+w "$RESOURCES/runtime/node"
for node_library in "$NODE_LIBRARY_DIRECTORY"/libnode.*.dylib; do
  [ -e "$node_library" ] || continue
  cp -L "$node_library" "$RESOURCES/lib/"
done

# Homebrew's Node launcher links optional libraries by absolute path. Bundle
# that dependency closure and rewrite it so the app can run without Homebrew.
added_dependency=1
while [ "$added_dependency" -eq 1 ]; do
  added_dependency=0
  for binary in "$RESOURCES/runtime/node" "$RESOURCES/lib/"*.dylib; do
    [ -f "$binary" ] || continue
    while IFS= read -r dependency; do
      case "$dependency" in
        /opt/homebrew/*)
          target="$RESOURCES/lib/$(basename "$dependency")"
          if [ ! -f "$target" ]; then
            cp -L "$dependency" "$target"
            chmod u+w "$target"
            added_dependency=1
          fi
          ;;
        @rpath/*|@loader_path/*)
          name="$(basename "$dependency")"
          target="$RESOURCES/lib/$name"
          if [ ! -f "$target" ]; then
            source="$(find -L /opt/homebrew/opt -path "*/lib/$name" -print -quit 2>/dev/null || true)"
            if [ -n "$source" ]; then
              cp -L "$source" "$target"
              chmod u+w "$target"
              added_dependency=1
            fi
          fi
          ;;
      esac
    done < <(otool -L "$binary" | tail -n +2 | awk '{print $1}')
  done
done

for binary in "$RESOURCES/runtime/node" "$RESOURCES/lib/"*.dylib; do
  [ -f "$binary" ] || continue
  chmod u+w "$binary"
  if [ "$binary" != "$RESOURCES/runtime/node" ]; then
    install_name_tool -id "@loader_path/$(basename "$binary")" "$binary"
  fi
  while IFS= read -r dependency; do
    case "$dependency" in
      /opt/homebrew/*)
        name="$(basename "$dependency")"
        if [ "$binary" = "$RESOURCES/runtime/node" ]; then replacement="@loader_path/../lib/$name"; else replacement="@loader_path/$name"; fi
        install_name_tool -change "$dependency" "$replacement" "$binary"
        ;;
      @rpath/*|@loader_path/*)
        name="$(basename "$dependency")"
        if [ -f "$RESOURCES/lib/$name" ]; then
          if [ "$binary" = "$RESOURCES/runtime/node" ]; then replacement="@loader_path/../lib/$name"; else replacement="@loader_path/$name"; fi
          if [ "$dependency" != "$replacement" ]; then install_name_tool -change "$dependency" "$replacement" "$binary"; fi
        fi
        ;;
    esac
  done < <(otool -L "$binary" | tail -n +2 | awk '{print $1}')
done

cp "$PROJECT_ROOT/server.mjs" "$PROJECT_ROOT/app.js" "$PROJECT_ROOT/index.html" "$PROJECT_ROOT/styles.css" "$PROJECT_ROOT/package.json" "$APP_RESOURCES/"
cp "$PROJECT_ROOT/src/core/"* "$APP_RESOURCES/src/core/"
mkdir -p "$APP_RESOURCES/src/data"
cp -R "$PROJECT_ROOT/src/data/"* "$APP_RESOURCES/src/data/"
cp "$PROJECT_ROOT/cli/"*.mjs "$APP_RESOURCES/cli/"
cp -R "$PROJECT_ROOT/node_modules/eventsource-parser" "$APP_RESOURCES/node_modules/"
cp -R "$PROJECT_ROOT/node_modules/smol-toml" "$APP_RESOURCES/node_modules/"
cp -R "$PROJECT_ROOT/node_modules/yaml" "$APP_RESOURCES/node_modules/"
cp -R "$PROJECT_ROOT/node_modules/json5" "$APP_RESOURCES/node_modules/"
chmod +x "$CONTENTS/MacOS/Modivue" "$RESOURCES/runtime/node"
if command -v codesign >/dev/null 2>&1; then
  for dylib in "$RESOURCES/lib/"*.dylib; do [ ! -f "$dylib" ] || codesign --force --sign - "$dylib"; done
  codesign --force --sign - "$RESOURCES/runtime/node"
  codesign --force --deep --sign - "$APP_BUNDLE"
fi
touch "$APP_BUNDLE"
# Build new binaries separately from any copy currently mapped by a running app.
if [ -d "$PROJECT_ROOT/dist/Modivue.app" ]; then
  mv "$PROJECT_ROOT/dist/Modivue.app" "$BUILD_DIRECTORY/previous.app"
fi
mv "$APP_BUNDLE" "$PROJECT_ROOT/dist/Modivue.app"
echo "$PROJECT_ROOT/dist/Modivue.app"

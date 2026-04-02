#!/bin/bash
# Archive current version of a mockup folder
# Usage: ./scripts/archive-mockup.sh 2026-04-02-app-clock "Optional description"

set -e

MOCKUP_DIR="$1"
MESSAGE="${2:-"Archived version"}"

if [ -z "$MOCKUP_DIR" ]; then
  echo "Usage: $0 <mockup-folder> [description]"
  echo "Example: $0 2026-04-02-app-clock 'Initial version before button redesign'"
  exit 1
fi

# Must run from mockup root
if [ ! -d "$MOCKUP_DIR" ]; then
  echo "Error: Folder '$MOCKUP_DIR' not found. Run from mockup/ directory."
  exit 1
fi

# Get short commit hash
HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "$(date +%s)")
DATE=$(date +%Y-%m-%d)
ARCHIVE_DIR="$MOCKUP_DIR/archive/$HASH"
MANIFEST="$MOCKUP_DIR/archive/manifest.json"

# Check if already archived this commit
if [ -d "$ARCHIVE_DIR" ]; then
  echo "Warning: Archive for commit $HASH already exists. Skipping."
  exit 0
fi

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Copy all files except archive/ and shared references
echo "Archiving $MOCKUP_DIR → archive/$HASH ..."
find "$MOCKUP_DIR" -maxdepth 1 -type f -name "*.html" -exec cp {} "$ARCHIVE_DIR/" \;

# Copy styles if exists
if [ -d "$MOCKUP_DIR/styles" ]; then
  cp -r "$MOCKUP_DIR/styles" "$ARCHIVE_DIR/styles"
fi

# Copy scripts if exists
if [ -d "$MOCKUP_DIR/scripts" ]; then
  cp -r "$MOCKUP_DIR/scripts" "$ARCHIVE_DIR/scripts"
fi

# Fix shared references in archived files (../shared → ../../shared)
find "$ARCHIVE_DIR" -name "*.html" -exec sed -i '' 's|"\.\./shared/|"../../shared/|g' {} \;

# Update manifest.json
if [ -f "$MANIFEST" ]; then
  # Append to existing manifest
  TMP=$(mktemp)
  python3 -c "
import json, sys
with open('$MANIFEST') as f:
    data = json.load(f)
data.append({'hash': '$HASH', 'date': '$DATE', 'message': '''$MESSAGE'''})
with open('$TMP', 'w') as f:
    json.dump(data, f, indent=2)
"
  mv "$TMP" "$MANIFEST"
else
  # Create new manifest
  mkdir -p "$MOCKUP_DIR/archive"
  python3 -c "
import json
data = [{'hash': '$HASH', 'date': '$DATE', 'message': '''$MESSAGE'''}]
with open('$MANIFEST', 'w') as f:
    json.dump(data, f, indent=2)
"
fi

# Write current version info
CURRENT_JSON="$MOCKUP_DIR/archive/current.json"
python3 -c "
import json
data = {'hash': '$HASH', 'date': '$DATE'}
with open('$CURRENT_JSON', 'w') as f:
    json.dump(data, f, indent=2)
"

echo "✓ Archived to $ARCHIVE_DIR"
echo "✓ Manifest updated: $(cat "$MANIFEST" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))') versions"
echo ""
echo "Files archived:"
find "$ARCHIVE_DIR" -type f | sed 's/^/  /'

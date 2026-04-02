#!/bin/bash
# Publish mockup: archive current → squash merge work branch → push
# Usage: ./scripts/publish-mockup.sh 2026-04-02-app-clock "Button color change"
#
# Workflow:
#   1. You work on a branch (e.g., mockup/clock-buttons)
#   2. When ready to share, run this script from main
#   3. It archives current main, squash merges your branch, pushes
#
# Prerequisites:
#   - You're on main branch
#   - Work branch exists with your changes
#   - All changes committed on work branch

set -e

MOCKUP_DIR="$1"
MESSAGE="$2"
WORK_BRANCH="$3"

if [ -z "$MOCKUP_DIR" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: $0 <mockup-folder> <description> [work-branch]"
  echo ""
  echo "Examples:"
  echo "  $0 2026-04-02-app-clock 'Button color change' mockup/clock-buttons"
  echo "  $0 2026-04-02-app-clock 'Button color change'  # auto-detects branch"
  echo ""
  echo "Steps this script performs:"
  echo "  1. Verify you're on main"
  echo "  2. Archive current version"
  echo "  3. Squash merge work branch into main"
  echo "  4. Push to origin"
  exit 1
fi

# Verify on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: Must be on main branch (currently on '$CURRENT_BRANCH')"
  echo "Run: git checkout main"
  exit 1
fi

# Auto-detect work branch if not specified
if [ -z "$WORK_BRANCH" ]; then
  # Find branches with mockup/ prefix
  BRANCHES=$(git branch --list 'mockup/*' | tr -d ' *')
  BRANCH_COUNT=$(echo "$BRANCHES" | grep -c . || true)

  if [ "$BRANCH_COUNT" -eq 0 ]; then
    echo "Error: No mockup/* branches found. Specify branch name."
    exit 1
  elif [ "$BRANCH_COUNT" -eq 1 ]; then
    WORK_BRANCH="$BRANCHES"
    echo "Auto-detected work branch: $WORK_BRANCH"
  else
    echo "Multiple mockup branches found:"
    echo "$BRANCHES" | sed 's/^/  /'
    echo ""
    echo "Specify which one: $0 $MOCKUP_DIR '$MESSAGE' <branch-name>"
    exit 1
  fi
fi

# Verify work branch exists
if ! git rev-parse --verify "$WORK_BRANCH" >/dev/null 2>&1; then
  echo "Error: Branch '$WORK_BRANCH' not found"
  exit 1
fi

echo "═══════════════════════════════════════"
echo "  Publishing: $MOCKUP_DIR"
echo "  Message:    $MESSAGE"
echo "  Branch:     $WORK_BRANCH → main"
echo "═══════════════════════════════════════"
echo ""

# Step 1: Archive current version
echo "Step 1/4: Archiving current version..."
./scripts/archive-mockup.sh "$MOCKUP_DIR" "$MESSAGE"
git add -A
git commit -m "archive: $MOCKUP_DIR — $MESSAGE"
echo ""

# Step 2: Squash merge work branch
echo "Step 2/4: Squash merging $WORK_BRANCH..."
git merge --squash "$WORK_BRANCH"
git commit -m "$MESSAGE

mockup: $MOCKUP_DIR
branch: $WORK_BRANCH (squash merged)"
echo ""

# Step 3: Push
echo "Step 3/4: Pushing to origin..."
git push
echo ""

# Step 4: Cleanup work branch
echo "Step 4/4: Cleaning up..."
git branch -d "$WORK_BRANCH"
echo ""

echo "═══════════════════════════════════════"
echo "  ✓ Published successfully!"
echo "  ✓ Archive: $(cat "$MOCKUP_DIR/archive/manifest.json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[-1]["hash"])')"
echo "  ✓ Branch $WORK_BRANCH deleted"
echo "═══════════════════════════════════════"

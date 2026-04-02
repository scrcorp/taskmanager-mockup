# Mockup — Conventions

## Folder Naming

```
{YYYY-MM-DD}-{target}-{feature}/
```

- **Date**: mockup created date
- **Target**: `app` (Flutter staff app) or `admin` (Next.js admin console)
- **Feature**: short feature name in kebab-case

Examples:
```
2026-04-02-app-clock/
2026-04-02-admin-attendance/
2026-04-15-app-inventory/
```

## Folder Structure

```
{date}-{target}-{feature}/
├── styles/
│   └── main.css           <- Design tokens + all styles (single file)
├── index.html              <- Main page (entry point)
├── {sub-page}.html         <- Additional pages
├── archive/                <- Version archive (auto-generated)
│   ├── {commit-hash}/      <- Archived HTML + styles
│   └── manifest.json       <- Version metadata
└── scripts/                <- JS if needed (optional)
```

## Design Tokens

### App (Flutter staff app)
Copy from `app-schedule/styles/main.css` or any `app-*` mockup.
- Primary: `#3B8DD9`
- Background: `#F5EDF0`
- Frame: 390x844px mobile simulator
- Bottom nav: 4 tabs (Home, Tasks, Clock, Schedule) — 82px height
- Font: DM Sans

### Admin (Next.js admin console)
Copy from `admin-inventory/styles/main.css` or any `admin-*` mockup.
- Accent: `#6C5CE7`
- Background: `#F5F6FA`
- Layout: Sidebar (240px) + Main content
- Font: DM Sans / Pretendard

## Rules

1. **Single CSS file** per mockup (`styles/main.css`). No external CDN dependencies (except shared/).
2. **Static HTML only**. No build tools, no frameworks. JS only for interactivity.
3. **Demo state switcher** for multi-state screens (e.g., clock in/out states). Place outside the app frame.
4. **Cross-link pages** within the same mockup folder. Use relative paths. Same-tab navigation within mockup.
5. **Match existing UI** — reuse design tokens, component patterns, and bottom nav from existing app/admin.
6. **No real data** — use realistic fake names, times, amounts.

## Shared Modules (`shared/`)

All mockup pages include these via `<script>` / `<link>` tags:

### `shared/feedback.js` + `shared/feedback.css`
Client feedback system. Included in every mockup page.
- **Memo**: text + screenshots (Attach file / Ctrl+V paste)
- **Image editor**: pen, arrow, rect, circle, eraser tools. Undo/Redo. Zoom+Pan.
- **Capture**: drag to select screen region → capture that area
- **Save**: updates thumbnail in-place (pending + memo both)
- **Copy to pending**: hover on memo image → copy icon button
- **PDF export**: all memos grouped by page
- **Draggable button**: feedback icon draggable to any position, saved in localStorage
- **Panel state**: open/closed + tab selection persisted across page navigation
- **Korean IME**: Shift+Enter respects `isComposing`
- **localStorage keys**: `fb_{mockup-folder}` for memos, `fb_panel_open`, `fb_tab`, `fb_trigger_pos`

### `shared/history.js`
Version history dropdown. Auto-added to guide bar when `archive/manifest.json` exists.
- Shows archived versions with commit hash + date + description
- Links to archived HTML files
- "Archive" badge + "← Latest" link when viewing old version

## Guide Bar

Every mockup page has a fixed top bar (dark background, outside the mockup frame):
- **Page navigation**: current page highlighted, other pages as links (same-tab)
- **State switcher** (app mockups): buttons to toggle between UI states
- **Interaction hints**: "Try: ..." text describing what to click
- **History dropdown**: auto-appears when archives exist

## Version Archive

Archive the current version before making changes:

```bash
cd mockup/
./scripts/archive-mockup.sh {folder} "description"
# Example:
./scripts/archive-mockup.sh 2026-04-02-app-clock "Before button redesign"
```

What it does:
1. Copies HTML + styles to `{folder}/archive/{short-commit-hash}/`
2. Fixes `../shared/` paths to `../../shared/` in archived files
3. Updates `archive/manifest.json` with hash, date, description
4. `shared/history.js` auto-detects manifest and shows History dropdown

## Hub Page (`index.html`)

Root `index.html` is the mockup directory. Features:
- Grouped by date
- Card per mockup: title, description, open button (new tab)
- "Individual pages" toggle: expand to see sub-pages with descriptions + open buttons
- All text selectable (for browser translation)
- Links open in new tab; mockup internal navigation is same-tab

## Workflow

### 새 목업 만들기
1. Create mockup in `mockup/{date}-{target}-{feature}/`
2. Add shared modules: `<link>` feedback.css + `<script>` feedback.js + history.js (before `</body>`)
3. Add guide bar at top of each page
4. Review locally (`open index.html`)
5. Push to main → GitHub Pages auto-deploys
6. Share hub URL with client

### 피드백 반영 (수정 사이클)
```bash
# 1. 작업 브랜치 생성
git checkout -b mockup/clock-buttons

# 2. 수정 작업 (여러 커밋 OK)
# ... 수정 ...
git commit -m "WIP: button color"
# ... 또 수정 ...
git commit -m "WIP: layout fix"

# 3. 퍼블리시 (아카이브 + squash merge + push)
git checkout main
./scripts/publish-mockup.sh 2026-04-02-app-clock "Button color change" mockup/clock-buttons
```

`publish-mockup.sh`가 하는 일:
1. 현재 main 상태를 `archive/{hash}/`에 저장
2. 작업 브랜치를 main에 squash merge (커밋 1개로)
3. Push
4. 작업 브랜치 삭제

### 간단 수정 (브랜치 없이)
```bash
# 브랜치 없이 직접 수정할 때는 수동 아카이브
./scripts/archive-mockup.sh 2026-04-02-app-clock "Before quick fix"
# ... 수정 ...
git add -A && git commit -m "fix: something"
git push
```

## Git

- Only date-prefixed folders (`YYYY-MM-DD-*`) are tracked
- Legacy folders (no date prefix) are gitignored
- Zip files are gitignored
- `shared/` is tracked (feedback + history modules)
- `scripts/` is tracked (archive script)

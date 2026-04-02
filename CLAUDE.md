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
│   └── main.css        <- Design tokens + all styles (single file)
├── index.html           <- Main page (entry point)
├── {sub-page}.html      <- Additional pages
└── scripts/             <- JS if needed (optional)
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

1. **Single CSS file** per mockup (`styles/main.css`). No external CDN dependencies.
2. **Static HTML only**. No build tools, no frameworks. JS only for interactivity (tabs, modals, state toggle).
3. **Demo state switcher** for multi-state screens (e.g., clock in/out states). Place outside the app frame.
4. **Cross-link pages** within the same mockup folder. Use relative paths.
5. **Match existing UI** — reuse design tokens, component patterns, and bottom nav from existing app/admin.
6. **No real data** — use realistic fake names, times, amounts.

## Workflow

1. Create mockup in `mockup/{date}-{target}-{feature}/`
2. Review with user locally (`open index.html`)
3. Push to repo → GitHub Pages auto-deploys
4. Share URL with client: `https://{user}.github.io/taskmanager-mockups/{date}-{target}-{feature}/`
5. Client approves → proceed to implementation

## Git

- Only date-prefixed folders (`YYYY-MM-DD-*`) are tracked
- Legacy folders (no date prefix) are gitignored
- Zip files are gitignored

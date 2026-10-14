# EULC Screener

Revision: 2026-10-14 (Africa/Cairo). Version 2.2.0.

EULC Screener is an Electron desktop app for screening thesis libraries, searching transcripts, viewing matching pages, and exporting results. Its own local server starts and stops with the desktop app. No separate server or proxy needs to be started. The supplied localhost certificate/key are bundled in `resources/certs/`.

## Start on Windows

1. Extract the entire ZIP into a new, empty, writable folder so files from the older layout are not left alongside it. Do not run from inside the ZIP.
2. Double-click **scripts/loader/Start EULC.cmd**.
3. The CMD calls `scripts/loader/start-eulc.ps1`, which runs `npm install` automatically on each launch inside `app/`, including Electron. If Node.js is missing, install Node.js LTS from https://nodejs.org/ and run the launcher again. Internet is required to install missing packages and to search EULC.

After installation, the loader checks the installed packages and desktop runtime before opening the app. If npm installation fails, it can use existing compatible packages; it repairs a missing Electron binary when possible. After the app closes, enter **R** to restart or press Enter to close the loader. It does not create shortcuts. Opening `app/ui/index.html` directly is not the app launch path: it cannot start the local server or desktop PDF features.

The app listens only on loopback port 18761 and opens `https://localhost:18761`. Keep this port free. The fixed address also keeps the app's browser storage on a stable origin. A second launch focuses the existing window. Close the desktop window to stop the app and its local servers.

## Interface

Two tabs at the top switch the whole workspace between **Search theses** and **Build a library**. Each mode keeps its own parameters and its own result list; switching back restores them. Build mode uses a teal accent so the two are easy to tell apart.

The top row holds **Libraries** and the **Search archive** side by side. The search panel sits below them, then the results. Smaller windows stack the panels. Results and transcript text wrap within their panels; Arabic text uses natural bidirectional layout. Short confirmations appear as notices in the lower-right corner.

Use **Theme** in the header to select System, Light or Dark. System follows the operating-system theme and updates when it changes. **Compact** reduces spacing and control heights. These preferences are kept in localStorage under `EULC_UI_PREFS` and persisted by the desktop state mechanism. Theme controls do not prevent a new profile from restoring its packaged libraries.

The transcript window fits within the viewport and scrolls its page list independently. Its toolbar wraps at narrower widths. Escape closes the window; keyboard focus moves into it on opening and returns to the previous control on closing. Result buttons have accessible names and tooltips.

Request errors appear in a dismissible banner with **Copy details**, which copies the error, stack and latest request diagnostics. The header shows Ready, Searching or Needs attention. An empty-state panel explains how to begin or that a search found no matching pages.

## Use

### Query rows (both modes)

Add rows with **Add term** / **Add query** and remove them with ×. Each row has a **Required** tick:

- A single row is always required and cannot be unticked.
- Adding a second row unticks the first; every new row starts unticked.
- A match needs every required row. With no required row, any one row is enough. Optional rows never exclude anything once a required row exists.

**Publication years** has a **Range / Exact** switch. Exact uses one year as both ends. Switching to Exact keeps the start year, or the end year if the start is empty; switching back fills both ends with that year.

### Search theses

Searches the pages of the library selected in **Libraries**, or of one thesis when a BibID is entered under **Single thesis**. Set the page range and years, then press **Search theses**. Title/content filters narrow the displayed matches. **Collect all transcripts** and **Export all transcripts** work on the visible results.

### Build a library

Queries the EULC catalogue. Each row picks a catalogue field (Title, Anywhere, Author, Supervisor, Subject headings, Table of contents, Publisher, Related work, Dewey number). The app sends one catalogue request per row and combines the BibID sets with the Required rules above, so any number of rows works. Further options map to the EULC advanced search form: **Location** (university), **Word matching** (exact words, inflections, synonyms), **Attachments contain** (full text), **BibID range**, **Sort by**, **Exact matches only**, plus a **Thesis size** page range checked against each catalogue record. Click a result to read its abstract.

Every result has a checkbox. **New library** (or **New library from checked**) creates a library from the checked rows only; **Add to selected** appends them to the selected library. **Always show checked rows** keeps checked rows visible through the filters and carries them into the next catalogue search.

### Libraries and the Search archive

In Search mode, **New library** and **Add to selected** use the visible results. **Import** merges an exported library list; a library with the same name is replaced. Delete asks for confirmation.

The Search archive stores result sets. **Archive results** works in Search mode only. **Open** works from either mode and switches to Search mode.

Open a result to search and collect its page transcripts. JSON, image archives, result archives, and transcript PDF export remain available. Transcript PDFs use Chromium's layout engine for Arabic shaping and bidirectional text. Open in Browser opens a generated PDF preview; the preview is available for 30 minutes while the app remains open. Downloads go into the app's `downloads` folder; Save As can choose another PDF destination.

Library Import accepts exported library JSON. Storage Import accepts saved-result JSON or ZIP files. Use these export/import controls to transfer data between installations.

## Data storage

- `resources/data/initial-state.json`: packaged initial libraries/settings. Applied only when this installation's renderer storage is empty.
- Electron's user-data directory: a live `state.json` stores localStorage settings and library configuration. Each change writes a temporary file and atomically renames it; the file is restored into a fresh renderer profile. Existing renderer settings are never cleared at startup.
- IndexedDB at the local app origin: saved screening results and transcript caches. Writes resolve after transaction commit. These databases are distinct from the localStorage state file.
- `downloads/`: created at runtime for exported files. Neither dependencies nor generated downloads are bundled.

The ZIP contains the configuration found in the uploaded JSON, not saved results stored only in another Electron profile's IndexedDB. Export those results from the old installation if needed, then import them into this one. Removing or moving the application folder does not remove Electron user data.

## Files and architecture

| File/folder | Purpose |
| --- | --- |
| `scripts/loader/Start EULC.cmd` | Main launcher; calls the PowerShell loader |
| `README.md` | Setup, usage and technical documentation |
| `scripts/loader/start-eulc.ps1` | Automatic npm install, runtime checks, app launch and restart prompt |
| `app/package.json`, `app/package-lock.json` | App entry point and pinned dependencies |
| `app/node_modules/` | Dependencies created by the loader; excluded from the ZIP |
| `app/paths.cjs` | Central filesystem paths shared by desktop and server code |
| `app/desktop/` | Electron main process, PDF tools and preload bridge |
| `app/server/` | Local HTTPS server and EULC proxy |
| `app/ui/` | HTML, startup scripts, frontend controllers, core logic, configurations, styles and utilities |
| `icons/` | Application icon |
| `app/tests/` | Server regression tests |
| `resources/certs/` | Supplied localhost HTTPS certificate and matching key |
| `resources/data/` | Initial libraries/settings seed |
| `downloads/` | Exported files; created at the project root at runtime |

The top level contains four folders (`app`, `scripts`, `resources`, `icons`) and this README. Both launcher files are inside `scripts/loader/`; the archive tools are in `scripts/zipper/`. Dependency installation stays inside `app/`. The fixed application origin and the package name remain the same, so reorganizing the code does not change the Electron profile or its saved browser data.

## Requests and dependencies

The server serves only renderer assets, never its Node source or seed data. `/health` identifies the app. `/fetch?url=...` forwards GET, HEAD or POST requests exclusively to `eulc.edu.eg` and `www.eulc.edu.eg`. The desktop injects a separate Electron Chromium networking session for upstream EULC requests. This uses Chromium certificate-chain verification and system proxy handling instead of Node's built-in fetch implementation. The upstream session keeps normal certificate verification; the separate localhost certificate exception is limited to the UI session. The proxy passes form bodies and content types, handles validated redirects, returns upstream binary/text responses, and keeps session cookies in memory for the running app. Standalone server fixture tests can inject a fetch function and otherwise use Node fetch. Requests time out after 45 seconds. Host and Origin checks restrict use to this local app. Renderer searches are paced to eight simultaneous requests instead of launching an unbounded burst.

The desktop session trusts only the exact bundled localhost certificate; other certificates keep normal Chromium verification. No system certificate installation is required. The current certificate is valid through 1 February 2027; replace both certificate/key files together before expiry. Keep the private key private.

An internal, separate loopback server exposes generated PDF previews using random, expiring tokens. No additional installation or manually started service is required.

EULC searches still require access to EULC itself. Its page structure and availability can change independently of the app. Startup, request and uncaught application errors appear in the UI. The optional abandoned AI experiment is absent; no API key is required.

## Development and verification

From the `app/` directory, run `npm ci`, then `npm start`. The desktop menu is visible. Open Developer Tools with **F12**, **Ctrl+Shift+I**, **View > Developer Tools**, or right-click > **Inspect element**. Ctrl+Shift+M toggles the menu. In Developer Tools, open Network before reproducing a failure and select the failed `/fetch` request. Response headers `X-EULC-Error-Source`, `X-EULC-Upstream-Status`, and `X-EULC-Request-Id` distinguish remote HTTP errors from errors generated by the local proxy. Response contains the upstream body or the local network/TLS cause. Console logs include the target URL, status, request ID and response body; `window.eulcLastRequestError` holds the latest HTTP failure. The loader console logs matching request IDs and status codes. A remote 501/503 is passed through; a local connection failure returns 502, and a timeout returns 504. From `app/`, run `npm test` for static asset, private-file, proxy form/binary/cookie, request restriction, redirect and network-failure checks. Tests use local fixtures and do not contact EULC.

The remake passed these server tests and a renderer initialization check. The supplied execution environment blocks Electron's graphical runtime; the Windows PowerShell loader, full desktop window/PDF behavior and live EULC searches require verification on the user's computer.

ZIP entry timestamps, including archives generated by the app, use Cairo wall time.

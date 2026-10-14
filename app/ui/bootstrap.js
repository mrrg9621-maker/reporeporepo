const status = document.getElementById('appStatus');
const errorBox = document.getElementById('appError');
let lastError = null;
const prefKey = 'EULC_UI_PREFS';
function readPreferences() {
  try {
    const raw = JSON.parse(localStorage.getItem(prefKey) || '{}');
    return {theme:['system','light','dark'].includes(raw.theme) ? raw.theme : 'system', density:raw.density === 'compact' ? 'compact' : 'comfortable'};
  } catch { return {theme:'system', density:'comfortable'}; }
}
const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
function applyPreferences() {
  const prefs = readPreferences();
  document.documentElement.dataset.theme = prefs.theme === 'system' ? (systemTheme?.matches ? 'dark' : 'light') : prefs.theme;
  document.documentElement.dataset.density = prefs.density;
  document.getElementById('themeSelect').value = prefs.theme;
  document.getElementById('densityButton').setAttribute('aria-pressed', String(prefs.density === 'compact'));
}
function savePreferences(change) {
  try { localStorage.setItem(prefKey, JSON.stringify({...readPreferences(), ...change})); applyPreferences(); }
  catch (err) { window.reportAppError(err); }
}
applyPreferences(); // Does not write a key: a fresh profile can still import its libraries.
document.getElementById('themeSelect').addEventListener('change', e => savePreferences({theme:e.target.value}));
document.getElementById('densityButton').addEventListener('click', () => savePreferences({density:readPreferences().density === 'compact' ? 'comfortable' : 'compact'}));
systemTheme?.addEventListener('change', () => { if (readPreferences().theme === 'system') applyPreferences(); });
function setStatus(text, state = 'ready') { status.textContent = text; status.dataset.state = state; }
window.reportAppError = err => {
  lastError = err;
  console.error('[EULC application error]', err);
  document.getElementById('appErrorText').textContent = err?.message || String(err);
  errorBox.hidden = false;
  setStatus('Needs attention', 'error');
};
window.addEventListener('unhandledrejection', e => window.reportAppError(e.reason));
window.addEventListener('error', e => window.reportAppError(e.error || e.message));
document.getElementById('dismissErrorBtn').addEventListener('click', () => { errorBox.hidden = true; });
document.getElementById('copyErrorBtn').addEventListener('click', async e => {
  const text = JSON.stringify({message:lastError?.message || String(lastError), stack:lastError?.stack, request:window.eulcLastRequestError}, null, 2);
  const button = e.currentTarget;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy details'; }, 1800);
  } catch { button.textContent = 'Use Console to copy'; }
});
const searchButton = document.getElementById('searchButton');
const results = document.getElementById('screenerResCntr');
const empty = document.getElementById('emptyState');
const workspace = document.querySelector('.workspace');
const searchedModes = new Set();
const emptyText = {
  search: {idle:['No results yet', 'Pick a library in Libraries, or enter a BibID, then search the thesis pages.'],
           none:['No matching pages found', 'Try different terms, mark fewer terms as required, widen the years, or pick another library.']},
  builder:{idle:['No catalogue results yet', 'Add one or more queries, then press Find theses. Check the theses you want and create a library.'],
           none:['No theses found', 'Try other queries or fields, untick Required on some queries, or widen the years.']}
};
searchButton.addEventListener('click', () => { lastError = null; errorBox.hidden = true; searchedModes.add(workspace.dataset.mode); }, true);
function updateSearchState() {
  const busy = searchButton.disabled;
  const mode = workspace.dataset.mode === 'builder' ? 'builder' : 'search';
  if (busy) setStatus('Searching…', 'busy');
  else if (!lastError) setStatus('Ready', 'ready');
  empty.hidden = !results.classList.contains('hidden');
  let [heading, description] = emptyText[mode][searchedModes.has(mode) ? 'none' : 'idle'];
  if (busy) [heading, description] = ['Searching…', 'Results appear as they arrive. Follow the progress bar above.'];
  else if (lastError && searchedModes.has(mode)) [heading, description] = ['The search needs attention', 'Read the error above, or copy its details for debugging.'];
  document.getElementById('emptyHeading').textContent = heading;
  document.getElementById('emptyDescription').textContent = description;
}
new MutationObserver(updateSearchState).observe(searchButton, {attributes:true, attributeFilter:['disabled']});
new MutationObserver(updateSearchState).observe(results, {attributes:true, attributeFilter:['class']});
new MutationObserver(updateSearchState).observe(workspace, {attributes:true, attributeFilter:['data-mode']});
const scraper = document.getElementById('scraperContainer');
let lastFocus, wasOpen = false;
new MutationObserver(() => {
  const open = !scraper.classList.contains('hidden');
  if (open && !wasOpen) { lastFocus = document.activeElement; document.getElementById('scraperSrchInput').focus(); }
  if (!open && wasOpen) lastFocus?.focus();
  wasOpen = open;
}).observe(scraper, {attributes:true, attributeFilter:['class']});
document.addEventListener('keydown', e => {
  if (scraper.classList.contains('hidden')) return;
  if (e.key === 'Escape') { e.preventDefault(); document.getElementById('scraperCloseBtn').click(); }
  if (e.key === 'Tab') {
    const focusable = [...scraper.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(el => el.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
function labelResultControls() {
  for (const [selector,label] of [['.scraper-scrap-btn','Collect page text'],['.scraper-getpg-btn','Map page number']]) {
    for (const el of document.querySelectorAll(selector)) { el.setAttribute('aria-label',label); el.title=label; }
  }
}
const resultObserver = new MutationObserver(labelResultControls);
for (const id of ['screenerResGrp','scraperResGrp']) resultObserver.observe(document.getElementById(id),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
try {
  if (!window.appAPI) throw new Error('Open scripts/loader/Start EULC.cmd to start the app.');
  await import('./index.js');
  applyPreferences(); // Reapply after the desktop state has been restored.
  updateSearchState();
  labelResultControls();
} catch (err) { window.reportAppError(err); }

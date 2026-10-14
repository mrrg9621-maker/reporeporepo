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
let searched = false;
searchButton.addEventListener('click', () => { lastError = null; errorBox.hidden = true; searched = true; }, true);
function updateSearchState() {
  const busy = searchButton.disabled;
  if (busy) setStatus('Searching…', 'busy');
  else if (!lastError) setStatus('Ready', 'ready');
  empty.hidden = !results.classList.contains('hidden');
  if (busy) {
    document.getElementById('emptyHeading').textContent = 'Looking for matching pages…';
    document.getElementById('emptyDescription').textContent = 'Results appear as the search completes. Follow the progress above.';
  } else if (searched && empty.hidden === false) {
    document.getElementById('emptyHeading').textContent = lastError ? 'The search needs attention' : 'No matching pages found';
    document.getElementById('emptyDescription').textContent = lastError ? 'Read the error above, or copy its details for debugging.' : 'Try different words, widen the year range, or select another library.';
  }
}
new MutationObserver(updateSearchState).observe(searchButton, {attributes:true, attributeFilter:['disabled']});
new MutationObserver(updateSearchState).observe(results, {attributes:true, attributeFilter:['class']});
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
  for (const el of document.querySelectorAll('.res-lock-btn')) { const label = el.classList.contains('locked') ? 'Unlock result' : 'Lock result'; el.setAttribute('aria-label',label); el.title=label; }
  for (const [selector,label] of [['.res-remove-btn','Remove result'],['.res-down-imgs-btn','Export thesis images'],['.res-get-desig-btn','Copy folder name'],['.res-search-url','Search transcript'],['.res-browse-url','Browse thesis'],['.scraper-scrap-btn','Collect page text'],['.scraper-getpg-btn','Map page number']]) {
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

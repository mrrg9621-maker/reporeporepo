import { initScreener } from './app/screener-app.js';
import { initScraper, startScraper } from './app/scraper-app.js';

// Never clear an existing profile. Import packaged libraries only into a fresh one.
if (!localStorage.length) {
  const state = await window.appAPI.loadJSON('state.json');
  for (const [key, value] of Object.entries(state || {})) {
    localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
}
const snapshot = () => Object.fromEntries(Array.from({length: localStorage.length}, (_, i) => {
  const key = localStorage.key(i); return [key, localStorage.getItem(key)];
}));
for (const method of ['setItem', 'removeItem', 'clear']) {
  const original = Storage.prototype[method];
  Storage.prototype[method] = function (...args) {
    const result = original.apply(this, args);
    if (this === localStorage) window.appAPI.persistState(snapshot());
    return result;
  };
}
window.addEventListener('beforeunload', () => window.appAPI.persistState(snapshot()));
window.prompt = async (message = '', defaultValue = '') => {
  const dialog = document.createElement('dialog');
  const form = document.createElement('form'); form.method = 'dialog';
  const label = document.createElement('label'); label.textContent = message;
  const input = document.createElement('input'); input.value = defaultValue;
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.type = 'button';
  const submit = document.createElement('button'); submit.textContent = 'Save';
  form.append(label, input, cancel, submit); dialog.append(form); document.body.append(dialog);
  return new Promise(resolve => {
    let value = null;
    form.addEventListener('submit', () => { value = input.value; });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); resolve(value); }, {once:true});
    dialog.showModal(); input.focus(); input.select();
  });
};
initScreener(startScraper);
initScraper();

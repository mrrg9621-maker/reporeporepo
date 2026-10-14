/***********************************************
 *               IMPORTS                       *
 ***********************************************/

import {
    DEFAULT_START_YEAR,
    DEFAULT_END_YEAR,
    DEFAULT_START_PAGE,
    DEFAULT_END_PAGE,
    LIB_STOR_KEY,
    MAX_PREV_PAGES,
    URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES,
    IMPORT_FILE_TYPES,
    QUERY_PLACEHOLDER,
    FOLDER_DESIG_WORDS_LEN,
    PREV_SEARCH_PARAMS,
    PREV_BUILDER_PARAMS,
    MODE_STOR_KEY,
    MIN_YEAR,
    MAX_QUERIES
}
from '../configs/configs.js';
import {
    EULC_FIELDS, EULC_DEFAULT_FIELD,
    EULC_WORD_FORMS,
    EULC_ORDERS, EULC_DEFAULT_ORDER,
    EULC_SCOPES, EULC_DEFAULT_SCOPE
}
from '../configs/eulc-options.js';
import {
    getTimeStamp,
    downloadJSON,
    downloadJSONZIP,
    downloadGIFZIP,
    readJsonFile,
    unZipFilesAsText,
    isInteger,
    copyTextToClipboard,
    Progress,
    URLER,
    removeDupesFromArr,
    downloadFilesZIP,
    sanitizeFileName,
    notify,
    operationSignal,
    stopOperations,
    isStopError,
    getRequestsInFlight
}
from '../utils/utils.js';

import { screenerDB, cacheDB } from '../core/db.js';

import {
    getBibs, getLib, getPrevImgBlobObjs
}
from '../core/screener-core.js';

import {
    scrapBibFully, buildBibTranscriptHTML
}
from './scraper-app.js';


/***********************************************
 *               GLOBALS                       *
 ***********************************************/
const urler = new URLER(URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES);
let searchParams = {};
const summaryMap = new WeakMap();
let scraperCallback = function (){};

/* Batch (Scrap All / Download All) knobs */
const PDF_NAME_MAX_LEN   = 120;       // whole "title [Year][bibID]" stem
const PDF_NAME_TITLE_WORDS = Infinity;  // set to FOLDER_DESIG_WORDS_LEN to mirror the copy-desig button
const SKIP_CACHED_ON_SCRAP_ALL = true;  // a bib already scraped cleanly is not scraped again
let batchBusy = false;
let searchRunning = false;

/* Workspace mode: 'search' screens the pages of known theses,
   'builder' discovers theses in the EULC catalogue. Each mode keeps its
   own parameters and its own result list. */
let mode = localStorage.getItem(MODE_STOR_KEY) === 'builder' ? 'builder' : 'search';
const stashedResults = { search: null, builder: null };

const MODE_TEXT = {
    search: {
        heading: 'Search parameters',
        sub: 'Search the pages of a library, or of one thesis.',
        button: 'Search theses',
        results: 'Matching theses'
    },
    builder: {
        heading: 'Library builder',
        sub: 'Query the EULC catalogue, then check the theses to keep.',
        button: 'Find theses',
        results: 'Catalogue results'
    }
};
/***********************************************
 *               SELECTORS                     *
 ***********************************************/
const workspace = document.querySelector('.workspace');
const modeTabs = document.querySelectorAll('.mode-tab');
const pagesStartInput = document.getElementById('pagesStartInput');
const pagesEndInput = document.getElementById('pagesEndInput');
const bibIDInput = document.getElementById('bibIDInput');
const searchSource = document.getElementById('searchSource');
const librarySele = document.getElementById('librarySele');
const libMeta = document.getElementById('libMeta');
const libHint = document.getElementById('libHint');
const libRenameBtn = document.getElementById('libRenameBtn');
const libAddBtn = document.getElementById('libAddBtn');
const libAppendBtn = document.getElementById('libAppendBtn');
const libDelBtn = document.getElementById('libDelBtn');
const libDownloadBtn = document.getElementById('libDownloadBtn');
const libImportBtn = document.getElementById('libImportBtn');
const importLibInput = document.getElementById('importLibInput');
const loadPrevParamsBtn = document.getElementById('loadPrevParamsBtn');
const titleFiltSpBoxes = document.getElementById('titleFiltSpBoxes');
const contentFiltSpBoxes = document.getElementById('contentFiltSpBoxes');
const searchButton = document.getElementById('searchButton');
const searchButtonLabel = document.getElementById('searchButtonLabel');
const searchHeading = document.getElementById('searchHeading');
const searchSub = document.getElementById('searchSub');
const resultsHeading = document.getElementById('resultsHeading');
const savedResultsSele = document.getElementById('savedResultsSele');
const archiveMeta = document.getElementById('archiveMeta');
const archiveHint = document.getElementById('archiveHint');
const dbSaveButton = document.getElementById('dbSaveButton');
const dbLoadButton = document.getElementById('dbLoadButton');
const dbRenameButton = document.getElementById('dbRenameButton');
const dbDeleteButton = document.getElementById('dbDeleteButton');
const dbDownloadButton = document.getElementById('dbDownloadButton');
const dbDownloadALLButton = document.getElementById('dbDownloadALLButton');
const importButton = document.getElementById('importButton');
const importFileInput = document.getElementById('importFileInput');
const screenerResCntr = document.getElementById('screenerResCntr');
const screenerResGrp = document.getElementById('screenerResGrp');
const progressBar = document.getElementById('progressBar');
const progressStatus = document.getElementById('progressStatus');
const resultItmsNumLog = document.getElementById('resultItmsNumLog');
const visResultItmsNumLog = document.getElementById('visResultItmsNumLog');
const checkedNumLog = document.getElementById('checkedNumLog');
const searchPanel = document.querySelector('.search-panel');

const builderScopeSele = document.getElementById('builderScopeSele');
const builderWordFormsSele = document.getElementById('builderWordFormsSele');
const builderFullTextInput = document.getElementById('builderFullTextInput');
const builderBibRangeInput = document.getElementById('builderBibRangeInput');
const builderPagesMinInput = document.getElementById('builderPagesMinInput');
const builderPagesMaxInput = document.getElementById('builderPagesMaxInput');
const builderOrderSele = document.getElementById('builderOrderSele');
const builderExactChBx = document.getElementById('builderExactChBx');

const checkVisibleBtn = document.getElementById('checkVisibleBtn');
const uncheckAllBtn = document.getElementById('uncheckAllBtn');
const keepCheckedChBx = document.getElementById('keepCheckedChBx');
const barNewLibBtn = document.getElementById('barNewLibBtn');

const scrapAllBtn    = document.getElementById('scrapAllBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const exportJsonBtn  = document.getElementById('exportJsonBtn');
const batchNote      = document.getElementById('batchNote');
const stopButton     = document.getElementById('stopButton');
const scraperStopBtn = document.getElementById('scraperStopBtn');
const collectedIDs   = new Set();

/* Form components, built in initScreener */
let searchQueries, builderQueries, searchYears, builderYears;

/***********************************************
 *               ENTRY POINT                   *
 ***********************************************/

export function initScreener(_scraperCallback) {
	scraperCallback = _scraperCallback;

    pagesStartInput.value = DEFAULT_START_PAGE;
    pagesEndInput.value = DEFAULT_END_PAGE;

    searchQueries = createQueryList(document.getElementById('querySpBoxes'), document.getElementById('queryAddBtn'),
        { placeholder: 'Word or phrase in the thesis pages…', noun: 'term' });
    builderQueries = createQueryList(document.getElementById('builderQueries'), document.getElementById('builderQueryAddBtn'),
        { placeholder: 'Catalogue search text…', noun: 'query', withField: true });
    searchYears = createYearField(document.getElementById('searchYears'), 'search');
    builderYears = createYearField(document.getElementById('builderYears'), 'builder');

    fillSelect(builderScopeSele, EULC_SCOPES, EULC_DEFAULT_SCOPE);
    fillSelect(builderWordFormsSele, EULC_WORD_FORMS, '');
    fillSelect(builderOrderSele, EULC_ORDERS, EULC_DEFAULT_ORDER);

    refreshSavedLibs();
    refreshSavedTitles({titleSlctIndx: 0});

    setSpBox(titleFiltSpBoxes);
    setSpBox(contentFiltSpBoxes);

    // Both forms start from their last-used parameters
    applySearchParams(readPrevParams('search'));
    applyBuilderParams(readPrevParams('builder'));

    for (const tab of modeTabs) {
        tab.addEventListener('click', () => setMode(tab.dataset.mode));
    }
    applyMode();

    // Enter inside the search form runs the search
    searchPanel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])') && !searchButton.disabled) {
            e.preventDefault();
            searchButton.click();
        }
    });

    bibIDInput.addEventListener('input', updateSourceBox);
    librarySele.addEventListener('change', () => { updateLibMeta(); updateSourceBox(); });

    searchButton.addEventListener('click', async() => {
        try {
            searchButton.disabled = true;
            searchRunning = true;
            setModeTabsDisabled(true);
            updateBatchButtons();
            if (mode === 'builder') {
                await runBuilderSearch();
            } else {
                await runThesisSearch();
            }
        }
        catch (err)
        {
            if (isStopError(err)) {
                resultItmsNumLog.innerText = screenerResGrp.children.length || '';
                processFilters();
                progressStatus.textContent = 'Stopped. Results found so far are kept.';
            } else {
                window.reportAppError?.(err);
            }
        }
        finally
        {
            searchButton.disabled = false;
            searchRunning = false;
            setModeTabsDisabled(false);
            updateSelectionUI();
        }
    });

    loadPrevParamsBtn.addEventListener('click', () => {
        const prev = readPrevParams(mode);
        if (!prev) return notify('No previous parameters for this mode yet.');
        mode === 'builder' ? applyBuilderParams(prev) : applySearchParams(prev);
        notify('Previous parameters restored.');
    });

    titleFiltSpBoxes.addEventListener('input',  processFilters);
    contentFiltSpBoxes.addEventListener('input',    processFilters);
    keepCheckedChBx.addEventListener('change', processFilters);

    /* ---------- Builder selection ---------- */

    checkVisibleBtn.addEventListener('click', () => {
        for (const item of getVisibleItems()) setItemChecked(item, true);
        updateSelectionUI();
    });
    uncheckAllBtn.addEventListener('click', () => {
        for (const item of screenerResGrp.querySelectorAll('.result-item.checked')) setItemChecked(item, false);
        processFilters();
    });
    barNewLibBtn.addEventListener('click', createLibraryFromSelection);

    /* ---------- Libraries ---------- */

    libAddBtn.addEventListener('click', createLibraryFromSelection);

    libAppendBtn.addEventListener('click', () => {
        const librariesArr = getLibrariesArray();
        const lib = librariesArr.find(lib => lib.name === librarySele.value);
        if (!lib) return notify('Select a library first.', 'warn');

        const bibIDs = getSelectionBibIDs();
        if (!bibIDs.length) return notify(selectionEmptyMessage(), 'warn');

        const before = lib.bibIDs.length;
        lib.bibIDs = removeDupesFromArr([...lib.bibIDs, ...bibIDs]);
        saveLibrariesArray(librariesArr);
        updateLibMeta();
        updateSourceBox();
        notify(`Added ${lib.bibIDs.length - before} new theses to "${lib.name}".`, 'success');
    });

    libDelBtn.addEventListener('click', () => {
        const name = librarySele.value;
        const librariesArr = getLibrariesArray();
        const index = librariesArr.findIndex(lib => lib.name === name);
        if (index === -1) return notify('Select a library first.', 'warn');
        if (!confirm(`Delete the library "${name}"? This cannot be undone.`)) return;

        librariesArr.splice(index, 1);
        saveLibrariesArray(librariesArr);
        refreshSavedLibs();
        notify(`Deleted "${name}".`);
    });

    libRenameBtn.addEventListener('click', async() => {
        const librariesArr = getLibrariesArray();
        const name = librarySele.value;
        const lib = librariesArr.find(lib => lib.name === name);
        if (!lib) return notify('Select a library first.', 'warn');

        const newName = (await prompt(`Rename "${name}" to:`, name))?.trim();
        if (!newName || newName === name) return;
        if (librariesArr.some(other => other.name === newName)) {
            return notify(`A library named "${newName}" already exists.`, 'warn');
        }

        lib.name = newName;
        saveLibrariesArray(librariesArr);
        refreshSavedLibs(newName);
    });

    libDownloadBtn.addEventListener('click', () => {
        const libraryArr = getLibrariesArray();
        if (!libraryArr.length) return notify('There are no libraries to export.', 'warn');
        const date = getTimeStamp().slice(0, -4);
        downloadJSON(libraryArr, "[EULC_SCREENER]"+"[Libraries]" + " " + date);
    });

    libImportBtn.addEventListener('click', () => importLibInput.click());

    // Imported libraries are merged in; a library with the same name is replaced
    importLibInput.addEventListener('change', async() => {
        const file = importLibInput.files[0];
        importLibInput.value = '';
        if (!file) return;

        const jsonArr = file.type === IMPORT_FILE_TYPES.JSON ? await readJsonFile(file) : null;
        if (!jsonArr || !isValidLibJson(jsonArr)) {
            return notify('That file is not an exported library list.', 'warn');
        }

        const librariesArr = getLibrariesArray();
        for (const imported of jsonArr) {
            const existing = librariesArr.find(lib => lib.name === imported.name);
            if (existing) existing.bibIDs = imported.bibIDs;
            else librariesArr.push({ name: imported.name, bibIDs: imported.bibIDs });
        }
        saveLibrariesArray(librariesArr);
        refreshSavedLibs(jsonArr[0].name);
        notify(`Imported ${jsonArr.length} ${jsonArr.length === 1 ? 'library' : 'libraries'}.`, 'success');
    });

    /* ---------- Search archive ---------- */

    dbSaveButton.addEventListener('click', async() => {
        if (mode !== 'search') return;

        const resultItems = getResultItems();
        if (!resultItems.length) {
            return notify('Run a search first: there are no results to archive.', 'warn');
        }

        const GMT3TimeStamp = getTimeStamp();
        const date = GMT3TimeStamp.slice(0, -4);
        const meta = {
            searchParams,
            title: searchParams.query + ' ' + GMT3TimeStamp,
            date
        };

        await screenerDB.saveResult({
            meta,
            resultItems
        });

        await refreshSavedTitles({titleSlctName: meta.title});
        notify(`Archived ${resultItems.length} results.`, 'success');
    });

    // Opening an archived search always lands in Search mode
    dbLoadButton.addEventListener('click', async() => {
        const selectedTitle = savedResultsSele.value;
        if (!selectedTitle) return notify('Select an archived search first.', 'warn');

        const savedResult = await screenerDB.getSavedResult(selectedTitle);
        if (!savedResult) {
            return notify(`Couldn't find "${selectedTitle}" in the archive.`, 'warn');
        }

        if (searchButton.disabled || batchBusy) {
            return notify('Wait for the current operation to finish first.', 'warn');
        }
        if (mode !== 'search') setMode('search');

        screenerResGrp.replaceChildren();

        searchParams = savedResult.meta.searchParams;
        const resultItems = savedResult.resultItems;
        resultItems.forEach(resultItem => renderResultItem(resultItem));

        resetSpBox(contentFiltSpBoxes, false);
        resetSpBox(titleFiltSpBoxes, false);

        resultItmsNumLog.innerText = visResultItmsNumLog.innerText = resultItems.length;
        updateSelectionUI();
    });

    dbRenameButton.addEventListener('click', async() => {
        const selectedTitle = savedResultsSele.value;
        if (!selectedTitle) return notify('Select an archived search first.', 'warn');

        const savedResult = await screenerDB.getSavedResult(selectedTitle);
        if (!savedResult) {
            return notify(`Couldn't find "${selectedTitle}" in the archive.`, 'warn');
        }

        const allTitles = await screenerDB.getAllSavResTitles();

        const newTitle = (await prompt(`Rename "${selectedTitle}" to:`, selectedTitle))?.trim();
        if (!newTitle || newTitle === selectedTitle) return;
        if (allTitles.some((title) => title === newTitle)) {
            return notify(`An archived search named "${newTitle}" already exists.`, 'warn');
        }

        savedResult.meta.title = newTitle;
        await screenerDB.deleteResult(selectedTitle);
        await screenerDB.saveResult(savedResult);
        refreshSavedTitles({titleSlctName: newTitle});
    });

    dbDeleteButton.addEventListener('click', async() => {
        const selectedTitle = savedResultsSele.value;
        if (!selectedTitle) return notify('Select an archived search first.', 'warn');

        const allTitles = await screenerDB.getAllSavResTitles();
        if (!allTitles.includes(selectedTitle)) {
            return notify(`Couldn't find "${selectedTitle}" in the archive.`, 'warn');
        }

        if (confirm(`Delete the archived search "${selectedTitle}"?`)) {
            await screenerDB.deleteResult(selectedTitle);
            refreshSavedTitles();
        }
    });

    dbDownloadButton.addEventListener('click', async() => {
        const selectedTitle = savedResultsSele.value;
        if (!selectedTitle) return notify('Select an archived search first.', 'warn');

        const savedResult = await screenerDB.getSavedResult(selectedTitle);
        if (!savedResult) {
            return notify(`Couldn't find "${selectedTitle}" in the archive.`, 'warn');
        }

        downloadJSON(savedResult, "[EULC_SCREENER]"+"[DB]" + " " + selectedTitle);
    });

    dbDownloadALLButton.addEventListener('click', async() => {
        const results = await screenerDB.getAllSavedResults();
        if (!results.length) return notify('The archive is empty.', 'warn');
        const dataStreamsArr = results.map(result => ({fileName: result.meta.title , fileContent:result}));
        downloadJSONZIP(dataStreamsArr, "[EULC_SCREENER]"+"[DBs]" + " " + getTimeStamp());
    });

    importButton.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', async() => {

        async function importJsonObj(jsonObj) {
            if (isValidResJson(jsonObj)) {
                const allTitles = await screenerDB.getAllSavResTitles();
                let title = jsonObj.meta.title;

                if (allTitles.includes(title)) {
                    title += ' ' + getTimeStamp();
                }

                jsonObj.meta.title = title;

                await screenerDB.saveResult(jsonObj);
                return title;
            }
        }

        const file = importFileInput.files[0];
        importFileInput.value = '';
        if (!file) return;

        let lastTitle, imported = 0;
        if (file.type === IMPORT_FILE_TYPES.JSON) {
            const jsonObj = await readJsonFile(file);
            if (jsonObj) {
                lastTitle = await importJsonObj(jsonObj);
                if (lastTitle) imported++;
            }
        } else if (file.type === IMPORT_FILE_TYPES.ZIP) {
            const jsonFiles = await unZipFilesAsText(file, 'json');
            for (const jsonFile of jsonFiles) {
                const title = await importJsonObj(JSON.parse(jsonFile.fileContent));
                if (title) { lastTitle = title; imported++; }
            }
        }

        if (!imported) return notify('No archived searches were found in that file.', 'warn');
        refreshSavedTitles({titleSlctName: lastTitle});
        notify(`Imported ${imported} archived ${imported === 1 ? 'search' : 'searches'}.`, 'success');
    });

    /* ---------- Batch transcript actions (Search mode) ---------- */

    // Theses whose transcripts are already collected, so the export buttons
    // reflect stored content rather than whether results are on screen.
    cacheDB.getAllKeys().then(keys => {
        for (const key of keys) collectedIDs.add(String(key));
        updateBatchButtons();
    }).catch(err => console.error('Could not read the transcript store', err));

    /* ---------- Stop ---------- */

    for (const btn of [stopButton, scraperStopBtn]) {
        btn.addEventListener('click', () => {
            stopOperations();
            notify('Stopped.');
        });
    }
    window.addEventListener('eulc-activity', updateStopButtons);

    scrapAllBtn.addEventListener('click', async() => {
        const results = getVisibleResultsMeta();
        if (!results.length) return notify('There are no visible results to collect.', 'warn');

        let collected = 0, skipped = 0;
        const { failed, stopped } = await runBatch('Collecting', results, async(result, report) => {
            if (SKIP_CACHED_ON_SCRAP_ALL && collectedIDs.has(result.bibID)) {
                const cached = await cacheDB.getSavedResult(result.bibID);
                if (cached?.ok) { skipped++; return; }
            }
            report(0, 'finding pages');
            await scrapResultToCache(result, report);
            collected++;
        });

        finishBatch(`Collected ${collected}${skipped ? `, ${skipped} already collected` : ''} of ${results.length} theses`, failed, stopped);
    });

    downloadAllBtn.addEventListener('click', async() => {
        if (typeof window.appAPI?.htmlToPdfBuffer !== 'function') {
            return console.error("window.appAPI.htmlToPdfBuffer is missing: expose the 'html-to-pdf-buffer' channel in preload.js.");
        }
        const results = getExportableResults();
        if (!results) return;

        const files = [];
        const { failed, stopped } = await runBatch('Exporting', results, async(result, report) => {
            const record = await ensureCollected(result, report);
            report(0.95, 'rendering PDF');
            const fileStem = getPdfNameStem(result);
            const res = await window.appAPI.htmlToPdfBuffer(buildBibTranscriptHTML(fileStem, record.pages, record.pagesNumMap));
            if (!res?.ok) throw new Error(res?.error ?? "PDF generation failed");
            files.push({ fileName: `${fileStem}.pdf`, fileContent: new Uint8Array(res.data) });
        });

        if (stopped) return finishBatch('Nothing exported', failed, stopped);
        if (files.length) downloadFilesZIP(files, "[EULC_SCREENER]" + "[PDFs]" + " " + getTimeStamp().slice(0, -4));
        finishBatch(`Exported ${files.length} PDFs`, failed);
    });

    exportJsonBtn.addEventListener('click', async() => {
        const results = getExportableResults();
        if (!results) return;

        const theses = [];
        const { failed, stopped } = await runBatch('Exporting', results, async(result, report) => {
            const record = await ensureCollected(result, report);
            theses.push({
                bibID: result.bibID,
                title: result.title,
                publishYear: result.publishYear,
                totalPages: Number(result.totalPagesNum) || result.totalPagesNum,
                collectedAt: record.date,
                missingPages: record.missingPages ?? [],
                pages: record.pages.map(page => ({ virtualPage: page.virtPageNum, content: page.pageContent }))
            });
        });

        if (stopped) return finishBatch('Nothing exported', failed, stopped);
        if (theses.length) downloadJSON(theses, "[EULC_SCREENER]" + "[Transcripts]" + " " + getTimeStamp().slice(0, -4));
        finishBatch(`Exported ${theses.length} transcripts as JSON`, failed);
    });

}

/* The visible results; exports collect any transcript that is missing. */
function getExportableResults()
{
    const results = getVisibleResultsMeta();
    if (!results.length) {
        notify('There are no visible results to export.', 'warn');
        return null;
    }
    return results;
}

/* A stored transcript, or a freshly collected one when none is stored yet. */
async function ensureCollected(result, report)
{
    if (collectedIDs.has(result.bibID)) {
        const record = await cacheDB.getSavedResult(result.bibID);
        if (record?.ok && record.pages?.length) return record;
        collectedIDs.delete(result.bibID);
    }
    report(0, 'collecting');
    return scrapResultToCache(result, (fraction, detail) => report(fraction * 0.95, detail));
}

function finishBatch(summary, failed, stopped = false)
{
    if (!stopped) progressBar.style.width = '100%';
    progressStatus.textContent = (stopped ? 'Stopped. ' : '') + summary + (failed.length ? ` · failed: ${failed.join(', ')}` : '');
    if (failed.length) notify(`${failed.length} theses failed: ${failed.join(', ')}. See the console (F12) for details.`, 'warn', 8000);
    updateBatchButtons();
}

/* All three need visible results; the exports collect missing transcripts
   themselves, so an uncollected thesis still counts. */
function updateBatchButtons()
{
    const visible = getVisibleItems();
    const collected = visible.filter(item => collectedIDs.has(item.dataset.bibId)).length;
    const busy = batchBusy || searchRunning;
    updateStopButtons();
    scrapAllBtn.disabled = downloadAllBtn.disabled = exportJsonBtn.disabled = busy || !visible.length;
    batchNote.textContent = !visible.length ? ''
        : collected === visible.length ? `All ${visible.length} visible theses collected.`
        : `${collected} of ${visible.length} visible theses collected; exports collect the rest first.`;
}

/* Stop is live while a search or batch runs, or any EULC request is in
   flight (the transcript window included). Disabling waits a moment so a
   chain of back-to-back requests does not make it flicker. */
let stopIdleTimer = null;
function updateStopButtons()
{
    const active = searchRunning || batchBusy || getRequestsInFlight() > 0;
    clearTimeout(stopIdleTimer);
    if (active) {
        stopButton.disabled = scraperStopBtn.disabled = false;
    } else {
        stopIdleTimer = setTimeout(() => { stopButton.disabled = scraperStopBtn.disabled = true; }, 400);
    }
}

/***********************************************
 *               SEARCHES                      *
 ***********************************************/

async function runThesisSearch()
{
    let queries = searchQueries.values();
    if (!queries.length) {
        queries = [{ text: QUERY_PLACEHOLDER, must: true }];
    }

    const bibID = isInteger(bibIDInput.value.trim()) ? bibIDInput.value.trim() : '';
    const pagesStart = pagesStartInput.value;
    const pagesEnd = pagesEndInput.value;
    const years = searchYears.get();
    const yearsStart = years.start || String(MIN_YEAR);
    const yearsEnd = years.end || String(new Date().getFullYear());
    const libraryName = librarySele.value;

    searchParams = {
        query: queries.map(q => q.text).join(', '),
        queries,
        pagesStart,
        pagesEnd,
        yearsStart,
        yearsEnd,
        yearMode: years.mode,
        libraryName,
        bibID,
        libBuilder: false
    };
    localStorage.setItem(PREV_SEARCH_PARAMS, JSON.stringify(searchParams));

    const bibIDs = (bibID && [bibID]) || getLibrariesArray().find(library => library.name === libraryName)?.bibIDs;
    if (!Array.isArray(bibIDs) || !bibIDs.length) {
        throw new Error("Select a library that contains theses, or enter a BibID, before searching.");
    }

    clearResults();

    const progressObj = new Progress(bibIDs.length * queries.length, progressBar, progressStatus);
    const resultsNum = await getBibs(bibIDs, queries, yearsStart, yearsEnd, pagesStart, pagesEnd, progressObj, setResItemForRender);

    resetSpBox(titleFiltSpBoxes, false);
    resetSpBox(contentFiltSpBoxes, false);

    resultItmsNumLog.innerText = visResultItmsNumLog.innerText = resultsNum;
}

async function runBuilderSearch()
{
    const params = readBuilderForm();
    localStorage.setItem(PREV_BUILDER_PARAMS, JSON.stringify(params));

    let queries = params.queries;
    if (!queries.length) {
        // EULC needs some search text; the full-text box alone is enough when given
        queries = [{ text: params.eulc.fullText ? '' : QUERY_PLACEHOLDER, must: true, field: EULC_DEFAULT_FIELD }];
    }

    // Checked rows survive a new search while "Always show checked rows" is on
    const kept = keepCheckedChBx.checked ? [...screenerResGrp.querySelectorAll('.result-item.checked')] : [];
    const keptIDs = new Set(kept.map(item => item.dataset.bibId));
    clearResults();
    screenerResGrp.append(...kept);
    if (kept.length) screenerResCntr.classList.remove('hidden');

    const progressObj = new Progress(1, progressBar, progressStatus);

    const { skipped } = await getLib({ ...params, queries }, progressObj, (record) => {
        if (!keptIDs.has(record.bibID)) setResItemForRender(record);
    });
    if (skipped.length) {
        notify(`EULC did not answer these optional queries, so they were left out: ${skipped.join(', ')}`, 'warn', 9000);
    }

    resetSpBox(titleFiltSpBoxes, false);
    resetSpBox(contentFiltSpBoxes, false);

    resultItmsNumLog.innerText = visResultItmsNumLog.innerText = screenerResGrp.children.length;
    processFilters();
}

function readBuilderForm()
{
    const years = builderYears.get();
    return {
        queries: builderQueries.values(),
        years,
        pages: { min: builderPagesMinInput.value, max: builderPagesMaxInput.value },
        eulc: {
            scope: builderScopeSele.value,
            wordForms: builderWordFormsSele.value,
            fullText: builderFullTextInput.value.trim(),
            bibRange: builderBibRangeInput.value.trim(),
            order: builderOrderSele.value,
            exact: builderExactChBx.checked
        }
    };
}

function clearResults()
{
    screenerResGrp.replaceChildren();
    resultItmsNumLog.innerText = visResultItmsNumLog.innerText = "";
}

/***********************************************
 *               MODES                         *
 ***********************************************/

function setMode(next)
{
    if (next === mode) return;
    if (searchButton.disabled || batchBusy) {
        return notify('Wait for the current operation to finish before switching mode.', 'warn');
    }

    stashedResults[mode] = {
        nodes: [...screenerResGrp.children],
        total: resultItmsNumLog.innerText,
        titleFilters: getSpBoxesValArr(titleFiltSpBoxes),
        contentFilters: getSpBoxesValArr(contentFiltSpBoxes),
        shown: !screenerResCntr.classList.contains('hidden')
    };

    mode = next;
    localStorage.setItem(MODE_STOR_KEY, mode);

    const restored = stashedResults[mode];
    screenerResGrp.replaceChildren(...(restored?.nodes ?? []));
    resultItmsNumLog.innerText = restored?.total ?? '';
    resetSpBox(titleFiltSpBoxes, false);
    resetSpBox(contentFiltSpBoxes, false);
    fillSpBoxBox(titleFiltSpBoxes, restored?.titleFilters ?? []);
    fillSpBoxBox(contentFiltSpBoxes, restored?.contentFilters ?? []);
    screenerResCntr.classList.toggle('hidden', !restored?.shown);

    progressBar.style.width = '0%';
    progressStatus.textContent = '';

    applyMode();
    processFilters();
}

function applyMode()
{
    workspace.dataset.mode = mode;
    for (const tab of modeTabs) {
        tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    }

    const text = MODE_TEXT[mode];
    searchHeading.textContent = text.heading;
    searchSub.textContent = text.sub;
    searchButtonLabel.textContent = text.button;
    resultsHeading.textContent = text.results;
    searchButton.querySelector('use').setAttribute('href', mode === 'builder' ? '#i-builder' : '#i-search');

    dbSaveButton.disabled = mode !== 'search';
    dbSaveButton.title = mode === 'search' ? 'Archive the current results' : 'Archiving is available in Search mode';
    archiveHint.textContent = mode === 'search'
        ? 'Archive the current results to reopen them later.'
        : 'Archiving works in Search mode. Open still works and switches to Search mode.';

    updateSourceBox();
    updateSelectionUI();
}

function setModeTabsDisabled(disabled)
{
    for (const tab of modeTabs) tab.disabled = disabled;
}

/***********************************************
 *               SELECTION                     *
 ***********************************************/

function getVisibleItems()
{
    return [...screenerResGrp.querySelectorAll('.result-item')].filter(item => item.style.display !== 'none');
}

/* What the library buttons act on: checked rows in Builder mode,
   the visible results in Search mode. */
function getSelectionBibIDs()
{
    const items = mode === 'builder'
        ? screenerResGrp.querySelectorAll('.result-item.checked')
        : getVisibleItems();
    return removeDupesFromArr([...items].map(item => item.dataset.bibId));
}

function selectionEmptyMessage()
{
    return mode === 'builder' ? 'Check at least one thesis first.' : 'There are no visible results to add.';
}

function setItemChecked(item, checked)
{
    item.classList.toggle('checked', checked);
    const box = item.querySelector('.res-check input');
    if (box) box.checked = checked;
}

function updateSelectionUI()
{
    updateBatchButtons();
    const checked = screenerResGrp.querySelectorAll('.result-item.checked').length;
    checkedNumLog.innerText = mode === 'builder' && screenerResGrp.children.length ? checked : '';
    barNewLibBtn.disabled = !checked;

    if (mode === 'builder') {
        libHint.textContent = checked
            ? `New library and Add to selected use the ${checked} checked ${checked === 1 ? 'thesis' : 'theses'}.`
            : 'Check theses in the results, then create a library or add them to the selected one.';
    } else {
        const visible = getVisibleItems().length;
        libHint.textContent = visible
            ? `New library and Add to selected use the ${visible} visible ${visible === 1 ? 'result' : 'results'}.`
            : 'The selected library is the source for Search mode.';
    }
}

async function createLibraryFromSelection()
{
    const bibIDs = getSelectionBibIDs();
    if (mode === 'builder' && !bibIDs.length) return notify(selectionEmptyMessage(), 'warn');

    const librariesArr = getLibrariesArray();
    const name = (await prompt(bibIDs.length ? `Name the new library (${bibIDs.length} theses):` : 'Name the new, empty library:', ''))?.trim();
    if (!name) return;
    if (librariesArr.some(lib => lib.name === name)) {
        return notify(`A library named "${name}" already exists. Use Add to selected to extend it.`, 'warn');
    }

    librariesArr.push({ name, bibIDs });
    saveLibrariesArray(librariesArr);
    refreshSavedLibs(name);
    notify(`Created "${name}" with ${bibIDs.length} ${bibIDs.length === 1 ? 'thesis' : 'theses'}.`, 'success');
}

/***********************************************
 *               FILTERS                       *
 ***********************************************/

function processFilters()
{
    const visibleElements = processTitleFilts();
    const visibleElementsII = processContentFilts(visibleElements);

    visResultItmsNumLog.innerText = screenerResGrp.children.length || resultItmsNumLog.innerText ? visibleElementsII.length : '';
    updateSelectionUI();
}

function isPinned(resultElement)
{
    return mode === 'builder' && keepCheckedChBx.checked && resultElement.classList.contains('checked');
}

function processTitleFilts(resultElements = screenerResGrp.querySelectorAll('.result-item'))
{
    const titleFilters = getSpBoxesValArr(titleFiltSpBoxes);
    const visibleElements = [];

    for (const resultElement of resultElements) {
        const resultTitle = resultElement.querySelector(".result-title").innerText;
        if (eligibleTitle(resultTitle, titleFilters) || isPinned(resultElement)) {
            visibleElements.push(resultElement);
            resultElement.style.display = '';
        } else {
            resultElement.style.display = 'none';
        }
    }

    return visibleElements;
}

function processContentFilts(resultElements = screenerResGrp.querySelectorAll('.result-item'))
{
    const contentFilters = getSpBoxesValArr(contentFiltSpBoxes).map(filter => filter.toLowerCase());
    const includesAll = text => contentFilters.every(filter => text.toLowerCase().includes(filter));
    const visibleElements = [];

    for (const resultElement of resultElements) {
        const resultPages = resultElement.querySelectorAll('.page-item');
        let hiddenPages = 0;

        for (const resultPage of resultPages) {
            const pageContent = resultPage.querySelector('.page-contents').innerText;
            if (!contentFilters.length || includesAll(pageContent)) {
                resultPage.style.display = '';
            } else {
                resultPage.style.display = 'none';
                hiddenPages++;
            }
        }

        const summary = summaryMap.get(resultElement) ?? '';
        const summaryEligible = !contentFilters.length || (summary && includesAll(summary));
        if (hiddenPages === resultPages.length && !summaryEligible && !isPinned(resultElement)) {
            resultElement.style.display = 'none';
        } else {
            visibleElements.push(resultElement);
            resultElement.style.display = '';
        }
    }

    return visibleElements;
}

/***********************************************
 *               FORM COMPONENTS               *
 ***********************************************/

/* A list of query rows: [Required] [field] [text] [remove].
   A lone row is always required and cannot be unticked. Adding the
   second row unticks the first; every added row starts optional. */
function createQueryList(container, addButton, { placeholder, noun, withField = false })
{
    container.classList.toggle('with-field', withField);

    const rows = () => [...container.querySelectorAll('.query-row')];

    function sync()
    {
        const all = rows();
        const single = all.length === 1;
        for (const row of all) {
            const must = row.querySelector('.query-must input');
            if (single) must.checked = true;
            must.disabled = single;
            row.querySelector('.query-must').title = single
                ? `A single ${noun} is always required`
                : 'Ticked: must match. Unticked: optional';
            row.classList.toggle('is-required', must.checked);
            row.querySelector('.query-remove').hidden = single;
        }
        addButton.disabled = all.length >= MAX_QUERIES;
    }

    function addRow({ text = '', must = false, field = EULC_DEFAULT_FIELD } = {})
    {
        const row = document.createElement('div');
        row.className = 'query-row';

        const mustLabel = document.createElement('label');
        mustLabel.className = 'query-must';
        const mustBox = document.createElement('input');
        mustBox.type = 'checkbox';
        mustBox.checked = must;
        mustBox.addEventListener('change', sync);
        const mustText = document.createElement('span');
        mustText.textContent = 'Required';
        mustLabel.append(mustBox, mustText);
        row.append(mustLabel);

        if (withField) {
            const fieldSele = document.createElement('select');
            fieldSele.className = 'query-field';
            fieldSele.setAttribute('aria-label', 'Catalogue field');
            fillSelect(fieldSele, EULC_FIELDS, field);
            row.append(fieldSele);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'query-text';
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        input.value = text;
        input.setAttribute('aria-label', `Search ${noun}`);
        row.append(input);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'query-remove';
        remove.setAttribute('aria-label', `Remove this ${noun}`);
        remove.title = `Remove this ${noun}`;
        remove.innerHTML = '<svg class="ico"><use href="#i-x"/></svg>';
        remove.addEventListener('click', () => {
            const next = row.nextElementSibling ?? row.previousElementSibling;
            row.remove();
            sync();
            next?.querySelector('.query-text')?.focus();
        });
        row.append(remove);

        container.append(row);
        return row;
    }

    addButton.addEventListener('click', () => {
        const all = rows();
        if (all.length >= MAX_QUERIES) return;
        if (all.length === 1) all[0].querySelector('.query-must input').checked = false;
        addRow().querySelector('.query-text').focus();
        sync();
    });

    function set(list = [])
    {
        container.replaceChildren();
        const entries = list.length ? list.slice(0, MAX_QUERIES) : [{}];
        for (const entry of entries) addRow(entry);
        sync();
    }

    function values()
    {
        return rows().map(row => ({
            text: row.querySelector('.query-text').value.trim(),
            must: row.querySelector('.query-must input').checked,
            ...(withField ? { field: row.querySelector('.query-field').value } : {})
        })).filter(query => query.text);
    }

    set();
    return { set, values };
}

/* Publication years with a Range / Exact switch. Exact keeps one box and
   sends it as both ends. Switching to Exact keeps the start year (or the
   end year when the start is empty); switching back fills both ends. */
function createYearField(host, idPrefix)
{
    const maxYear = new Date().getFullYear() + 1;
    host.innerHTML = `
        <div class="field-label-row">
            <label class="field-label" for="${idPrefix}YearStart">Publication years</label>
            <div class="mini-toggle" role="group" aria-label="Year mode">
                <button type="button" data-year-mode="range" aria-pressed="true">Range</button>
                <button type="button" data-year-mode="exact" aria-pressed="false">Exact</button>
            </div>
        </div>
        <div class="range-field year-range">
            <input type="number" id="${idPrefix}YearStart" min="${MIN_YEAR}" max="${maxYear}" placeholder="From" aria-label="First publication year">
            <span aria-hidden="true">to</span>
            <input type="number" id="${idPrefix}YearEnd" min="${MIN_YEAR}" max="${maxYear}" placeholder="To" aria-label="Last publication year">
        </div>
        <div class="year-exact" hidden>
            <input type="number" id="${idPrefix}YearExact" min="${MIN_YEAR}" max="${maxYear}" placeholder="Year" aria-label="Publication year">
        </div>`;

    const start = host.querySelector(`#${idPrefix}YearStart`);
    const end = host.querySelector(`#${idPrefix}YearEnd`);
    const exact = host.querySelector(`#${idPrefix}YearExact`);
    const rangeBox = host.querySelector('.year-range');
    const exactBox = host.querySelector('.year-exact');
    const toggles = host.querySelectorAll('[data-year-mode]');
    let yearMode = 'range';

    function show(next)
    {
        yearMode = next;
        rangeBox.hidden = next !== 'range';
        exactBox.hidden = next !== 'exact';
        for (const toggle of toggles) toggle.setAttribute('aria-pressed', String(toggle.dataset.yearMode === next));
    }

    for (const toggle of toggles) {
        toggle.addEventListener('click', () => {
            const next = toggle.dataset.yearMode;
            if (next === yearMode) return;
            if (next === 'exact') {
                exact.value = start.value || end.value;
            } else {
                start.value = end.value = exact.value;
            }
            show(next);
            (next === 'exact' ? exact : start).focus();
        });
    }

    return {
        get() {
            if (yearMode === 'exact') {
                return { mode: 'exact', start: exact.value.trim(), end: exact.value.trim() };
            }
            return { mode: 'range', start: start.value.trim(), end: end.value.trim() };
        },
        set({ mode: nextMode = 'range', start: s = '', end: e = '' } = {}) {
            if (nextMode === 'exact') {
                exact.value = s || e;
                start.value = end.value = exact.value;
            } else {
                start.value = s;
                end.value = e;
                exact.value = s || e;
            }
            show(nextMode === 'exact' ? 'exact' : 'range');
        }
    };
}

function fillSelect(select, options, selectedValue)
{
    select.replaceChildren(...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }));
    select.value = selectedValue;
}

/***********************************************
 *               PARAMETERS                    *
 ***********************************************/

function readPrevParams(forMode)
{
    try {
        if (forMode === 'builder') {
            const stored = JSON.parse(localStorage.getItem(PREV_BUILDER_PARAMS));
            if (stored) return stored;
            // Older versions stored builder searches with the ordinary parameters
            const legacy = JSON.parse(localStorage.getItem(PREV_SEARCH_PARAMS));
            if (legacy?.libBuilder) {
                return {
                    queries: legacyQueries(legacy).map(q => ({ ...q, field: EULC_DEFAULT_FIELD })),
                    years: { start: legacy.yearsStart, end: legacy.yearsEnd },
                    pages: { min: legacy.pagesStart || '' }
                };
            }
            return null;
        }
        const stored = JSON.parse(localStorage.getItem(PREV_SEARCH_PARAMS));
        if (!stored || stored.libBuilder) return stored && { ...stored, queries: [] , libBuilder: false };
        return stored;
    } catch {
        return null;
    }
}

/* Old parameters kept all words in one comma-joined string, all required. */
function legacyQueries(params)
{
    if (Array.isArray(params.queries)) return params.queries;
    const words = (params.query || '').split(', ').map(w => w.trim()).filter(w => w && w !== QUERY_PLACEHOLDER);
    return words.map(text => ({ text, must: true }));
}

function applySearchParams(params)
{
    if (!params) {
        searchYears.set({ start: String(DEFAULT_START_YEAR), end: String(DEFAULT_END_YEAR) });
        return;
    }
    searchQueries.set(legacyQueries(params).filter(q => q.text !== QUERY_PLACEHOLDER));
    if (params.pagesStart !== undefined) pagesStartInput.value = params.pagesStart;
    if (params.pagesEnd !== undefined) pagesEndInput.value = params.pagesEnd;
    searchYears.set({ mode: params.yearMode, start: params.yearsStart ?? '', end: params.yearsEnd ?? '' });
    bibIDInput.value = params.bibID ?? '';
    if (params.libraryName && [...librarySele.options].some(o => o.value === params.libraryName)) {
        librarySele.value = params.libraryName;
        updateLibMeta();
    }
    updateSourceBox();
}

function applyBuilderParams(params)
{
    if (!params) {
        builderYears.set({ start: String(DEFAULT_START_YEAR), end: String(DEFAULT_END_YEAR) });
        return;
    }
    builderQueries.set((params.queries || []).filter(q => q.text !== QUERY_PLACEHOLDER));
    builderYears.set(params.years || {});
    builderPagesMinInput.value = params.pages?.min ?? '';
    builderPagesMaxInput.value = params.pages?.max ?? '';
    const eulc = params.eulc || {};
    builderScopeSele.value = eulc.scope || EULC_DEFAULT_SCOPE;
    builderWordFormsSele.value = eulc.wordForms || '';
    builderFullTextInput.value = eulc.fullText || '';
    builderBibRangeInput.value = eulc.bibRange || '';
    builderOrderSele.value = eulc.order || EULC_DEFAULT_ORDER;
    builderExactChBx.checked = Boolean(eulc.exact);
}

/***********************************************
 *               LIBRARIES                     *
 ***********************************************/

function refreshSavedLibs(libToSelect = null)
{
    const previous = librarySele.value;
    const libraries = getLibrariesArray();
    librarySele.replaceChildren(...libraries.map(({ name }) => {
        const option = document.createElement('option');
        option.value = option.textContent = name;
        return option;
    }));
    if (!libraries.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No libraries yet';
        option.disabled = true;
        librarySele.append(option);
    }
    const names = libraries.map(lib => lib.name);
    librarySele.value = names.includes(libToSelect) ? libToSelect : (names.includes(previous) ? previous : (names[0] ?? ''));
    updateLibMeta();
    updateSourceBox();
}

function updateLibMeta()
{
    const libraries = getLibrariesArray();
    const lib = libraries.find(lib => lib.name === librarySele.value);
    libMeta.textContent = lib ? `${lib.bibIDs.length} ${lib.bibIDs.length === 1 ? 'thesis' : 'theses'}` : `${libraries.length} saved`;
    for (const btn of [libRenameBtn, libDelBtn, libAppendBtn]) btn.disabled = !lib;
    libDownloadBtn.disabled = !libraries.length;
}

function updateSourceBox()
{
    const bibID = bibIDInput.value.trim();
    if (isInteger(bibID)) {
        searchSource.innerHTML = '';
        searchSource.append(sourceLine('Single thesis', `BibID ${bibID}`));
        return;
    }
    const lib = getLibrariesArray().find(lib => lib.name === librarySele.value);
    searchSource.innerHTML = '';
    searchSource.append(lib
        ? sourceLine(lib.name, `${lib.bibIDs.length} theses · change it in Libraries`)
        : sourceLine('No library selected', 'Create or import one in Libraries'));
}

function sourceLine(title, note)
{
    const wrap = document.createDocumentFragment();
    const strong = document.createElement('strong');
    strong.textContent = title;
    const small = document.createElement('small');
    small.textContent = note;
    wrap.append(strong, small);
    return wrap;
}

async function refreshSavedTitles({ titleSlctName = "", titleSlctIndx = -1 } = {})
{
    const allResults = await screenerDB.getAllSavedResults();
    const allTitles = allResults.sort((resultA, resultB) => {
        const dateA = resultA.meta.date;
        const dateB = resultB.meta.date;
        if (dateB < dateA) return -1;
        if (dateB > dateA) return 1;
        return 0;
    }).map(result => result.meta.title);

    const previous = savedResultsSele.value;
    savedResultsSele.replaceChildren(...allTitles.map(title => {
        const option = document.createElement('option');
        option.value = option.textContent = title;
        return option;
    }));
    if (!allTitles.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Nothing archived yet';
        option.disabled = true;
        savedResultsSele.append(option);
    }

    savedResultsSele.value = allTitles.includes(titleSlctName) ? titleSlctName
        : (allTitles[titleSlctIndx] ?? (allTitles.includes(previous) ? previous : (allTitles[0] ?? '')));

    archiveMeta.textContent = `${allTitles.length} saved`;
    for (const btn of [dbLoadButton, dbRenameButton, dbDownloadButton, dbDeleteButton, dbDownloadALLButton]) {
        btn.disabled = !allTitles.length;
    }
}

function getLibrariesArray(key = LIB_STOR_KEY)
{
    try {
        const libData = JSON.parse(localStorage.getItem(key));
        return Array.isArray(libData) ? libData : [];
    } catch {
        return [];
    }
}
function saveLibrariesArray(libArr, key = LIB_STOR_KEY)
{
	localStorage.setItem(key,JSON.stringify(libArr));
}

/***********************************************
 *      BATCH OPS OVER VISIBLE RESULTS         *
 ***********************************************/

function getVisibleResultsMeta()
{
    return getVisibleItems().map(item => ({
        bibID:         item.querySelector('.res-bib-id').textContent.trim(),
        title:         item.querySelector('.result-title').textContent.trim(),
        publishYear:   item.querySelector('.result-year').textContent.trim(),
        totalPagesNum: item.getAttribute('totalPagesNum')
    }));
}

/* "title [Year][bibID]", trimmed so the bracketed identity always survives
   the length cap even when the title does not. */
function getPdfNameStem({ title, publishYear, bibID })
{
    const suffix = ` [${publishYear}][${bibID}]`;

    const trimmedTitle = Number.isFinite(PDF_NAME_TITLE_WORDS)
        ? title.split(/\s+/).slice(0, PDF_NAME_TITLE_WORDS).join(' ')
        : title;

    return sanitizeFileName(trimmedTitle, PDF_NAME_MAX_LEN - suffix.length) + suffix;
}

/* Scrapes one thesis fully. report(fraction, detail) drives the progress
   bar: finding the pages is the first 10%, collecting them the rest. */
async function scrapResultToCache(result, report = () => {})
{
    let done = 0, total = 0;
    const { pages, pagesNumMap, missingPages } = await scrapBibFully(result, () => {
        done++;
        report(0.1 + 0.9 * (done / total), `page ${done} of ${total}`);
    }, (pageCount) => {
        total = pageCount;
        report(0.1, `found ${pageCount} pages`);
    });

    if (missingPages.length) {
        console.warn(`BibID ${result.bibID}: missing virtual pages ${missingPages.join(', ')}`);
    }

    if (!pages.length) throw new Error('no transcript pages could be collected');

    const record = {
        ...result,
        pages,
        pagesNumMap,
        missingPages,
        date: getTimeStamp(),
        ok: true
    };

    await cacheDB.saveResult(record);
    collectedIDs.add(result.bibID);
    updateBatchButtons();

    return record;
}

/* Runs worker(result, report) over the results one at a time and keeps the
   progress bar moving: report(fraction, detail) moves it within the current
   thesis. A result that blows up is logged and stepped over so one bad bib
   cannot abort the whole run; Stop ends the run. Returns the failed BibIDs
   and whether the run was stopped. */
async function runBatch(verb, results, worker)
{
    if (batchBusy) {
        notify('A batch operation is already running.', 'warn');
        return { failed: [], stopped: false };
    }

    batchBusy = true;
    searchButton.disabled = true;
    setModeTabsDisabled(true);
    updateBatchButtons();

    const signal = operationSignal();
    const failed = [];
    const total = results.length;
    let stopped = false;

    try {
        for (const [index, result] of results.entries()) {
            if (signal.aborted) { stopped = true; break; }
            const report = (fraction = 0, detail = '') => {
                const overall = (index + Math.min(Math.max(fraction, 0), 1)) / total;
                progressBar.style.width = `${(overall * 100).toFixed(1)}%`;
                progressStatus.textContent = `${verb} ${result.bibID} (${index + 1} of ${total})${detail ? ` · ${detail}` : ''} · ${Math.floor(overall * 100)}%`;
            };
            report(0);
            try {
                await worker(result, report);
            } catch (err) {
                if (isStopError(err) || signal.aborted) { stopped = true; break; }
                failed.push(result.bibID);
                console.error(`BibID ${result.bibID} failed:`, err);
            }
            report(1);
        }
    } finally {
        batchBusy = false;
        searchButton.disabled = false;
        setModeTabsDisabled(false);
        updateBatchButtons();
    }
    return { failed, stopped };
}

function isValidLibJson(jsonArr) {
	 return (
	 Array.isArray(jsonArr) &&
	 jsonArr.length >= 1    &&
	 jsonArr.every
	 (
		library => typeof library?.name === 'string' && library.name.trim() &&
		Array.isArray(library.bibIDs)
	 )
	);
 }


function isValidResJson(jsonObj) {
  return (
    typeof jsonObj                                                 === 'object'  &&
    typeof jsonObj.meta 					                       === 'object'  &&
	typeof jsonObj.meta.title    				                   === 'string'  &&
	typeof jsonObj.meta.date    				                   === 'string'  &&
	typeof jsonObj.meta.searchParams         	                   === 'object'  &&
	typeof jsonObj.meta.searchParams.query         			       === 'string'  &&
	typeof jsonObj.meta.searchParams.pagesStart         	       === 'string'  &&
	typeof jsonObj.meta.searchParams.pagesEnd                      === 'string'  &&
	typeof jsonObj.meta.searchParams.yearsStart                    === 'string'  &&
	typeof jsonObj.meta.searchParams.yearsEnd                      === 'string'  &&
	typeof jsonObj.meta.searchParams.libraryName                   === 'string'  &&
	typeof jsonObj.resultItems                                     === 'object'  &&
	Array.isArray(jsonObj.resultItems)                             === true      &&
	jsonObj.resultItems.length                                      >= 1
  );
}

/***********************************************
 *               FILTER BOXES                  *
 ***********************************************/

function getSpBoxesValArr(boxesContainer)
{
	return Array.from( boxesContainer.querySelectorAll('input') ).map( box => box.value.trim() ).filter( boxValue => boxValue);
}

function setSpBox(boxesContainer, maxBoxes = Infinity)
{
    if(boxesContainer.dataset.spBoxed === "true")
    {
        resetSpBox(boxesContainer);
    }

    boxesContainer.dataset.spBoxed = "true";

    const boxes = Array.from( boxesContainer.querySelectorAll("input") );
    for (const box of boxes)
    {
          box.addEventListener('input', () => processBox(box, maxBoxes));
    }

    const lastBox = boxes.pop();
    processBox(lastBox, maxBoxes);

    function processBox(box, maxBoxes)
    {
        const boxes = Array.from( boxesContainer.querySelectorAll("input") );
        const boxesNum = boxes.length;
        const boxIndex = boxes.indexOf(box);

        const isFirstBox = ( boxIndex === 0 );
        const isLastBox = ( boxIndex === boxesNum - 1 );
        const onlyBox = ( boxes.length === 1 );

        if (!box.value && (!isFirstBox || !onlyBox) && !isLastBox)
		{
            boxes[boxIndex].remove();
        }
        else if(box.value && isLastBox && boxesNum < maxBoxes)
        {
            const newBox = box.cloneNode();
            newBox.value = '';
            boxesContainer.appendChild(newBox);
            newBox.addEventListener('input', () => processBox(newBox, maxBoxes));
        }
    }
}

function resetSpBox(boxesContainer, keepMainBoxVal = true)
{
	const boxes = Array.from( boxesContainer.querySelectorAll("input") );
	const mainBox = boxes.shift();
    boxes.forEach(box => box.remove());

	if(!keepMainBoxVal)
	{
	    mainBox.value = '';
	}
}

function fillSpBoxBox(boxContainer, statements)
{
       for (const statement of statements)
       {
           const lastBox = boxContainer.querySelector('input:last-of-type');
           lastBox.value = statement;
           lastBox.dispatchEvent(new Event('input'));
       }
}

function eligibleTitle(title, filterPhrases) {
  const lowerTitle = title.toLowerCase();
  return !filterPhrases.length || filterPhrases.every(phrase =>
    phrase.startsWith('-')? !lowerTitle.includes(phrase.toLowerCase().substring(1)) : lowerTitle.includes(phrase.toLowerCase())
  );
}

/***********************************************
 *               RESULTS                       *
 ***********************************************/

function setResItemForRender(result)
{
	const trimToThreeWords = str => str.split(/\s+/).slice(0, 3).join(" ");

	const title = result.title;
	const pages = result.pages;

	const item =
	{
		title:  ((title.charAt(title.length - 1) === '/')  ? title.slice(0, -1) : title ).trim(),
		publishYear: result.publishYear,
		searchUrl: `${urler.get('SEARCH')}${result.bibID}`,
		browseUrl: `${urler.get('BROWSE')}${result.bibID}`,
		pages: pages ? Array.from(pages.entries()).map( ([pageNumber,pageContents]) =>
		{
			const qText = trimToThreeWords(pageContents[0]);
            const urlIsSrch = ( pageNumber > MAX_PREV_PAGES );
			const pageUrl =  urlIsSrch
               ? `${urler.get('SEARCH')}${result.bibID}&pageNo=${pageNumber}&qText=${qText}`
               : `${urler.get('BROWSE')}${result.bibID}&PageNo=${pageNumber}`;
			return {pageNumber,pageContents,qText,pageUrl};

		}) : [],
        totalPagesNum: result.totalPagesNum,
		bibID: result.bibID,
        summary: result.summary
	};

	renderResultItem(item);
}

function getResultItems()
{
    const resultItems = [];
    for (const domItem of screenerResGrp.querySelectorAll('.result-item'))
    {
        const summary = summaryMap.get(domItem) ?? '';
        const title = domItem.querySelector('.result-title').textContent.trim();
        const publishYear = domItem.querySelector('.result-year').textContent.trim();
        const searchUrl = domItem.querySelector('.res-search-url').href;
        const brosweUrl = domItem.querySelector('.res-browse-url').href;
        const bibID = domItem.querySelector('.res-bib-id').textContent.trim();
        const totalPagesNum = domItem.getAttribute("totalPagesNum");

        const pages = [];
        for (const domPage of domItem.querySelectorAll('.page-item'))
        {
             const pageNumber = domPage.querySelector(".page-number").textContent.trim();
             const pageUrl = domPage.querySelector(".page-urls > a").href;
             const pageContents = Array.from(domPage.querySelectorAll(".page-content"), el => el.textContent.trim());
             pages.push({ pageNumber, pageUrl, pageContents });
        }

        resultItems.push({title, publishYear, searchUrl, brosweUrl, bibID, pages, summary, totalPagesNum});
    }

    return resultItems;
}

function actionEl(tag, className, iconName, label)
{
    const el = document.createElement(tag);
    el.className = `res-action ${className}`;
    el.innerHTML = `<svg class="ico"><use href="#i-${iconName}"/></svg>`;
    el.append(label);
    return el;
}

function renderResultItem(item)
{
	if(screenerResCntr.classList.contains('hidden'))
	{
		screenerResCntr.classList.remove('hidden');
	}

    const selectable = mode === 'builder';

	const resultContainer = document.createElement('div'),
    resultHead = document.createElement('div'),
	resultMeta = document.createElement('div'),
	resultTitle = document.createElement('div'),
    resultFacts = document.createElement('div'),
	resultYear = document.createElement('span'),
    resultSize = document.createElement('span'),
    resultBibID = document.createElement('span'),
	resultUrlsContainer = document.createElement('div'),
    resSearchUrl = actionEl('a', 'res-search-url', 'text', 'Search transcript'),
	resBrowseUrl = actionEl('a', 'res-browse-url', 'external', 'Browse thesis'),
    resultDownImgsBtn = actionEl('button', 'res-down-imgs-btn', 'image', 'Export images'),
    resCopyDesigBtn = actionEl('button', 'res-get-desig-btn', 'copy', 'Copy folder name'),
	resPagesContainer = document.createElement('div');

    resultContainer.className = 'result-item';
    resultHead.className = 'result-head';
	resultMeta.className = 'result-meta';
	resultTitle.className = 'result-title';
    resultFacts.className = 'result-facts';
	resultYear.className = 'result-year';
    resultSize.className = 'result-size';
	resultUrlsContainer.className = 'result-urls';
    resultBibID.className = 'res-bib-id';
	resPagesContainer.className = 'result-pages';

    resultContainer.dataset.bibId = item.bibID;

	resultTitle.innerText = item.title;
	resultYear.innerText = item.publishYear;
    resultSize.innerText = item.totalPagesNum || '';
    resultBibID.innerText = item.bibID;

	resSearchUrl.href = item.searchUrl;
    resBrowseUrl.href = item.browseUrl;
	resSearchUrl.setAttribute('target', '_blank');
	resBrowseUrl.setAttribute('target', '_blank');

    if(item.summary)
    {
        summaryMap.set(resultContainer, item.summary);
    }

    resultContainer.setAttribute("totalPagesNum", item.totalPagesNum);

    setScraperCallBack(resSearchUrl, {bibID: item.bibID, title: item.title, publishYear: item.publishYear,
            totalPagesNum: item.totalPagesNum});

    resultDownImgsBtn.addEventListener('click', async() => {
         const blobObjsArr = await getPrevImgBlobObjs(item.bibID);
         const dataStreamsArr = blobObjsArr.map(blobObj => ({fileName: `Page_${blobObj.pageNumber}` , fileContent:blobObj.blob}));
         downloadGIFZIP(dataStreamsArr, item.bibID);
    });

    resCopyDesigBtn.addEventListener('click', () => {
        const trimmedTitle = item.title.split(' ').slice(0,FOLDER_DESIG_WORDS_LEN).join(' ');
        copyTextToClipboard(`${trimmedTitle} ${item.publishYear} [${item.bibID}]`);
        notify('Folder name copied.');
    });

    if (selectable)
    {
        const checkLabel = document.createElement('label');
        checkLabel.className = 'res-check';
        const checkBox = document.createElement('input');
        checkBox.type = 'checkbox';
        checkBox.setAttribute('aria-label', `Keep "${item.title}"`);
        checkBox.addEventListener('change', () => {
            resultContainer.classList.toggle('checked', checkBox.checked);
            updateSelectionUI();
        });
        checkLabel.append(checkBox);
        resultHead.append(checkLabel);
    }

	resultFacts.append(resultYear, resultSize, resultBibID);
	resultMeta.append(resultTitle, resultFacts);
	resultUrlsContainer.append(resSearchUrl,resBrowseUrl,resultDownImgsBtn,resCopyDesigBtn);
    resultHead.append(resultMeta);

	resultContainer.append(resultHead, resultUrlsContainer);

    if (selectable && item.summary)
    {
        const summaryEle = document.createElement('div');
        summaryEle.className = 'res-summary';
        summaryEle.innerText = item.summary;
        resPagesContainer.append(summaryEle);
        resultContainer.classList.add('has-summary');
    }

	for (const page of item.pages)
	{
       const urlIsSrch = ( page.pageNumber > MAX_PREV_PAGES );

	   const pageContainer = document.createElement('div'),
	   pageHeader = document.createElement('div'),
	   pageNumber = document.createElement('div'),
	   pageUrlsContainer = document.createElement('div'),
	   pageUrl = document.createElement('a'),
	   pageContentsContainer = document.createElement('div');

	   pageContainer.className = 'page-item';
	   pageHeader.className = 'page-header';
	   pageNumber.className = 'page-number';
	   pageUrlsContainer.className = 'page-urls';
	   pageUrl.className = urlIsSrch ? 'page-search-url' : 'page-browse-url';
	   pageContentsContainer.className = 'page-contents';

	   pageNumber.innerText = page.pageNumber;

	   pageUrl.href = page.pageUrl;
	   pageUrl.setAttribute('target', '_blank');

	   if(urlIsSrch)
	   {
        const query = function (){
         if (page.pageNumber > 100) {
                 const firstText = page.pageContents[0];
                 const trimmed = firstText.split(/\s+/).slice(0, 4).join("%");
                 return `%%${trimmed}`;
             } else {
                 return '%%';
             }
         }();

         setScraperCallBack(pageUrl, { bibID: item.bibID, title: item.title, publishYear: item.publishYear,
            totalPagesNum: item.totalPagesNum, pageNumber: page.pageNumber, defQuery: query } );
	   }
	   pageUrlsContainer.append(pageUrl);
	   pageHeader.append(pageNumber,pageUrlsContainer);
	   pageContainer.append(pageHeader);

	   for(const pageContent of page.pageContents)
	   {
		   const pageContentEle = document.createElement('div');
		   pageContentEle.className = 'page-content';
		   pageContentEle.innerText = pageContent;
		   pageContentsContainer.append(pageContentEle);
	   }

	   pageContainer.append(pageContentsContainer);
	   resPagesContainer.append(pageContainer);
	}

    if (item.pages.length) resultContainer.classList.add('has-pages');

    resultContainer.append(resPagesContainer);
	screenerResGrp.append(resultContainer);

    accordionize(resultContainer, resPagesContainer, "screener-res-accord");
}

function accordionize(accordEle, contentEle, groupStr) {

    contentEle.style.height = "0px";
    contentEle.style.overflow = "hidden";
    contentEle.style.transition = "height 0.3s ease";
    contentEle.style.cursor = "default";
    contentEle.classList.add('accordion-panel', groupStr);

    accordEle.addEventListener('click', (event) => {
        if (contentEle.contains(event.target) || event.target.closest('button, a, input, label, select')) {
            return;
        }
        if (!contentEle.childElementCount) return;

        const otherAccords = Array.from(document.querySelectorAll(`.${groupStr}`)).filter((ele) => ele !== contentEle);
        otherAccords.forEach((otherAccord) => {
            otherAccord.style.height = "0px";
            otherAccord.closest('.result-item')?.classList.remove('open');
        });
        const opening = contentEle.style.height === "0px";
        contentEle.style.height = opening ? contentEle.scrollHeight + "px" : "0px";
        accordEle.classList.toggle('open', opening);
    });
}


function setScraperCallBack(pageUrlEle, args)
{
	pageUrlEle.onclick = (event) => {
		event.stopPropagation();
		event.preventDefault();
		scraperCallback(args);
	};
}

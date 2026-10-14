/***********************************************
 *               IMPORTS                       *
 ***********************************************/

import {
    DEFAULT_START_YEAR_RANGE,
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
    PREV_SEARCH_PARAMS
}
from '../configs/configs.js';
import {
    arrayFromNUMRange,
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
    sanitizeFileName
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
const summaryMap = new Map();
let scraperCallback = function (){};

/* Batch (Scrap All / Download All) knobs */
const PDF_NAME_MAX_LEN   = 120;       // whole "title [Year][bibID]" stem
const PDF_NAME_TITLE_WORDS = Infinity;  // set to FOLDER_DESIG_WORDS_LEN to mirror the copy-desig button
const SKIP_CACHED_ON_SCRAP_ALL = true;  // a bib already scraped cleanly is not scraped again
let batchBusy = false;
/***********************************************
 *               SELECTORS                     *
 ***********************************************/
const pagesStartInput = document.getElementById('pagesStartInput');
const pagesEndInput = document.getElementById('pagesEndInput');
const yearsStartSele = document.getElementById('yearsStartSele');
const yearsEndSele = document.getElementById('yearsEndSele');
const bibIDInput = document.getElementById('bibIDInput');
const librarySele = document.getElementById('librarySele');
const libRenameBtn = document.getElementById('libRenameBtn');
const libAddBtn = document.getElementById('libAddBtn');
const libDelBtn = document.getElementById('libDelBtn');
const libDownloadBtn = document.getElementById('libDownloadBtn');
const libImportBtn = document.getElementById('libImportBtn');
const importLibInput = document.getElementById('importLibInput');
const libSaveBtn = document.getElementById('libSaveBtn');
const buildLibChBx = document.getElementById('buildLibChBx');
const multipleQueriesChBx = document.getElementById('multipleQueriesChBx');
const loadPrevParamsBtn = document.getElementById('loadPrevParamsBtn');
const titleFiltSpBoxes = document.getElementById('titleFiltSpBoxes');
const querySpBoxes = document.getElementById('querySpBoxes');
const contentFiltSpBoxes = document.getElementById('contentFiltSpBoxes');
const searchButton = document.getElementById('searchButton');
const savedResultsSele = document.getElementById('savedResultsSele');
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
const scraperContainer = document.getElementById('scraperContainer');

/* Picked up from index.html when declared there; otherwise built and parked
   directly above the results list. Labels come from CSS ::before, like the
   other JS-built buttons. */
const scrapAllBtn    = document.getElementById('scrapAllBtn')    ?? makeBatchBtn('scrapAllBtn', 'res-scrap-all-btn');
const downloadAllBtn = document.getElementById('downloadAllBtn') ?? makeBatchBtn('downloadAllBtn', 'res-download-all-btn');

function makeBatchBtn(id, btnClass)
{
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = `screener-batch-btn ${btnClass}`;

    let bar = document.getElementById('screenerBatchBar');
    if (!bar)
    {
        bar = document.createElement('div');
        bar.id = 'screenerBatchBar';
        bar.className = 'screener-batch-bar';

        // Sits as the results group's immediate previous sibling, whatever
        // depth that group happens to live at inside the results container.
        if (screenerResGrp?.parentNode)
        {
            screenerResGrp.before(bar);
        }
        else
        {
            screenerResCntr.append(bar);
        }
    }

    bar.append(btn);
    return btn;
}
/***********************************************
 *               ENTRY POINT                   *
 ***********************************************/

export function initScreener(_scraperCallback) {
	scraperCallback = _scraperCallback;
	
    pagesStartInput.value = DEFAULT_START_PAGE;
    pagesEndInput.value = DEFAULT_END_PAGE;

    const presentYear = new Date().getFullYear();
    const allYears = arrayFromNUMRange(DEFAULT_START_YEAR_RANGE, presentYear);
    for (const year of allYears) {
        const isDefaultStartYear = (year === DEFAULT_START_YEAR);
        const isDefaultEndYear = (year === DEFAULT_END_YEAR);
        createOptionForSelect(yearsStartSele, year, isDefaultStartYear);
        createOptionForSelect(yearsEndSele, year, isDefaultEndYear);
    }


    refreshSavedLibs();
    refreshSavedTitles({titleSlctIndx: 0});

    setSpBox(titleFiltSpBoxes);
    setSpBox(contentFiltSpBoxes);

    buildLibChBx.addEventListener('change', () => {
        if (buildLibChBx.checked) {
            setSpBox(querySpBoxes,3);
        } else {
            if (multipleQueriesChBx.checked) {
                setSpBox(querySpBoxes); 
            }
            else
            {
                unSetSpBox(querySpBoxes);
            }
        }
    });

    multipleQueriesChBx.addEventListener('change', () => {
        if (multipleQueriesChBx.checked) {
            setSpBox(querySpBoxes);
        } else {
            unSetSpBox(querySpBoxes);
        }
    });

    window.addEventListener('keydown', (e) => {

       if(e.key === 'Enter' && scraperContainer.classList.contains("hidden"))
	   {
		  searchButton.click();
	   }

	});



    searchButton.addEventListener('click', async() => {

        try {
       

            searchButton.disabled = true;
            let queryWords = getSpBoxesValArr(querySpBoxes);

            if (!queryWords.length) {
                queryWords = [QUERY_PLACEHOLDER];
            }

            screenerResGrp.innerHTML = "";
            resultItmsNumLog.innerText = visResultItmsNumLog.innerText = "";
            summaryMap.clear();

			
            const bibID = isInteger(bibIDInput.value) ? bibIDInput.value : '';
			const pagesStart = pagesStartInput.value;
            const pagesEnd = pagesEndInput.value
            const yearsStart = yearsStartSele.value;
            const yearsEnd = yearsEndSele.value;
            const libraryName = librarySele.value;

            const libBuilder = buildLibChBx.checked;


            let resultsNum = 0;


            searchParams = {
                    query: queryWords.join(', '),
                    pagesStart,
                    pagesEnd,
                    yearsStart,
                    yearsEnd,
                    libraryName,
                    bibID,
                    libBuilder
                };

            localStorage.setItem(PREV_SEARCH_PARAMS, JSON.stringify(searchParams));


        
            if (!libBuilder) {
                

                

                const bibIDs = (bibID && [bibID]) || getLibrariesArray()?.find(library => library.name === libraryName)?.bibIDs;

                if (!Array.isArray(bibIDs) || !bibIDs.length) {
                    throw new Error("Select a library or enter a BibID before searching.");
                }


                const totalItems = bibIDs.length * queryWords.length;

                const progressObj = new Progress(totalItems, progressBar, progressStatus);

                resultsNum = await getBibs(bibIDs, queryWords, yearsStart, yearsEnd, pagesStart, pagesEnd, progressObj, setResItemForRender);

                resetSpBox(titleFiltSpBoxes, false);
                resetSpBox(contentFiltSpBoxes, false);

                
            }
			else
			{
				const minPagesLen = pagesStart || pagesEnd;
				resultsNum = await getLib(queryWords, yearsStart, yearsEnd, minPagesLen, setResItemForRender);
				
			}



            resultItmsNumLog.innerText = visResultItmsNumLog.innerText = resultsNum;

        } 
        catch (err) 
        {
            window.reportAppError?.(err);
        }
        finally 
        {
            searchButton.disabled = false;
        }

    });
    

    loadPrevParamsBtn.addEventListener('click', loadPrevParams);
    loadPrevParamsBtn.click();


    titleFiltSpBoxes.addEventListener('input',  processFilters);
    contentFiltSpBoxes.addEventListener('input',    processFilters);
        
    
    function processFilters()
    {
        const visibleElements = processTitleFilts();
        const visibleElementsII = processContentFilts(visibleElements);

        visResultItmsNumLog.innerText = visibleElementsII.length;

    }
        
    function processTitleFilts(resultElements = document.querySelectorAll('.result-item'))
    {

        const titleFilters = getSpBoxesValArr(titleFiltSpBoxes);
        const visibleElements = [];

        for (const resultElement of resultElements) {
             const resultTitleEle = resultElement.querySelector(".result-title");
             const resultTitle = resultTitleEle.innerText;
             const isEligibleTitle = eligibleTitle(resultTitle,titleFilters);
             const locked = resultElement.classList.contains("locked");
             if(isEligibleTitle || locked)
             {
                  visibleElements.push(resultElement);
                  resultElement.style.display = '';
             }
             else
             {
                  resultElement.style.display = 'none';
             }
       
        }

        return visibleElements;
    }

     function processContentFilts(resultElements = document.querySelectorAll('.result-item'))
     {

        const contentFilters = getSpBoxesValArr(contentFiltSpBoxes);

        const visibleElements = [];

        for (const resultElement of resultElements) {

            const resultPages = resultElement.querySelectorAll('.page-item');
            const locked = resultElement.classList.contains("locked");
            let hiddenPages = 0;

            for (const resultPage of resultPages) {

                const pageContent = resultPage.querySelector('.page-contents').innerText;
                if (!contentFilters.length || contentFilters.every(contentFilter => pageContent.toLowerCase().includes
                        (contentFilter.toLowerCase()))) {
                    resultPage.style.display = '';

                } else {
                    resultPage.style.display = 'none';
                    hiddenPages++;

                }
            }

            const summary = summaryMap.get(resultElement) ?? '';
            const summaryEligible =   (!contentFilters.length || contentFilters.every(contentFilter => summary.toLowerCase().includes
                        (contentFilter.toLowerCase())));
            if (hiddenPages === resultPages.length && !locked && !summaryEligible) {
                resultElement.style.display = 'none';
            } else {
                visibleElements.push(resultElement);
                resultElement.style.display = '';
            }
        }

        return visibleElements;

    }
    libAddBtn.addEventListener('click', async() => {
      
        const librariesArr = getLibrariesArray();
        const slctedLibNName = librarySele.value;
        
        const bibIDs = [];
        const visibleItems = document.querySelectorAll('.result-item:not([style*="display: none"])');
        visibleItems.forEach((item) => {
            const bibID = item.querySelector("div.res-bib-id").textContent.trim();
            bibIDs.push(bibID);
        });

        const lib = librariesArr.find(lib => lib.name === slctedLibNName);
        lib.bibIDs = removeDupesFromArr([...lib.bibIDs, ...bibIDs]);

        saveLibrariesArray(librariesArr);

    });
    libDelBtn.addEventListener('click', async() => {
        const slctedLibNName = librarySele.value;

        const librariesArr = getLibrariesArray();
        const index = librariesArr.findIndex(lib => lib.name === slctedLibNName);

        if(index !== -1)
        {
            librariesArr.splice(index, 1);
            saveLibrariesArray(librariesArr);
            refreshSavedLibs();
        }

    });
    libRenameBtn.addEventListener('click', async() => {

        const librariesArr = getLibrariesArray();
        const librariesNames = librariesArr.map(library => library.name);

        const slctedLibNName = librarySele.value;
        const newName = (await prompt(`Enter new name for "${slctedLibNName}":`, slctedLibNName))?.trim();
        if (newName && newName !== slctedLibNName) {
            if (librariesNames.some((libName) => libName === newName)) {
                return alert(`A saved result named "${newName}" already exists.`);
            }

            const lib = librariesArr.find(lib => lib.name === slctedLibNName);
            if (!lib) return alert("Select a library before renaming it.");
            lib.name = newName;
            saveLibrariesArray(librariesArr);
            refreshSavedLibs(newName);

        }

    });
    libSaveBtn.addEventListener('click', async() => {
        const visibleItems = document.querySelectorAll('.result-item:not([style*="display: none"])');
        const bibIDs = [];
        visibleItems.forEach((item) => {
            const bibID = item.querySelector("div.res-bib-id").textContent.trim();
            bibIDs.push(bibID);
        });

        const librariesArr = getLibrariesArray();

        const slctedLibNName = librarySele.value;
        const libName = await prompt("Enter library name:",slctedLibNName);
        if(libName !== null)
        {
            const lib = librariesArr.find(lib => lib.name === libName);
            if(lib)
            {
                Object.assign(lib, {name: libName, bibIDs});
            }
            else
            {
                librariesArr.push({name: libName, bibIDs});
            }

            
            saveLibrariesArray(librariesArr);
            refreshSavedLibs(libName);

        }


    });

    libDownloadBtn.addEventListener('click', async() => {

        const libraryArr = getLibrariesArray();
        if (Array.isArray(libraryArr) && libraryArr.length) {
            const GMT3TimeStamp = getTimeStamp();
            const date = GMT3TimeStamp.slice(0, -4);
            downloadJSON(libraryArr, "[EULC_SCREENER]"+"[Libraries]" + " " + date);
        }

    });

    libImportBtn.addEventListener('click', async() => {

        importLibInput.click();

    });

    importLibInput.addEventListener('change', async() => {

        const file = importLibInput.files[0];
        if (file.type === IMPORT_FILE_TYPES.JSON) {
            const jsonArr = await readJsonFile(file);
            if (jsonArr) {
                if (isValidLibJson(jsonArr)) {
                    saveLibrariesArray(jsonArr);
                    refreshSavedLibs();
                }
            }
        }

        importLibInput.value = '';
    });

    dbSaveButton.addEventListener('click', async() => {

        const resultItems = getResultItems();
        if (!resultItems.length) {
            return console.log("No results to save");
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

        refreshSavedTitles({titleSlctName: meta.title});

    });

    dbLoadButton.addEventListener('click', async() => {

        const selectedTitle = savedResultsSele.value;

        if (!selectedTitle) 
        {
            return console.log("No title selected.");

        }

        const savedResult = await screenerDB.getSavedResult(selectedTitle);

        if (!savedResult) {
            return console.error(`Couldn't find an entry named "${selectedTitle}" in the database.`);
        }

        summaryMap.clear();
        screenerResGrp.innerHTML = "";


        searchParams = savedResult.meta.searchParams;
        const resultItems = savedResult.resultItems;
        resultItems.forEach(resultItem => renderResultItem(resultItem));

        resetSpBox(contentFiltSpBoxes, false);
        resetSpBox(titleFiltSpBoxes, false);
    
        resultItmsNumLog.innerText = visResultItmsNumLog.innerText = resultItems.length;

    });

    dbRenameButton.addEventListener('click', async() => {

        
        const selectedTitle = savedResultsSele.value;
        

        if (!selectedTitle) {
            return console.log("No title selected.");

        }

        const savedResult = await screenerDB.getSavedResult(selectedTitle);

        if (!savedResult) {
            return console.error(`Couldn't find an entry named "${selectedTitle}" in the database.`);
        }

        const allTitles = await screenerDB.getAllSavResTitles();

        const newTitle = (await prompt(`Enter new name for "${selectedTitle}":`, selectedTitle))?.trim();
        if (newTitle) {

            if (allTitles.some((title) => title === newTitle)) {
                return alert(`A saved result named "${newTitle}" already exists.`);
            }

            savedResult.meta.title = newTitle;

            await screenerDB.deleteResult(selectedTitle);
            await screenerDB.saveResult(savedResult);
   
            refreshSavedTitles({titleSlctName: newTitle});

        }

    });

    dbDeleteButton.addEventListener('click', async() => {

        const allTitles = await screenerDB.getAllSavResTitles();
        const selectedTitle = savedResultsSele.value;

        if (!selectedTitle) {
            return console.log("No title selected.");

        }
        if (!allTitles) {
            return console.warn("No saved results in database.");

        }
        if (!allTitles.includes(selectedTitle)) {
            return console.error(`Couldn't find an entry named "${selectedTitle}" in the database.`);
        }

        const confirmDelete = confirm(`Are you sure you want to delete "${selectedTitle}"?`);
        if (confirmDelete) {

            await screenerDB.deleteResult(selectedTitle);
            refreshSavedTitles();

        }
    });

    dbDownloadButton.addEventListener('click', async() => {

        const allResults = await screenerDB.getAllSavedResults();
        const selectedTitle = savedResultsSele.value;
        const savedResult = allResults.find(result => result.meta.title === selectedTitle);

        if (!selectedTitle) {
            return console.log("No title selected.");

        }

        if (!allResults.length) {
            return console.warn("No saved results in database.");

        }

        if (!savedResult) {
            return console.error(`Couldn't find an entry named "${selectedTitle}" in the database.`);
        }

        downloadJSON(savedResult, "[EULC_SCREENER]"+"[DB]" + " " + selectedTitle);

    });

    dbDownloadALLButton.addEventListener('click', async() => {
        const results = await screenerDB.getAllSavedResults();
        const dataStreamsArr = results.map(result => ({fileName: result.meta.title , fileContent:result}));
        const GMT3TimeStamp = getTimeStamp();
        downloadJSONZIP(dataStreamsArr, "[EULC_SCREENER]"+"[DBs]" + " " + getTimeStamp());

    });

    importButton.addEventListener('click', async() => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', async() => {

        async function importJsonObj(jsonObj) {
            if (isValidResJson(jsonObj)) {
                const allTitles = await screenerDB.getAllSavResTitles();
                let title = jsonObj.meta.title;

                if (allTitles.includes(title)) {
                    const GMT3TimeStamp = getTimeStamp();
                    title += ' ' + GMT3TimeStamp;
                }

                jsonObj.meta.title = title;

                await screenerDB.saveResult(jsonObj);
                return title;

            }

        }

        const file = importFileInput.files[0];

        if (file.type === IMPORT_FILE_TYPES.JSON) {

            const jsonObj = await readJsonFile(file);
            if (jsonObj) {

                const savedTitle = await importJsonObj(jsonObj);
                refreshSavedTitles({titleSlctName: savedTitle});
            }
        } else if (file.type === IMPORT_FILE_TYPES.ZIP) {
            const jsonFiles = await unZipFilesAsText(file, 'json');
            const jsonObjs = jsonFiles.map(jsonFile => JSON.parse(jsonFile.fileContent));

            for (let [index, jsonObj] of jsonObjs.entries()) {
                const savedTitle = await importJsonObj(jsonObj);
                if (index === jsonObjs.length - 1) {
                    refreshSavedTitles({titleSlctName: savedTitle});
                }
            }

        }

        importFileInput.value = '';

    });

    scrapAllBtn.addEventListener('click', async() => {

        const results = getVisibleResultsMeta();

        if (!results.length) {
            return console.warn("No visible results to scrap.");
        }

        await runBatch(results, async(result, index) => {

            if (SKIP_CACHED_ON_SCRAP_ALL) {
                const cached = await cacheDB.getSavedResult(result.bibID);
                if (cached?.ok) {
                    return console.log(`[${index + 1}/${results.length}] BibID ${result.bibID} already scraped, skipped.`);
                }
            }

            progressStatus.textContent = `Scrapping ${result.bibID} (${index + 1} of ${results.length})...`;
            await scrapResultToCache(result);

        });

    });

    downloadAllBtn.addEventListener('click', async() => {

        const results = getVisibleResultsMeta();

        if (!results.length) {
            return console.warn("No visible results to download.");
        }

        if (typeof window.appAPI?.htmlToPdfBuffer !== 'function') {
            return console.error("window.appAPI.htmlToPdfBuffer is missing: expose the 'html-to-pdf-buffer' channel in preload.js.");
        }

        const files = [];

        await runBatch(results, async(result, index) => {

            // A bib that was never scrapped is scrapped now, so the button
            // works on its own; the cache makes repeat runs cheap.
            let record = await cacheDB.getSavedResult(result.bibID);

            if (!record?.ok) {
                progressStatus.textContent = `Scrapping ${result.bibID} (${index + 1} of ${results.length})...`;
                record = await scrapResultToCache(result);
            }

            if (!record.pages?.length) {
                throw new Error("nothing scraped");
            }

            progressStatus.textContent = `Rendering PDF for ${result.bibID} (${index + 1} of ${results.length})...`;

            const fileStem = getPdfNameStem(result);
            const html = buildBibTranscriptHTML(fileStem, record.pages, record.pagesNumMap);
            const res = await window.appAPI.htmlToPdfBuffer(html);

            if (!res?.ok) {
                throw new Error(res?.error ?? "PDF generation failed");
            }

            files.push({ fileName: `${fileStem}.pdf`, fileContent: new Uint8Array(res.data) });

        });

        if (!files.length) {
            return console.warn("No PDFs were produced.");
        }

        downloadFilesZIP(files, "[EULC_SCREENER]" + "[PDFs]" + " " + getTimeStamp().slice(0, -4));

    });

}
/***********************************************
 *               FUNCTIONS     			       *
 ***********************************************/

/***********************************************
 *      BATCH OPS OVER VISIBLE RESULTS         *
 ***********************************************/

function getVisibleResultsMeta()
{
    const visibleItems = document.querySelectorAll('.result-item:not([style*="display: none"])');

    return Array.from(visibleItems).map(item => ({
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

async function scrapResultToCache(result)
{
    const { pages, pagesNumMap, missingPages } = await scrapBibFully(result);

    if (missingPages.length) {
        console.warn(`BibID ${result.bibID}: missing virtual pages ${missingPages.join(', ')}`);
    }

    const record = {
        ...result,
        pages,
        pagesNumMap,
        missingPages,
        date: getTimeStamp(),
        ok: Boolean(pages.length)
    };

    await cacheDB.saveResult(record);

    return record;
}

/* One progress step per RESULT (not per page). A result that blows up is
   logged and stepped over so a single bad bib cannot abort the whole run. */
async function runBatch(results, worker)
{
    if (batchBusy) {
        return console.warn("A batch operation is already running.");
    }

    batchBusy = true;
    scrapAllBtn.disabled = downloadAllBtn.disabled = searchButton.disabled = true;

    const progressObj = new Progress(results.length, progressBar, progressStatus);
    const failed = [];

    try {
        for (const [index, result] of results.entries()) {
            try {
                await worker(result, index);
            } catch (err) {
                failed.push(result.bibID);
                console.error(`BibID ${result.bibID} failed:`, err);
            } finally {
                progressObj.progress(1);
            }
        }
    } finally {
        batchBusy = false;
        scrapAllBtn.disabled = downloadAllBtn.disabled = searchButton.disabled = false;

        if (failed.length) {
            progressStatus.textContent += ` | failed: ${failed.join(', ')}`;
        }
    }
}

function isValidLibJson(jsonArr) {
	 return (
	 typeof jsonArr 		=== 'object' &&
	 Array.isArray(jsonArr) === true     &&
	 jsonArr.length          >= 1        &&
	 jsonArr.every
	 ( 
		library => Object.hasOwn(library, 'name') && 
		Object.hasOwn(library, 'bibIDs') &&
		typeof library.bibIDs 	=== 'object' &&
		Array.isArray(library.bibIDs) === true
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




function loadPrevParams()
{
        const prevSearchParams = JSON.parse(localStorage.getItem(PREV_SEARCH_PARAMS));
        if(!prevSearchParams)
        {
            return;
        }

        const  {query, pagesStart, pagesEnd, yearsStart, yearsEnd, libBuilder, bibID} 
        = prevSearchParams;
           

        const queryWords = query.split(', ');

        const isMultipleQs = queryWords.length > 1;
        if(isMultipleQs)
        {
            multipleQueriesChBx.checked = true;
            multipleQueriesChBx.dispatchEvent(new Event('change'));
        }
        

        fillSpBoxBox(querySpBoxes,queryWords),


    
        pagesStartInput.value = pagesStart,
        pagesEndInput.value = pagesEnd,
        yearsStartSele.value = yearsStart,
        yearsEndSele.value = yearsEnd,
        bibIDInput.value = bibID ?? '';
        buildLibChBx.checked = libBuilder;


}



function refreshSavedLibs(libToSelect = null)
{

	librarySele.innerHTML = ''
	const librariesNames = getLibrariesArray()?.map( library => library.name );
 
	librariesNames?.forEach ( ( libraryName ) => 
    {

         const select = (libraryName === libToSelect);
         createOptionForSelect(librarySele, libraryName, select);

    });
        
}

async function refreshSavedTitles({ titleSlctName = "", titleSlctIndx = -1 } = {})

{
	savedResultsSele.innerHTML = '';
	
    const allResults = await screenerDB.getAllSavedResults();
    const allTitles = allResults.sort( (resultA,resultB) => {

        const dateA = resultA.meta.date;
        const dateB = resultB.meta.date;

        if (dateB < dateA) return -1;
        if (dateB > dateA) return 1;  
        return 0;                      

    }).map(result => result.meta.title);

	allTitles.forEach ( (title,index) => createOptionForSelect(savedResultsSele,title,
        (title === titleSlctName || index === titleSlctIndx)
    ));

}

function createOptionForSelect(selectElement, optionText, selected = false, optionValue = optionText)
{
  const optionElement = document.createElement("option");
  const initValue = selectElement.value;
  
  optionElement.value = optionValue;
  optionElement.textContent = optionText;
  selectElement.appendChild(optionElement);
  
  selectElement.value = selected || !initValue ? optionValue : initValue;
 
}


function getLibrariesArray(key = LIB_STOR_KEY)
{
   
    const libData = JSON.parse(localStorage.getItem(key))
	return libData;
	
}
function saveLibrariesArray(libArr, key = LIB_STOR_KEY)
{
	localStorage.setItem(key,JSON.stringify(libArr));
	
}

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
          box.addEventListener('input', (event) => processBox(box, maxBoxes));
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
            newBox.addEventListener('input', (event) => processBox(newBox, maxBoxes));
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

function unSetSpBox(boxesContainer, keepMainBoxVal = true)
{
    boxesContainer.dataset.spBoxed = "false";

    const boxes = Array.from( boxesContainer.querySelectorAll("input") );
	const mainBox = boxes.shift();
    const mainBoxVal = mainBox.value;

    const mainBoxClone = mainBox.cloneNode();

    boxesContainer.replaceChild(mainBoxClone, mainBox);
    boxes.forEach(box => box.remove());

	if(keepMainBoxVal)
	{
	    mainBoxClone.value = mainBoxVal;
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


function setResItemForRender(result)
{
	const trimToThreeWords = str => str.split(/\s+/).slice(0, 3).join(" ");

	const bibID         = result.bibID;
	const title         = result.title;
	const publishYear   = result.publishYear;
	const pages 	    = result.pages;
    const totalPagesNum = result.totalPagesNum;
    const summary = result.summary;

	const item =
	{
		title:  ((title.charAt(title.length - 1) === '/')  ? title.slice(0, -1) : title ).trim(),
		publishYear:publishYear,
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
        totalPagesNum,
		bibID,
        summary

	};
	
	renderResultItem(item);

	
}

function getResultItems()
{
    const resultItems = [];
    const domItems = document.querySelectorAll('.result-item');
    for (const domItem of domItems)
    {
        const summary = domItem.getAttribute("summary");
     
        const title = domItem.querySelector('.result-title').textContent.trim();
        const publishYear = domItem.querySelector('.result-year').textContent.trim();
        const searchUrl = domItem.querySelector('.res-search-url').href;
        const brosweUrl = domItem.querySelector('.res-browse-url').href;
        const bibID = domItem.querySelector('.res-bib-id').textContent.trim();
        const totalPagesNum = domItem.getAttribute("totalPagesNum");
        
        const pages = [];
        const domPages = domItem.querySelectorAll('.page-item');
        for (const domPage of domPages)
        {
             const pageNumber = domPage.querySelector(".page-number").textContent.trim();
             const pageUrl = domPage.querySelector(".page-urls > a").href;

             const pageContents = [];
             const domPgContents = domPage.querySelectorAll(".page-content");
             for(const domPgContent of domPgContents)
             {
                 const pageContent = domPgContent.textContent.trim();
                 pageContents.push(pageContent);
             }

             const page = { pageNumber, pageUrl, pageContents};
             pages.push(page);
        }

        const item = {title, publishYear, searchUrl, brosweUrl, bibID, pages, summary, totalPagesNum};
        resultItems.push(item);

    }

    return resultItems;
}

function renderResultItem(item)
{
	if(screenerResCntr.classList.contains('hidden'))
	{
		screenerResCntr.classList.remove('hidden');
	}
	
	const resultContainer = document.createElement('div'),
    resultLockBtn = document.createElement('button'),
    resultRemovBtn = document.createElement('button'),
	resultMeta = document.createElement('div'),
	resultTitle = document.createElement('div'),
	resultYear = document.createElement('div'), 
	resultUrlsContainer = document.createElement('div'),
    resSearchUrl = document.createElement('a'),
	resBrowseUrl = document.createElement('a'),
    resultBibID = document.createElement('div'), 
    resultDownImgsBtn = document.createElement('button'), 
    resCopyDesigBtn = document.createElement('button'), 
	resPagesContainer = document.createElement('div');

    resultContainer.className = 'result-item',
    resultLockBtn.className = 'res-lock-btn';
    resultRemovBtn.className = 'res-remove-btn',
	resultMeta.className = 'result-meta',
	resultTitle.className = 'result-title',
	resultYear.className = 'result-year',
	resultUrlsContainer.className = 'result-urls',
	resBrowseUrl.className = 'res-browse-url', 
	resSearchUrl.className = 'res-search-url',
    resultBibID.className = 'res-bib-id',
    resultDownImgsBtn.className = 'res-down-imgs-btn',
    resCopyDesigBtn.className = 'res-get-desig-btn',
	resPagesContainer.className = 'result-pages';
	
	resultTitle.innerText = item.title;
	resultYear.innerText = item.publishYear;	
	
	resSearchUrl.href = item.searchUrl;
    resBrowseUrl.href = item.browseUrl;
	
	resSearchUrl.setAttribute('target', '_blank');
	resBrowseUrl.setAttribute('target', '_blank');

    resultBibID.innerText = item.bibID;

    if(item.summary)
    {
        summaryMap.set(resultContainer, item.summary);
    }

    resultContainer.setAttribute("totalPagesNum", item.totalPagesNum);
  
    setScraperCallBack(resSearchUrl, {bibID: item.bibID, title: item.title, publishYear: item.publishYear, 
            totalPagesNum: item.totalPagesNum});


    resultLockBtn.addEventListener('click', async(event) => {
  
        const locked = resultContainer.classList.contains("locked");
        if(locked)
        {
            resultLockBtn.classList.remove("locked");
            resultContainer.classList.remove("locked");

        }
        else
        {
            resultLockBtn.classList.add("locked");
            resultContainer.classList.add("locked");
        }

      
        
    });
    resultRemovBtn.addEventListener('click', async(event) => {
      

        const locked = resultContainer.classList.contains("locked");
        if(!locked)
        {
            summaryMap.delete(resultContainer);
            resultContainer.remove();
            resultItmsNumLog.innerText = Number(resultItmsNumLog.innerText) - 1;
            visResultItmsNumLog.innerText = Number(visResultItmsNumLog.innerText) - 1;
        }

    });

    resultDownImgsBtn.addEventListener('click', async() => {
         const zipFileName = item.bibID;
         const blobObjsArr = await getPrevImgBlobObjs(item.bibID);
         const dataStreamsArr = blobObjsArr.map(blobObj => ({fileName: `Page_${blobObj.pageNumber}` , fileContent:blobObj.blob}));
         downloadGIFZIP(dataStreamsArr,zipFileName);

    });

    resCopyDesigBtn.addEventListener('click', async() => {
        const trimmedTitle = item.title.split(' ').slice(0,FOLDER_DESIG_WORDS_LEN).join(' ');
        const folderDesig = `${trimmedTitle} ${item.publishYear} [${item.bibID}]`;
        copyTextToClipboard(folderDesig);
    });
	
	resultMeta.append(resultTitle,resultYear);
	resultUrlsContainer.append(resSearchUrl,resBrowseUrl,resultDownImgsBtn,resCopyDesigBtn);
	
	resultContainer.append(resultLockBtn,resultRemovBtn,resultMeta,resultUrlsContainer, resultBibID);


	for (const page of item.pages)
	{
       const urlIsSrch = ( page.pageNumber > MAX_PREV_PAGES );

	   const pageContainer = document.createElement('div'),
	   pageHeader = document.createElement('div'),
	   pageNumber = document.createElement('div'),
	   pageUrlsContainer = document.createElement('div'),
	   pageUrl = document.createElement('a'),
	   pageContentsContainer = document.createElement('div');
	   
	   pageContainer.className = 'page-item',
	   pageHeader.className = 'page-header',
	   pageNumber.className = 'page-number',
	   pageUrlsContainer.className = 'page-urls',
	   pageUrl.className = urlIsSrch ? 'page-search-url' : 'page-browse-url',
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

    resultContainer.append(resPagesContainer);
	screenerResGrp.append(resultContainer);

    accordionize(resultContainer, resPagesContainer, "screener-res-accord");
}

function accordionize(accordEle, contentEle, groupStr) {

    accordEle.style.cursor = "pointer";

    contentEle.style.height = "0px";
    contentEle.style.overflow = "hidden";
    contentEle.style.transition = "height 0.3s ease";
    contentEle.style.cursor = "default";
    contentEle.classList.add('accordion-panel', groupStr);

    accordEle.addEventListener('click', (event) => {
     if (event.target === contentEle || contentEle.contains(event.target) || 
          event.target.tagName === 'BUTTON' || event.target.tagName === 'A') 
     {
        return;
     }

        const otherAccords = Array.from(document.querySelectorAll(`.${groupStr}`)).filter((ele) => ele !== contentEle);
        otherAccords.forEach((otherAccord) => { otherAccord.style.height = "0px"; } );
        if (contentEle.style.height === "0px") {
            contentEle.style.height = contentEle.scrollHeight + "px";
        } else {
            contentEle.style.height = "0px";
        }
    });
}


function setScraperCallBack(pageUrlEle, args)
{
	function patchUrlEle(event,args)
	{
		event.stopPropagation();
		event.preventDefault();
		scraperCallback(args);
	
	}
	
	pageUrlEle.onclick = (event) => patchUrlEle(event,args);
	
}




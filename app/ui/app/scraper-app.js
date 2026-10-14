/***********************************************
 *               IMPORTS                       *
 ***********************************************/
import { SCRAPER_PAGE_MAX_CHAR, MAX_PREV_PAGES, SNIPPET_MAX_WORDS, PAGES_DOWN, PAGES_PREFS } from '../configs/configs.js';
import { performSearch, performSearches, performScrap, getPagesNumMap, getQueryPrefix } from '../core/scraper-core.js';
import { downloadJSON, arrayFromNUMRange, Progress, operationSignal } from '../utils/utils.js';

/***********************************************
 *               Globals                       *
 ***********************************************/
let totalPagesNum  = "";
let bibID          = "";
let pageNum = "";
let queryPrefix    = "";
let pagesNumMap    = {};
const pagesCache   = [];
let totalTasks = 0;
let tasksDone = 0;
let progressObj;
 /***********************************************
 *               SELECTORS                     *
 ***********************************************/

const scraperContainer = document.getElementById('scraperContainer');
const scraperCloseBtn = document.getElementById('scraperCloseBtn');
const scraperTitle = document.getElementById('scraperTitle');
const scraperYear = document.getElementById('scraperYear');
const scraperBibID = document.getElementById('scraperBibID');
const scraperTotalPgNm = document.getElementById('scraperTotalPgNm');
const scraperSrchInput = document.getElementById('scraperSrchInput');
const scraperSrchBtn = document.getElementById('scraperSrchBtn');
const scraperKWDropList = document.getElementById('scraperKWDropList');
const scraperPageNumBtn = document.getElementById('scraperPageNumBtn');
const scraperGetPgsStartBtn = document.getElementById('scraperGetPgsStartBtn');
const scraperScrapAllBtn = document.getElementById('scraperScrapAllBtn');
const scraperOpenWeb = document.getElementById('scraperOpenWeb');
const scraperDownlJSONBtn = document.getElementById('scraperDownlJSONBtn');
const scraperDownlPDFBtn = document.getElementById('scraperDownlPDFBtn');
const scraperPageLInput = document.getElementById('scraperPageLInput');
const scraperPageRInput = document.getElementById('scraperPageRInput');
const scraperResCntr = document.getElementById('scraperResCntr');
const scraperResGrp = document.getElementById('scraperResGrp');
const scraperProgBar = document.getElementById('scraperProgBar');
const scraperProgStatus = document.getElementById('scraperProgStatus');


export function initScraper()
{

	scraperPageLInput.maxLength = scraperPageRInput.maxLength = SCRAPER_PAGE_MAX_CHAR;
    
	window.addEventListener('keydown', (e) => {

       if(e.key === 'Enter' && !scraperContainer.classList.contains("hidden"))
	   {
		  scraperSrchBtn.click();
	   }

	});

    scraperSrchBtn.addEventListener('click', async () => {	
	
		const query = scraperSrchInput.value.trim();
		const virtPageLNum = scraperPageLInput.value.trim();
        const virtPageRNum = scraperPageRInput.value.trim();

        const pages = await performSearch({ query, virtPageLNum, virtPageRNum, bibID }, pagesNumMap);

		renderResults(pages);

	});

	scraperPageNumBtn.addEventListener('click', async () => {
		  const virtPageNum = scraperPageLInput.value || scraperPageRInput.value;
		  if(virtPageNum)
		  {
				scraperSrchInput.value = pagesNumMap[virtPageNum];
		        
		  }

	});

    
	scraperGetPgsStartBtn.addEventListener('click', async () => {
        scraperPanelOff();

		const firstPageNum = MAX_PREV_PAGES + 1;
		const lastPageNum = totalPagesNum;

	    const laterPgsParams = [
		...(        arrayFromNUMRange(101 - PAGES_DOWN, lastPageNum, 1, val => ({
          					 bibID,
           					 virtPageLNum: 101,
           					 virtPageRNum: totalPagesNum,
           					 query:  `%%${val}`}))  
		    ),
		... (  PAGES_PREFS.map(pref => ({bibID,
           					 virtPageLNum: 101,
           					 virtPageRNum: totalPagesNum,    query:  `%%${pref}`}))
			)];


		const first100Pgs = await performSearch({query:"%%", bibID, virtPageLNum: firstPageNum, virtPageRNum: 100});
		const laterPages = (lastPageNum > 100) ? await performSearches(laterPgsParams) : [];

	    renderResults([...first100Pgs,...laterPages]);
		scraperPanelOn();

		const existing = new Set(laterPages.map(p => p.virtPageNum));
		const missing = [];
		for (let i = 101; i <= totalPagesNum; i++) {
			if (!existing.has(i)) missing.push(i);
		}

		if(missing.length)
		{
			alert(`Missing virtual pages: ${missing.join(', ')}`);
		}

   
	});


	scraperScrapAllBtn.addEventListener('click', async () => {
	   
  	   const resScrapBtns = scraperResGrp.querySelectorAll(".scraper-scrap-btn");
	   totalTasks = resScrapBtns.length;
	   tasksDone = 0;

	   progressObj = new Progress(totalTasks,scraperProgBar,scraperProgStatus);
	   scraperPanelOff();
	   const signal = operationSignal();
	   for (const resScrapBtn of resScrapBtns) 
		{
			 await new Promise(requestAnimationFrame);
			 if (signal.aborted) break;
 			 resScrapBtn.click();
		}

	});

/***********************************************
 *   RTL-aware transcript HTML (used for PDF)  *
 ***********************************************/
/* Thin wrapper over the module-scope builder so the panel keeps working off
   its own live state while batch jobs can build the same HTML for any bib. */
function buildTranscriptHTML(docTitle)
{
    return buildBibTranscriptHTML(docTitle, pagesCache, pagesNumMap);
}

async function makeTranscriptPDF({ saveAs })
{
    if (!pagesCache.length)
    {
        console.warn("Nothing scraped yet.");
        return null;
    }

    const res = await window.appAPI.htmlToPdf(buildTranscriptHTML(bibID), bibID, { saveAs });

    if (!res || !res.ok)
    {
        if (!res || !res.canceled) console.error("PDF generation failed:", res && res.error);
        return null;
    }

    return res.filePath;
}

scraperOpenWeb.addEventListener("click", async () => {
    try
    {
        if (!pagesCache.length)
        {
            console.warn("Nothing scraped yet.");
            return;
        }

        // Nothing is written to disk: the PDF lives in the main process and is
        // served once over loopback, so repeated previews never collide.
        const res = await window.appAPI.viewPdf(buildTranscriptHTML(bibID), bibID);

        if (!res || !res.ok) console.error("Preview failed:", res && res.error);
    }
    catch (err)
    {
        console.error(err);
    }
});

	scraperDownlJSONBtn.addEventListener('click', async () => {
        downloadJSON(pagesCache,bibID);
		
	});

	scraperDownlPDFBtn.addEventListener('click', async () => {
		await makeTranscriptPDF({ saveAs: true });
	});

	scraperCloseBtn.addEventListener('click', async() => {
		scraperContainer.classList.add("hidden");	
	});

	scraperKWDropList.addEventListener("click", function(e) {
		const query =  scraperKWDropList.value;
		if(query)
		{
			scraperSrchInput.value = query;

			scraperSrchBtn.click();


		}


	});

	

}


export async function startScraper(dataset)
{
	if(progressObj)
	{
		progressObj.resetBar();
	}


	const prevBibID = bibID;
	const prevPageNum = pageNum;

	const defQuery = dataset.defQuery ?? '',
	title = dataset.title, publishYear = dataset.publishYear;
	
	pageNum = dataset.pageNumber ?? '';
	bibID = dataset.bibID;
	totalPagesNum = dataset.totalPagesNum;

	scraperTitle.innerText = title;
	scraperBibID.innerText = bibID;
	scraperTotalPgNm.innerText = totalPagesNum;
    scraperYear.innerText  = publishYear;
	scraperSrchInput.value = defQuery;
	scraperPageLInput.value = scraperPageRInput.value = pageNum;

	scraperKWDropList.querySelectorAll("option:not([disabled])").forEach(opt => opt.remove());

    const options = JSON.parse(localStorage.getItem("scraperKeyWords")) || [];
	options.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item;
        opt.textContent = item;
        scraperKWDropList.appendChild(opt);
    });

	scraperKWDropList.value = "";
    
	scraperContainer.classList.remove("hidden");	
	
	  
    if(bibID !== prevBibID || pageNum !== prevPageNum)
	{
        scraperResGrp.innerHTML = '';
        pagesNumMap = getPagesNumMap(bibID,totalPagesNum);
		queryPrefix = getQueryPrefix(bibID);
	}  
      
	if(!scraperResGrp.innerHTML)
	{
		scraperResCntr.classList.add('hidden');	
	}



}


function renderResults(pages)
{
		
	    const snipContent = (pageContent) => pageContent.split(' ').slice(0,SNIPPET_MAX_WORDS).join(' ');
        
		pagesCache.length = 0;

		scraperResGrp.innerHTML = '';
		scraperResCntr.classList.remove('hidden');

      	for(const page of pages)
        {
              const virtPageNum    = page.virtPageNum;
              const pageContent    = page.pageContent ?? '';
			  const paperPageNum   =  pagesNumMap[virtPageNum];

              const pageCacheIndex = pagesCache.length;
              pagesCache.push(page);

              const pageSnippet    = snipContent(pageContent);

              const resultContainer = document.createElement('div'),
			  resultMeta = document.createElement('div'),
			  resultPageNumber = document.createElement('div'),
			  resultHeader = document.createElement('div'),
			  resultBtnsContainer = document.createElement('div'),
			  resultScrapBtn = document.createElement('button'),
			  resultGetPgNBtn = document.createElement('button'),
			  resultContent= document.createElement('div');

			  resultContainer.className = 'scraper-res-item',
			  resultMeta.className = 'scraper-res-meta',
			  resultPageNumber.className = 'scraper-res-pagenum',
			  resultHeader.className = 'scraper-res-header',
			  resultBtnsContainer.className = 'scraper-btn-container';
			  resultGetPgNBtn.className = 'scraper-getpg-btn',
			  resultScrapBtn.className = 'scraper-scrap-btn',
			  resultContent.className = "scraper-res-content";

			  resultPageNumber.innerText = virtPageNum;
			  resultHeader.innerText     = pageSnippet;
              resultContent.innerText    = pageContent;

			    resultMeta.addEventListener('click',  async () => {
				 	const accordClosed = !resultContent.classList.contains("open");
                 	const allAccords = scraperResGrp.querySelectorAll(".scraper-res-content");
				 	allAccords.forEach(accord => accord.classList.remove("open"));                
				 	if(accordClosed)
					{
					
						resultContent.classList.add("open");
					} 			  	  
			    });

			    resultScrapBtn.addEventListener('click', async (e) => {
				 	e.stopPropagation();
                	 const _yield = await performScrap(pageContent, virtPageNum, bibID); 
					 pagesCache[pageCacheIndex].pageContent = _yield;                      
					 resultContent.innerText = _yield;

					 if(totalTasks)
					 {
						 ++tasksDone;
					 	console.log(`Done ${tasksDone} out of ${totalTasks} pages.`);
					 	progressObj.progress(1);
					 	if(tasksDone === totalTasks)
					 	{
							totalTasks = 0;

							scraperPanelOn();
					 	}
					 }


				});

			  resultGetPgNBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
				  
				  scraperSrchInput.value = paperPageNum;
              });

              resultBtnsContainer.append(resultGetPgNBtn,resultScrapBtn);
			  resultMeta.append(resultPageNumber,resultHeader,resultBtnsContainer);
			  resultContainer.append(resultMeta,resultContent);
              scraperResGrp.append(resultContainer);
		}

}

/* Stop (from either Stop button) unlocks the panel and drops the pending count. */
window.addEventListener('eulc-stopped', () => {
	totalTasks = 0;
	tasksDone = 0;
	scraperPanelOn();
	scraperProgStatus.textContent = 'Stopped.';
});

function scraperPanelOff()
{
	scraperContainer.classList.add("scraper-overlay");
}

function scraperPanelOn()
{
	scraperContainer.classList.remove("scraper-overlay");
}

/***********************************************
 *   TRANSCRIPT HTML (reusable, state-free)    *
 ***********************************************/

function escapeHTML(str)
{
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function buildBibTranscriptHTML(docTitle, pagesArr, numMap = {})
{
    const pages = pagesArr.map((page, index) => {

        const pageNum = String(numMap[page.virtPageNum] ?? (index + 1)).slice(0, 11);

        return `<section class="pg">
  <div class="pgnum">${escapeHTML(pageNum)}</div>
  <div class="txt">${escapeHTML(page.pageContent)}</div>
</section>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHTML(docTitle)}</title>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Traditional Arabic", "Simplified Arabic", "Arabic Typesetting",
                 "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 16pt;
    line-height: 1.8;
    color: #000;
    direction: rtl;
    text-align: justify;
  }
  .pg { break-after: page; page-break-after: always; }
  .pg:last-child { break-after: auto; page-break-after: auto; }
  .pgnum {
    direction: ltr; text-align: left; unicode-bidi: isolate;
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt; color: #555; margin-bottom: 10px;
  }
  .txt { white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/***********************************************
 *        HEADLESS (BATCH) SCRAPING API        *
 *  Same work the panel buttons do, minus the  *
 *  panel: no module globals, no DOM, no alert.*
 ***********************************************/

/* Equivalent of pressing "Get Pages Start": sweeps the whole bib for page
   snippets and returns them ordered 15..N. */
export async function getBibPages(_bibID, _totalPagesNum)
{
	const lastPageNum  = Number(_totalPagesNum);
	const firstPageNum = MAX_PREV_PAGES + 1;

	const first100Pgs = await performSearch({
		query: "%%",
		bibID: _bibID,
		virtPageLNum: firstPageNum,
		virtPageRNum: 100
	});

	if (!(lastPageNum > 100))
	{
		return first100Pgs;
	}

	const laterPgsParams = [
		...arrayFromNUMRange(101 - PAGES_DOWN, lastPageNum, 1, val => ({
			bibID: _bibID,
			virtPageLNum: 101,
			virtPageRNum: lastPageNum,
			query: `%%${val}`
		})),
		...PAGES_PREFS.map(pref => ({
			bibID: _bibID,
			virtPageLNum: 101,
			virtPageRNum: lastPageNum,
			query: `%%${pref}`
		}))
	];

	const laterPages = await performSearches(laterPgsParams);

	return [...first100Pgs, ...laterPages];
}

/* Which of the 101..N pages the sweep above never surfaced. */
export function getMissingPages(pagesArr, _totalPagesNum)
{
	const found = new Set(pagesArr.map(page => page.virtPageNum));
	const missing = [];

	for (let i = 101; i <= Number(_totalPagesNum); i++)
	{
		if (!found.has(i)) missing.push(i);
	}

	return missing;
}

/* Equivalent of pressing "Scrap results": expands every snippet into its full
   page text, in place, one page at a time (same pacing as the button loop). */
export async function scrapBibPages(_bibID, pagesArr, onPageDone)
{
	for (const page of pagesArr)
	{
		page.pageContent = await performScrap(page.pageContent, page.virtPageNum, _bibID);

		if (onPageDone)
		{
			onPageDone(page);
		}
	}

	return pagesArr;
}

/* "Get Pages Start" followed by "Scrap results", for one bib, headless. */
export async function scrapBibFully({ bibID: _bibID, totalPagesNum: _totalPagesNum }, onPageDone, onPagesFound)
{
	const pagesNumMapping = getPagesNumMap(_bibID, _totalPagesNum);
	const pagesArr = await getBibPages(_bibID, _totalPagesNum);
	onPagesFound?.(pagesArr.length);

	await scrapBibPages(_bibID, pagesArr, onPageDone);

	return {
		pages: pagesArr,
		pagesNumMap: pagesNumMapping,
		missingPages: getMissingPages(pagesArr, _totalPagesNum)
	};
}

/***********************************************
 *               IMPORTS                       *
 ***********************************************/
import {
    ArrayProcessor,
    arrayFromNUMRange,
    orchestrateFetch,
    eulcFetch,
    URLER,
    getTextWithLineBreaks
}
from '../utils/utils.js';
import { URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES, MAX_PREV_PAGES } from '../configs/configs.js';
import { search } from './search.js';

/***********************************************
 *               CONSTANTS                     *
 ***********************************************/
const urler = new URLER(URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES);

/***********************************************
 *               GLOBALS                       *
 ***********************************************/
let progressObj;

/***********************************************
 *               FUNCTIONS                     *
 ***********************************************/
/* Export functions */
export async function getLib(queryWords, yearsStart, yearsEnd, minPagesLen, renderCb)
{
    function getSlotEle(rows, labelStr, multiple = false)
    {
       if(!multiple)
       {
            const row = Array.from(rows).find((r) => r.querySelector("b")?.textContent?.trim()?.includes(labelStr));
            return row?.querySelector("td:nth-child(2)");
       }
       else
       {
            const mRows = Array.from(rows).filter((r) => r.querySelector("b")?.textContent?.trim()?.includes(labelStr));
            return mRows;
       }
       

    }

    let lastUrl = "";
    let resultNum = 0;
    try
    {
 
     const url = urler.get('LIBRARY', queryWords[0], queryWords[1], queryWords[2], yearsStart, yearsEnd);
  
     const response = await eulcFetch(url);
     const html = await response.text();
     const doc = new DOMParser().parseFromString(html, "text/html");

     const results = doc.querySelectorAll("#ToPrint > table:has(a.NoPrint)");

     for (const result of results)
     {
        
        const bibID = result.querySelector("tbody > tr:nth-child(1) > td:nth-child(1) > input[type=checkbox]").value;
        const title = getTextWithLineBreaks(result.querySelector("tbody > tr:nth-child(1) > td:nth-child(2) > div:nth-child(2) > a"))?.replaceAll("\n", " ")?.replaceAll("/", " ")?.replaceAll("\\", " ")?.replaceAll("   ", " ")?.trim() || "";

        const detailsURL = urler.get('LIB_DETAILS', bibID);
        lastUrl = detailsURL;
        const responseII = await eulcFetch(detailsURL);
        const htmlII = await responseII.text();
        const detailsTab = new DOMParser().parseFromString(htmlII, "text/html");
        const detailsTabRows = detailsTab.querySelectorAll("tr");

        const publishYearEle = getSlotEle(detailsTabRows,"تاريخ النشر");
        const publishYear = publishYearEle ? ( publishYearEle.textContent.trim() ).match(/\d+/)?.[0] ?? ''
        : '';

        const totalPagesNumEle = getSlotEle(detailsTabRows,"الحجم");
        const totalPagesNum = totalPagesNumEle ? ( totalPagesNumEle.textContent.trim() ).match(/\d+/)?.[0] ?? ''
        : '';

        const summaryEles = getSlotEle(detailsTabRows,"ملخص",true);
        const summary = summaryEles.length ? summaryEles.map((summaryEle) => summaryEle.textContent
         .replace(/\\[nrtfv]/g, ' ')   
         .replace(/[\r\n\t]+/g, ' ')  
         .replace(/\s{2,}/g, ' ')     
         .trim()).join('\n') : '';


        if(totalPagesNum >= minPagesLen && (publishYear >= yearsStart && publishYear <= yearsEnd))
        {
            resultNum++;
            renderCb({bibID, title, publishYear, totalPagesNum, summary});
        }     
         
     }

        }
        catch (error)
        {
            window.reportAppError?.(error);
            throw error;
        }

     return resultNum;

}
export async function getBibs(bibIDs, queryWords, startYear, endYear, startPage, endPage, _progressObj, renderCb)
{
	
    progressObj = _progressObj;
	
	const arrayProcessor = new ArrayProcessor(getBib, bibIDs, queryWords, startYear, endYear, startPage, endPage);
	
	if(renderCb)
	{
		arrayProcessor.setCallBack(renderCb);
	}
	
	
	const results = await arrayProcessor.process();
	return results.length;

}

export async function getPrevImgBlobObjs(bibID)
{
     const pageNumbers = arrayFromNUMRange(1,MAX_PREV_PAGES);
     const arrayProcessor = new ArrayProcessor(getPrevImgBlobObj,pageNumbers,bibID);
     const blobs = await arrayProcessor.process();
     return blobs;
}

/* Core Functions */

async function getPrevImgBlobObj(pageNumber,bibID)
{     
      const url = urler.get('IMAGE', pageNumber) + bibID;
      const response = await orchestrateFetch(url);

      const blob = await response.blob();
      return  {pageNumber, blob};
}

async function getBib(bibID, queryWords, startYear, endYear, startPage, endPage) {

    try {
    const arrayProcessor = new ArrayProcessor(getThesisSnippet, queryWords, bibID, startPage, endPage);
    const snippetsArr = await arrayProcessor.process();
    if (snippetsArr.length === queryWords.length) {
        const matchedSnippets = new Map();
        for (const snippets of snippetsArr) {
            for (const [pageNumber, pageSnippet] of snippets.entries()) {
                if (!matchedSnippets.has(pageNumber)) {
                    matchedSnippets.set(pageNumber, [pageSnippet]);
                } else {
                    const pageI = matchedSnippets.get(pageNumber);
                    pageI.push(pageSnippet);
                }
            }
        }
        for (const [pageNumber, pageSnippets] of matchedSnippets.entries()) {
            if (pageSnippets.length < queryWords.length) {
                matchedSnippets.delete(pageNumber);
            }
        }
        if (matchedSnippets.size) {
            const {
                title,
                publishYear,
                totalPagesNum
            } = await getThesisMeta(bibID);


            if ((title && publishYear && totalPagesNum) && publishYear >= startYear && publishYear <= endYear) {
                return {
                    bibID,
                    title,
                    publishYear,
                    totalPagesNum,
                    pages: matchedSnippets
                };
            }
        }
  
    
        }
    }
    finally
    {
        progressObj.progress(queryWords.length);
    }
}


async function getThesisMeta(bibID) {
    try {
        const url = urler.get('BROWSE') + bibID;
        const response = await orchestrateFetch( url);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const html = await response.text();
        if (!html)
        {
            const err = new Error("HTML error: empty document");
            err.code = 1001;
            throw err;
        }

        const doc = new DOMParser().parseFromString(html, "text/html");

        const title = getTextWithLineBreaks(doc.querySelector("#ContentTitle"))?.replaceAll("\n", " ")?.replace("/", " ")?.replace("   ", " ")?.trim() || "";
        const publishYear = doc.querySelector("#ContentPublishDate")?.textContent?.split(".")?.[0]?.trim() || "";
        const totalPagesNum = doc.querySelector("body > table > tbody > tr:nth-child(2) > td:nth-child(2) > div:nth-child(2) > table:nth-child(2) > tbody > tr > td:nth-child(5)")?.textContent || "";

        return {
            title,
            publishYear,
            totalPagesNum
        };

    } 
    catch (error) {
        if(error.code !== 1001) // "HTML error: empty document"
        {
            console.error("fetchThesisData:", error);
        }
        
        return {
            title: '',
            publishYear: '',
            totalPagesNum: ''
        };
    }
}


async function getThesisSnippet(query, bibID, startPage, endPage) 
{          
    const snippets = await search(query, bibID, startPage, endPage);
    return snippets;
}


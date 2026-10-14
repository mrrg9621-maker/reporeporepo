/***********************************************
 *               IMPORTS                       *
 ***********************************************/
import {
    ArrayProcessor,
    arrayFromNUMRange,
    orchestrateFetch,
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

/* A page/thesis matches when it satisfies every required query; with no
   required query it must satisfy at least one optional query. Optional
   queries never exclude anything once a required query exists. */
export function matchesQueries(hits, queries)
{
    const required = queries.filter(q => q.must);
    if (required.length) return required.every(q => hits.has(q));
    return queries.some(q => hits.has(q));
}

/* Library builder: one EULC catalogue request per query, BibID sets
   combined with matchesQueries, then each surviving thesis' catalogue
   record is fetched (paced) for year, size and abstract. Rendering keeps
   the order EULC returned. */
export async function getLib({ queries, field = '0.', years, pages = {}, eulc = {} }, progressObj, renderCb)
{
    function getSlotEle(rows, labelStr, multiple = false)
    {
       const matching = Array.from(rows).filter((r) => r.querySelector("b")?.textContent?.trim()?.includes(labelStr));
       return multiple ? matching : matching[0]?.querySelector("td:nth-child(2)");
    }

    const yearParam = years.start || years.end
        ? (years.start && years.end && years.start !== years.end ? `${years.start}-${years.end}` : (years.start || years.end))
        : '';

    // One catalogue request per query
    const lists = await Promise.all(queries.map(async (query) => {
        const url = urler.get('LIBRARY', { ...eulc, text: query.text, field: query.field || field, years: yearParam });
        const response = await orchestrateFetch(url);
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const found = [];
        for (const result of doc.querySelectorAll("#ToPrint > table:has(a.NoPrint)"))
        {
            const bibID = result.querySelector("tbody > tr:nth-child(1) > td:nth-child(1) > input[type=checkbox]")?.value;
            if (!bibID) continue;
            const titleEle = result.querySelector("tbody > tr:nth-child(1) > td:nth-child(2) > div:nth-child(2) > a");
            const title = (titleEle ? getTextWithLineBreaks(titleEle) : '').replaceAll("\n", " ").replaceAll("/", " ").replaceAll("\\", " ").replace(/\s{2,}/g, " ").trim();
            found.push({ bibID, title });
        }
        return { query, found };
    }));

    // Combine the BibID sets, keeping first-seen order
    const hitsByBib = new Map();
    for (const { query, found } of lists)
    {
        for (const item of found)
        {
            if (!hitsByBib.has(item.bibID)) hitsByBib.set(item.bibID, { item, hits: new Set() });
            hitsByBib.get(item.bibID).hits.add(query);
        }
    }
    const candidates = [...hitsByBib.values()].filter(({ hits }) => matchesQueries(hits, queries)).map(({ item }) => item);

    progressObj?.setTotal(candidates.length);

    const minPages = Number(pages.min) || 0;
    const maxPages = Number(pages.max) || Infinity;
    const minYear = Number(years.start) || 0;
    const maxYear = Number(years.end) || Infinity;

    // Details are fetched in parallel but rendered in catalogue order
    const settled = new Array(candidates.length);
    let nextToRender = 0;
    let resultNum = 0;
    const flush = () => {
        while (nextToRender < settled.length && settled[nextToRender] !== undefined)
        {
            const record = settled[nextToRender++];
            if (record) { resultNum++; renderCb(record); }
        }
    };

    await Promise.all(candidates.map(async ({ bibID, title }, index) => {
        try
        {
            const response = await orchestrateFetch(urler.get('LIB_DETAILS', bibID));
            const detailsTab = new DOMParser().parseFromString(await response.text(), "text/html");
            const rows = detailsTab.querySelectorAll("tr");

            const publishYear = getSlotEle(rows, "تاريخ النشر")?.textContent.trim().match(/\d+/)?.[0] ?? '';
            const totalPagesNum = getSlotEle(rows, "الحجم")?.textContent.trim().match(/\d+/)?.[0] ?? '';
            const summary = getSlotEle(rows, "ملخص", true).map((row) => (row.querySelector("td:nth-child(2)") ?? row).textContent
                .replace(/\\[nrtfv]/g, ' ')
                .replace(/[\r\n\t]+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim()).join('\n');

            const year = Number(publishYear);
            const size = Number(totalPagesNum) || 0;
            const eligible = size >= minPages && size <= maxPages &&
                (!publishYear || (year >= minYear && year <= maxYear));

            settled[index] = eligible ? { bibID, title, publishYear, totalPagesNum, summary } : null;
        }
        catch (error)
        {
            console.error(`BibID ${bibID}: catalogue record failed`, error);
            settled[index] = null;
        }
        finally
        {
            progressObj?.progress(1);
            flush();
        }
    }));

    return resultNum;
}
export async function getBibs(bibIDs, queries, startYear, endYear, startPage, endPage, _progressObj, renderCb)
{
    progressObj = _progressObj;

    const arrayProcessor = new ArrayProcessor(getBib, bibIDs, queries, startYear, endYear, startPage, endPage);

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

async function getBib(bibID, queries, startYear, endYear, startPage, endPage) {

    try {
        // One transcript search per query; each yields Map(pageNumber -> snippet)
        const snippetsArr = await Promise.all(queries.map(query => search(query.text, bibID, startPage, endPage)));

        const pagesHits = new Map();
        snippetsArr.forEach((snippets, queryIndex) => {
            for (const [pageNumber, pageSnippet] of snippets.entries()) {
                if (!pagesHits.has(pageNumber)) pagesHits.set(pageNumber, new Map());
                pagesHits.get(pageNumber).set(queries[queryIndex], pageSnippet);
            }
        });

        const matchedSnippets = new Map();
        for (const pageNumber of [...pagesHits.keys()].sort((a, b) => a - b)) {
            const hits = pagesHits.get(pageNumber);
            if (matchesQueries(hits, queries)) {
                matchedSnippets.set(pageNumber, queries.filter(q => hits.has(q)).map(q => hits.get(q)));
            }
        }

        if (matchedSnippets.size) {
            const {
                title,
                publishYear,
                totalPagesNum
            } = await getThesisMeta(bibID);

            if ((title && publishYear && totalPagesNum) && Number(publishYear) >= Number(startYear) && Number(publishYear) <= Number(endYear)) {
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
    finally
    {
        progressObj.progress(queries.length);
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


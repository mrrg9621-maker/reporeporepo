/***********************************************
 *               IMPORTS                       *
 ***********************************************/
import {
    ArrayProcessor,
    arrayFromNUMRange,
    orchestrateFetch,
    eulcFetch,
    operationSignal,
    throwIfStopped,
    URLER,
    getTextWithLineBreaks
}
from '../utils/utils.js';
import { URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES, MAX_PREV_PAGES, MIN_YEAR } from '../configs/configs.js';
import { search } from './search.js';

/***********************************************
 *               CONSTANTS                     *
 ***********************************************/
const urler = new URLER(URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES);
const CATALOGUE_CONCURRENCY = 2;
const CATALOGUE_TIMEOUT_MS = 180000;
const CATALOGUE_ATTEMPTS = 2;
const CATALOGUE_PROBE_SIZE = 10;            // rows in a counting request
const CATALOGUE_PROBE_TIMEOUT_MS = 90000;
const CATALOGUE_CHUNK = 400;                // most matches fetched in one request
const CATALOGUE_CONFIRM_ABOVE = 2000;       // ask before collecting more theses than this
const CATALOGUE_MAX_BIBID = 99999999;
const CATALOGUE_UNKNOWN_PAGE_SIZE = 100000000;

/***********************************************
 *               GLOBALS                       *
 ***********************************************/
let progressObj;
let searchSignal;

/***********************************************
 *               FUNCTIONS                     *
 ***********************************************/
/* Export functions */

/* A page/thesis matches when it satisfies every required query; with no
   required query it must satisfy at least one optional query. Optional
   queries never exclude anything once a required query exists. */
/* Each query is AND, OR or NOT. Older parameters stored must (true = AND,
   false = OR). */
export function queryOp(query)
{
    if (query?.op === 'and' || query?.op === 'or' || query?.op === 'not') return query.op;
    return query?.must === false ? 'or' : 'and';
}

/* A match needs every AND query, at least one OR query (when there are
   any) and no NOT query. */
export function matchesQueries(hits, queries)
{
    const of = (op) => queries.filter(q => queryOp(q) === op);
    const ors = of('or');
    return of('and').every(q => hits.has(q)) && (!ors.length || ors.some(q => hits.has(q))) && !of('not').some(q => hits.has(q));
}

/* EULC's catalogue form takes 3 search boxes joined left to right by
   opr1/opr2 (and | or | and not); boxes 4+ are ignored. Up to 3 queries
   fit one request: OR queries first, then AND, then NOT, which evaluates
   as ((o1 or o2) and a1) and not n1. More queries are packed 3 per request
   by kind, NOT queries riding in spare boxes where they can, and the BibID
   sets are combined. */
export const EULC_BOXES = 3;
export function planCatalogueRequests(queries)
{
    const of = (op) => queries.filter(q => queryOp(q) === op);
    const [ands, ors, nots] = [of('and'), of('or'), of('not')];
    // Same number of requests as filling boxes in order, but spread evenly
    // (4 terms → 2 + 2) so NOT terms find spare boxes
    const chunk = (list) => {
        const count = Math.ceil(list.length / EULC_BOXES);
        return Array.from({ length: count }, (_, i) => list.slice(Math.round(i * list.length / count), Math.round((i + 1) * list.length / count)));
    };
    const joiner = { and: 'and', or: 'or', not: 'and not' };

    if (queries.length <= EULC_BOXES) {
        const slots = [...ors, ...ands, ...nots];
        const ops = slots.slice(1).map(next => joiner[queryOp(next)]);
        return [{ role: 'all', slots, ops }];
    }
    const andPlans = chunk(ands).map(slots => ({ role: 'and', slots, ops: slots.slice(1).map(() => 'and') }));
    const orPlans = chunk(ors).map(slots => ({ role: 'or', slots, ops: slots.slice(1).map(() => 'or') }));

    // A NOT term rides in a spare box as "and not": in one AND request (the
    // final result is an intersection, so once is enough) or else in every OR
    // request. Only NOT terms that fit nowhere get their own exclusion request.
    const leftover = [];
    for (const not of nots) {
        const andPlan = andPlans.find(plan => plan.slots.length < EULC_BOXES);
        if (andPlan) { andPlan.slots.push(not); andPlan.ops.push('and not'); continue; }
        if (!andPlans.length && orPlans.length && orPlans.every(plan => plan.slots.length < EULC_BOXES)) {
            for (const plan of orPlans) { plan.slots.push(not); plan.ops.push('and not'); }
            continue;
        }
        leftover.push(not);
    }
    return [
        ...andPlans,
        ...orPlans,
        ...chunk(leftover).map(slots => ({ role: 'not', slots, ops: slots.slice(1).map(() => 'or') }))
    ];
}

/* Final BibID order follows the first request that returned each BibID. */
function combineCatalogueResults(results)
{
    const all = results.filter(r => r.plan.role === 'all');
    if (all.length) return all[0].found;

    const order = new Map();
    for (const { plan, found } of results) {
        if (plan.role === 'not') continue;
        for (const item of found) if (!order.has(item.bibID)) order.set(item.bibID, item);
    }

    const sets = (role) => results.filter(r => r.plan.role === role).map(r => new Set(r.found.map(i => i.bibID)));
    const [andSets, orSets, notSets] = [sets('and'), sets('or'), sets('not')];
    return [...order.values()].filter(({ bibID }) =>
        andSets.every(set => set.has(bibID)) &&
        (!orSets.length || orSets.some(set => set.has(bibID))) &&
        !notSets.some(set => set.has(bibID)));
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

    // EULC renders every match of a search into one page, and a broad search
    // (tens of thousands of theses) never finishes. So each request is first
    // counted with a 10-row page (fast), and any search with more than
    // CATALOGUE_CHUNK matches is split by publication year, then by BibID
    // range, until every part is small enough to fetch whole. At most
    // CATALOGUE_CONCURRENCY requests run at once, each with one retry; any
    // request that still fails stops the search, since a missing part would
    // make the result wrong.
    const signal = operationSignal();
    const plans = planCatalogueRequests(queries);
    const gate = createGate(CATALOGUE_CONCURRENCY, signal);
    let requestsDone = 0;
    const status = (text) => progressObj?.status(text);

    const userYears = years.start || years.end
        ? [Number(years.start) || MIN_YEAR, Number(years.end) || new Date().getFullYear()]
        : null;
    const bibMatch = String(eulc.bibRange || '').trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    const userBibs = bibMatch ? [Number(bibMatch[1]), Number(bibMatch[2] ?? bibMatch[1])] : null;
    const canSplitBibs = !eulc.bibRange || Boolean(bibMatch);

    const rangeParam = (range) => range ? (range[0] === range[1] ? String(range[0]) : `${range[0]}-${range[1]}`) : '';

    async function request(plan, yearRange, bibRange, pageSize, timeout)
    {
        const url = urler.get('LIBRARY', {
            ...eulc,
            slots: plan.slots.map(q => ({ text: q.text, field: q.field || field })),
            ops: plan.ops,
            years: yearRange ? rangeParam(yearRange) : yearParam,
            bibRange: bibRange ? rangeParam(bibRange) : (eulc.bibRange || ''),
            pageSize
        });
        let lastError;
        for (let attempt = 1; attempt <= CATALOGUE_ATTEMPTS; attempt++)
        {
            try
            {
                const response = await gate(() => eulcFetch(url, { timeout, signal }));
                const html = await response.text();
                requestsDone++;
                return html;
            }
            catch (error)
            {
                if (signal.aborted) throw error;
                lastError = error;
                const retryable = !error.status || error.status === 502 || error.status === 503 || error.status === 504;
                if (!retryable) break;
                console.warn(`Catalogue request failed (attempt ${attempt} of ${CATALOGUE_ATTEMPTS})`, url, error);
            }
        }
        const terms = plan.slots.map(q => `"${q.text}"`).join(', ');
        const part = [yearRange && `years ${rangeParam(yearRange)}`, bibRange && `BibIDs ${rangeParam(bibRange)}`].filter(Boolean).join(', ');
        throw new Error(`The catalogue search for ${terms}${part ? ` (${part})` : ''} failed after ${CATALOGUE_ATTEMPTS} attempts. ${lastError.message}`, { cause: lastError });
    }

    // Count, and split until each part has at most CATALOGUE_CHUNK matches.
    // Parts come back in year/BibID order.
    async function explore(plan, yearRange, bibRange)
    {
        status(`Counting catalogue matches… (${requestsDone} requests so far)`);
        const html = await request(plan, yearRange, bibRange, CATALOGUE_PROBE_SIZE, CATALOGUE_PROBE_TIMEOUT_MS);
        const count = parseCatalogueCount(html);
        if (count === 0) return [];
        if (count !== null && count <= CATALOGUE_PROBE_SIZE) return [{ plan, yearRange, bibRange, count, html }];
        if (count === null || count <= CATALOGUE_CHUNK) return [{ plan, yearRange, bibRange, count }];

        const years = yearRange ?? [MIN_YEAR, new Date().getFullYear()];
        if (years[0] < years[1]) {
            const mid = Math.floor((years[0] + years[1]) / 2);
            const halves = await Promise.all([explore(plan, [years[0], mid], bibRange), explore(plan, [mid + 1, years[1]], bibRange)]);
            return halves.flat();
        }
        const bibs = bibRange ?? userBibs ?? [1, CATALOGUE_MAX_BIBID];
        if (canSplitBibs && bibs[0] < bibs[1]) {
            // BibIDs span millions and cluster, so split 8 ways to get there in few rounds
            const step = Math.ceil((bibs[1] - bibs[0] + 1) / 8);
            const slices = [];
            for (let lo = bibs[0]; lo <= bibs[1]; lo += step) slices.push([lo, Math.min(lo + step - 1, bibs[1])]);
            const parts = await Promise.all(slices.map(slice => explore(plan, years, slice)));
            return parts.flat();
        }
        return [{ plan, yearRange: years, bibRange, count }];
    }

    const partsByPlan = await Promise.all(plans.map(plan => explore(plan, userYears, null)));
    const parts = partsByPlan.flat();
    // NOT parts are only an exclusion list: they need no details requests
    const total = parts.filter(part => part.plan.role !== 'not').reduce((sum, part) => sum + (part.count ?? 0), 0);

    if (total > CATALOGUE_CONFIRM_ABOVE && !confirm(
        `EULC reports about ${total.toLocaleString()} matching theses for these queries.\n\n` +
        `Each one needs its own catalogue-details request, so this can take a long time. ` +
        `Narrow the queries or years to make it faster.\n\nContinue anyway?`)) {
        throw new DOMException('Cancelled by the user', 'AbortError');
    }

    // Fetch every part whose rows are not already in hand
    const toFetch = parts.filter(part => !part.html);
    let fetched = 0;
    const reportFetch = () => status(toFetch.length
        ? `Fetching catalogue results: part ${fetched} of ${toFetch.length} done (≈${total.toLocaleString()} theses)…`
        : 'Reading catalogue results…');
    reportFetch();
    await Promise.all(toFetch.map(async (part) => {
        part.html = await request(part.plan, part.yearRange, part.bibRange,
            part.count === null ? CATALOGUE_UNKNOWN_PAGE_SIZE : part.count + CATALOGUE_PROBE_SIZE, CATALOGUE_TIMEOUT_MS);
        fetched++;
        reportFetch();
    }));

    const results = plans.map((plan, index) => {
        const seen = new Set();
        const found = [];
        for (const part of partsByPlan[index]) {
            for (const item of parseCatalogue(part.html)) {
                if (!seen.has(item.bibID)) { seen.add(item.bibID); found.push(item); }
            }
        }
        return { plan, found };
    });

    const candidates = combineCatalogueResults(results);

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
            const response = await orchestrateFetch(urler.get('LIB_DETAILS', bibID), { signal });
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
            if (!signal.aborted) console.error(`BibID ${bibID}: catalogue record failed`, error);
            settled[index] = null;
        }
        finally
        {
            progressObj?.progress(1);
            flush();
        }
    }));

    throwIfStopped(signal);
    return { resultNum, requests: requestsDone };
}

function parseCatalogue(html)
{
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = [];
    for (const result of doc.querySelectorAll("#ToPrint > table:has(a.NoPrint)"))
    {
        const bibID = result.querySelector("tbody > tr:nth-child(1) > td:nth-child(1) > input[type=checkbox]")?.value;
        if (!bibID) continue;
        const titleEle = result.querySelector("tbody > tr:nth-child(1) > td:nth-child(2) > div:nth-child(2) > a");
        const title = (titleEle ? getTextWithLineBreaks(titleEle) : '').replaceAll("\n", " ").replaceAll("/", " ").replaceAll("\\", " ").replace(/\s{2,}/g, " ").trim();
        found.push({ bibID, title });
    }
    return found;
}

/* "تم العثور علي : 2481" on every result page; null when absent. */
function parseCatalogueCount(html)
{
    const match = html.match(/تم العثور علي\s*:\s*([\d,]+)/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
}

/* Runs at most `limit` tasks at once; queued tasks are dropped on Stop. */
function createGate(limit, signal)
{
    let active = 0;
    const queue = [];
    const next = () => {
        while (active < limit && queue.length) {
            const { task, resolve, reject } = queue.shift();
            if (signal.aborted) { reject(signal.reason); continue; }
            active++;
            task().then(resolve, reject).finally(() => { active--; next(); });
        }
    };
    return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

export async function getBibs(bibIDs, queries, startYear, endYear, startPage, endPage, _progressObj, renderCb)
{
    progressObj = _progressObj;
    searchSignal = operationSignal();

    const arrayProcessor = new ArrayProcessor(getBib, bibIDs, queries, startYear, endYear, startPage, endPage);

    if(renderCb)
    {
        arrayProcessor.setCallBack(renderCb);
    }

    const results = await arrayProcessor.process();
    throwIfStopped(searchSignal);
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
                matchedSnippets.set(pageNumber, queries.filter(q => queryOp(q) !== 'not' && hits.has(q)).map(q => hits.get(q)));
            }
        }

        if (matchedSnippets.size) {
            throwIfStopped(searchSignal);
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
        const response = await orchestrateFetch(url, { signal: searchSignal });
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


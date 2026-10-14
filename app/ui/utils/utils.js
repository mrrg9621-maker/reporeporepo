
/***********************************************
 *               TIME UTILITIES                *
 ***********************************************/

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function printRunningTime(executionTime) {
    const endTime = Date.now();
    const elapsedTime = endTime - executionTime;
    const elapsedTimeInSeconds = elapsedTime / 1000;
    console.log("Took: ", elapsedTimeInSeconds, " seconds.");
}

export function getTimeStamp()
{
	const now = new Date();
	const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
	return localTime.toISOString().slice(0, 23).replace('T', ' ');
}
/***********************************************
 *               ARRAY UTILS             	   *
 ***********************************************/
export class ArrayProcessor
{
	
	static isValidResult(result)
	{
		
		return ( result != null && !(Array.isArray(result) && result.length === 0) &&
		!(result instanceof Map && result.size === 0) );
		
	}
	
	static wrapValidator(fn) {
	    return async function (...args) {
	        const [result] = args;
	        if (ArrayProcessor.isValidResult(result)) {
	            return await fn(...args);
	        }
	    };
	}
	
	constructor(processor, subjects, ...objects) 
	{
		this.callBackRef = {callBack: null};
		
		if (typeof processor !== 'function') 
		{
			throw new Error('Provided processor is not a function');
		}
	
	
		if (!Array.isArray(subjects) || !subjects.length) 
		{
			throw new Error('Subjects should be an array of valid length');
		}
		
        const prePromises = [];
        subjects.forEach( subject => {
            subject = Array.isArray(subject) ? subject  :  [subject] ;
            prePromises.push(() => processor(...subject, ...objects));

		
		});
	
		this.prePromises = prePromises;

	}
	
	setCallBack(callBack)
	{
		this.callBackRef.callBack = ArrayProcessor.wrapValidator(callBack);
	}
	
	async process()
	{
		const callBack = this.callBackRef.callBack;
		const prePromises = this.prePromises;
		const promises = prePromises.map(fn => fn());
		const results = await promiseAllCb(promises,callBack);
		return results.filter(result =>  ArrayProcessor.isValidResult(result));
		
	}
	
}

export function arrayFromNUMRange(start, end, step = 1, wrapFn = function(val) {return val;})
{

  step = start <= end ? step : step * -1;
  const length = Math.floor((end - start) / step) + 1;
  return Array.from({ length }, (_, i) => wrapFn(start + i * step)).filter(entry => entry);
	
}


export function removeDupesFromArr(arr) {
    const seen = new Set();
    return arr.filter(item => {
        const key = JSON.stringify(item);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}

/***********************************************
 *          PATCHS/WRAPS/HOOKS UTILITIES       *
 ***********************************************/

async function promiseAllCb(promises, callBack) {
  const wrappedPromises = promises.map(p =>
    p.then(result => {
	  if(callBack)
	  {
		callBack(result);
	  }
      return result;         
    })
  );

  const results = await Promise.all(wrappedPromises);
  return results;
}


/***********************************************
 *          PROGRESS                           *
 ***********************************************/

/* Progress */
export class Progress
{
  
	constructor(totalItems, progressBarEle, progressStatusEle) 
	{
	    this.currentItems = 0;
        this.totalItems = totalItems;
        this.progressBarEle = progressBarEle;
        this.progressStatusEle = progressStatusEle;
	    this.progress(0);
	}
  
	progress(operand)
	{
	
		const currentItems = ( this.currentItems += operand, this.currentItems );
		const totalItems = this.totalItems;
        const progressBarEle = this.progressBarEle;
        const progressStatusEle = this.progressStatusEle;
        
        const progress = (currentItems / totalItems) * 100;
        progressBarEle.style.width = `${progress}%`;
        progressStatusEle.textContent = `Processed ${currentItems} of ${totalItems} items (${Math.floor(progress)}%)`;
		
	}

    setTotal(totalItems)
    {
        this.totalItems = totalItems;
        if (!totalItems) {
            this.progressBarEle.style.width = '100%';
            this.progressStatusEle.textContent = 'Nothing to process';
            return;
        }
        this.progress(0);
    }

    resetBar()
    {
         const progressBarEle = this.progressBarEle;
         const progressStatusEle = this.progressStatusEle;

         progressBarEle.style.width = `0%`;
         progressStatusEle.textContent = ``;

    }


	
	
};

/***********************************************
 *          FILES UTILITIES      			   *
 ***********************************************/
import { zipSync, unzipSync, strToU8 } from './external/fflate.js';

function download(typeStream, fileType, fileName)
{
	const blob = new Blob([typeStream], {
        type: fileType
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";

    // The anchor is deliberately NOT appended to the document: a detached node
    // has no ancestors, so the click cannot bubble up to the global
    // a[href] interceptor in preload.js (which used to preventDefault() this
    // download and hand the blob: URL to shell.openExternal instead).
    a.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true }));

    // Revoking synchronously can abort the download before Chromium reads the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30000);

}	

function cairoZipDate() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
    }).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
    return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}
function downloadZIP(dataStreamsObj, fileName)
{
	const zipStream = zipSync(dataStreamsObj, { mtime: cairoZipDate() });
	download(zipStream, "application/zip", fileName + ".zip");
}

export function downloadJSON(dataStream, fileName = getTimeStamp().slice(0, -4)) 
{
    const jsonStream = JSON.stringify(dataStream, null, 2);
    download(jsonStream, "application/json", fileName + ".json");

}

export async function downloadJSONZIP([...dataStreamsArr], fileName = getTimeStamp().slice(0, -4))
{
	
    const dataStreamsObj = await arrToObj(dataStreamsArr,"json");
    downloadZIP(dataStreamsObj, fileName);
}

export async function downloadGIFZIP([...dataArr], fileName = getTimeStamp().slice(0, -4))
{

    const dataStreamsObj = await arrToObj(dataArr,"gif",true);
    downloadZIP(dataStreamsObj, fileName);

}

/* Zips already-encoded binary payloads (Uint8Array), each entry carrying its
   own extension in fileName. Unlike arrToObj() nothing is stringified here,
   so PDF bytes survive the round trip untouched. */
export function downloadFilesZIP([...dataArr], fileName = getTimeStamp().slice(0, -4))
{
    const dataStreamsObj = {};

    for (const data of dataArr)
    {
        let entryName = data.fileName;
        let dupeIndex = 1;

        // Two identical names would silently collapse into one zip entry.
        while (Object.hasOwn(dataStreamsObj, entryName))
        {
            entryName = data.fileName.replace(/(\.[^.]*)?$/, ` (${++dupeIndex})$1`);
        }

        dataStreamsObj[entryName] = data.fileContent;
    }

    downloadZIP(dataStreamsObj, fileName);
}

export async function unZipFilesAsText(zipFile, extsAllowed) {
    return new Promise((resolve, reject) => {

        extsAllowed = [extsAllowed].flat();
        const reader = new FileReader();
        reader.onload = (e) => {

            const arrayBuffer = e.target.result;
            const zipData = new Uint8Array(arrayBuffer);
            const files = Object.entries(unzipSync(zipData)).map( ([fileName, fileContent]) => {
		
                const fileExt = getExtension(fileName);
                if (extsAllowed.some(extAllowed => extAllowed.toLowerCase() === fileExt)) {
				
                    return {
                        fileName,
                        fileContent: new TextDecoder().decode(fileContent)
                    };
                }
            });
            resolve(files);
        };
        reader.onerror = (err) => {
            console.error("Failed to read file", err);
            reject(err);
        };
		
        reader.readAsArrayBuffer(zipFile);
    });
}



export function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("No file provided"));
        }
        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const jsonData = JSON.parse(event.target.result);
                resolve(jsonData);
            } catch (err) {
                reject(new Error("Invalid JSON: " + err.message));
            }
        };
        reader.onerror = function () {
            reject(new Error("Failed to read file: " + reader.error));
        };
        reader.readAsText(file);
    });
}


import pdfMake from './external/pdfmake.js';
import { vfs } from './external/vfs_fonts.js';
  
pdfMake.vfs = vfs;

export function downloadJsonArrAsPDF(jsonObjArr, fileName = getTimeStamp().slice(0, -4))
{
   
    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],  
      content: []
    };


   jsonObjArr.forEach(jsonObj => {

    const content = jsonObj.content;
    const pageNumber = jsonObj.pageNumber;

    docDefinition.content.push(
    {
      text: content,
      alignment: 'justify',
      fontSize: 16,
      lineHeight: 1.6,
      margin: [0, 0, 0, 20]
    },
    {
      text: pageNumber.slice(0, 11),
      alignment: 'right',
      fontSize: 10,
      absolutePosition: { x: 480, y: 770 }
    },
    { text: '', pageBreak: 'after' }
    );

    });

    docDefinition.content.pop();
    pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);

}



async function arrToObj(dataStreamsArr, ext, isBlob = false) {
		
    const dataStreamsObj = {};
	
	for (const dataStream of dataStreamsArr)
	{ 

		dataStream.fileName = `${dataStream.fileName}.${ext}`;
		dataStream.fileContent  = isBlob ? await blobToUint8Array(dataStream.fileContent)  : 
            strToU8(JSON.stringify(dataStream.fileContent, null, 2));
		
		dataStreamsObj[dataStream.fileName] = dataStream.fileContent;
		
	}

    return dataStreamsObj;

}


async function blobToUint8Array(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}


function getExtension(filename) {
    const parts = filename.split('.');
	
    if (parts.length === 1)
	{
		return '';
	}
        
    return parts.pop().toLowerCase();
}



/***********************************************
 *                   FETCH                     *
 ***********************************************/
/* Fetch Orchestra */
import { ORC_MAX_SIZE, MAESTRO_PACE } from '../configs/configs.js';

//Constants
const orchestraMaxSize = ORC_MAX_SIZE;
const maestroPace = MAESTRO_PACE;

//Globals
let orchestraCurrentSize = 0;


//Core
export async function eulcFetch(url, params = {}) {
    const upstream = new URL(url);
    if (!['eulc.edu.eg', 'www.eulc.edu.eg'].includes(upstream.hostname)) throw new Error('Unsupported EULC URL');
    let response;
    try {
        response = await fetch('/fetch?url=' + encodeURIComponent(upstream.href), params);
    } catch (cause) {
        const error = new Error(`Cannot contact the local EULC server: ${cause.message}`, {cause});
        error.details = {source:'browser-to-local-server', method:params.method || 'GET', url:upstream.href};
        console.error('[EULC request failed]', error.details, error);
        throw error;
    }
    if (!response.ok) {
        const body = await response.text();
        const source = response.headers.get('X-EULC-Error-Source') || 'unknown';
        const requestId = response.headers.get('X-EULC-Request-Id') || '';
        const description = source === 'upstream-http' ? 'Upstream server returned' : source === 'local-proxy' ? 'Local proxy generated' : 'Local server returned';
        const error = new Error(`${description} HTTP ${response.status}. ${params.method || 'GET'} ${upstream.href}${requestId ? ` [${requestId}]` : ''}. See Developer Tools (F12), Network and Console.`);
        error.details = {source, status:response.status, requestId, method:params.method || 'GET', url:upstream.href,
            finalUrl:decodeURIComponent(response.headers.get('X-EULC-Final-URL') || ''), responseBody:body};
        console.error('[EULC request failed]', error.details);
        window.eulcLastRequestError = error.details;
        throw error;
    }
    return response;
}
export async function orchestrateFetch(url, params) {
    while (orchestraCurrentSize >= orchestraMaxSize) await sleep(maestroPace);
    orchestraCurrentSize++;
    try { return await eulcFetch(url, params); }
    finally { orchestraCurrentSize--; }
}

export function formDataToUrlEncoded(formData) {
  return new URLSearchParams(formData).toString(); 
}


/***********************************************
 *               INDEXED-DBS UTILS             *
 ***********************************************/
 
/* Constants */
const dbCMD = 
	{
		put: 'put',
		get: 'get',
		getAll: 'getAll',
		delete: 'delete',
		clear: 'clear',
        count: 'count'
	};
	
const dbWriteCMDs = ['put', 'delete', 'clear'];

/* Class */
export class Database {
    constructor(dbName, keyPath, storeName = 'default') {
        this.dbName = dbName;
        this.storeName = storeName;
		if(!keyPath)
		{
			this.keyPathObj =  {keyPath: 'id',autoIncrement: true };
		}
		else
		{
			this.keyPathObj = { keyPath };
		}
        this.db = null;
    }
	

    _open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, this.keyPathObj);
                }
            };
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onerror = () => reject(request.error);
        });
    }
    async _executeDbCommand(methodName, ...args) {
        // Each operation owns its connection until its transaction commits.
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, dbWriteCMDs.includes(methodName) ? 'readwrite' : 'readonly');
            const request = tx.objectStore(this.storeName)[methodName](...args);
            let result;
            request.onsuccess = () => { result = request.result; };
            tx.oncomplete = () => { db.close(); resolve(result); };
            tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('Storage transaction failed')); };
        });
    }

    async save(record) {
		return this._executeDbCommand(dbCMD.put,record);
    }
	async get(key) {
		return this._executeDbCommand(dbCMD.get,key);
    }
	
	async getAll() 
	{
		return this._executeDbCommand(dbCMD.getAll);
    }
	
	async delete(key) 
	{
		return this._executeDbCommand(dbCMD.delete,key);
    }
	
	async clear()
	{
		return this._executeDbCommand(dbCMD.clear);
    }

    async count()
	{
		return this._executeDbCommand(dbCMD.count);
    }


}

/***********************************************
 *               URLS                          *
 ***********************************************/

export class URLER
{
    constructor(urlProtocol,urlSubdomains, urlBases)
    {
        this.urlProtocol = urlProtocol;
        this.urlSubdomains = urlSubdomains
        this.urlBases = urlBases;
    }
	get(urlBaseName, ...args)
	{

        const urlProtocol = this.urlProtocol;
        const urlSubdomains = this.urlSubdomains;
        const urlBases = this.urlBases;

		const rndSubdomain = urlSubdomains.length > 1 ? ( urlSubdomains[Math.floor(Math.random() * urlSubdomains.length)] )
        : urlSubdomains[0];

		const urlBase = Object.entries(urlBases).find(([key]) => key === urlBaseName)[1];
		const URL = (typeof urlBase === 'function') ?
            (   `${urlProtocol}${rndSubdomain}.${urlBase(...args)}`    ) : (   `${urlProtocol}${rndSubdomain}.${urlBase}`  );

		return URL;
	
	}

}
/***********************************************
 *               STRINGS                       *
 ***********************************************/
export function mergeStrWithOverlap(str1, str2) {
    let maxOverlap = 0;
    const maxLen = Math.min(str1.length, str2.length);
    for (let i = 1; i <= maxLen; i++) {
        if (str1.endsWith(str2.substring(0, i))) {
            maxOverlap = i;
        }
    }
    return str1 + str2.substring(maxOverlap);
}

/* Strips the characters Windows/zip tools reject and keeps the name short
   enough to survive the 255-byte path segment limit. */
export function sanitizeFileName(name, maxLen = 120)
{
    const cleaned = String(name ?? '')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, Math.max(1, maxLen))
        .trim();

    return cleaned.replace(/[. ]+$/, '') || 'untitled';
}

export function hasMultipleOccurrences(str, sub) {
  const first = str.indexOf(sub);
  const last = str.lastIndexOf(sub);
  
  return first !== -1 && last !== -1 && first !== last;
}


/***********************************************
 *               OBJECTS                       *
 ***********************************************/
export function getNestedPropertyValue(obj, path)
{
       if(path)
       {
             const keys = path.split(".");
	         const literal = keys.reduce( (literal,key) => literal + `["${key}"]`,"obj");
	         const value = eval(literal);
             return value;
       }
       else
       {
            return obj;
       }

}


/***********************************************
 *               NUMBERS                       *
 ***********************************************/
export function isInteger(str)
{
  return str && Number.isInteger(Number(str));
}


/***********************************************
 *               DOM                           *
 ***********************************************/
export function getTextWithLineBreaks(el) {
    return Array.from(el.childNodes).map(node => {
        if (node.nodeName === "BR") return "\n";
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeType === Node.ELEMENT_NODE) return getTextWithLineBreaks(node);
        return '';
    }).join('');
}


/***********************************************
 *               MISC                          *
 ***********************************************/

/* Short, non-blocking feedback in the corner of the window. */
export function notify(message, kind = 'info', timeout = 3600)
{
    let host = document.getElementById('toastHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toastHost';
        host.className = 'toast-host';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        document.body.append(host);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.textContent = message;
    host.append(toast);
    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 250);
    }, timeout);
}

export function copyTextToClipboard(text) {
    const textarea = document.createElement("textarea");
    const activeElement = document.activeElement;
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    if (activeElement && typeof activeElement.focus === "function") {
        activeElement.focus();
    }
}

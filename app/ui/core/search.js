/***********************************************
 *               IMPORTS                       *
 ***********************************************/
import { URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES } from '../configs/configs.js';
import {  orchestrateFetch, URLER} from '../utils/utils.js';
/***********************************************
 *               CONSTANTS                     *
 ***********************************************/
const urler = new URLER(URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES);
/***********************************************
 *               FUNCTIONS                     *
 ***********************************************/

export async function search(query, bibID, startPage = null, endPage = null) {

    const isEligible = (virtPageNum, startPage, endPage) => 
            (!startPage || virtPageNum >= startPage) && (!endPage ||virtPageNum <= endPage);
  
    try {
        const url = `${urler.get('SEARCH')}${bibID}`;

        const formData = new FormData();
        formData.append('SearchText', query);

  
        const response = await orchestrateFetch(url, { 
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const html = await response.text();
        
               
        if (!html) {
            throw new Error(`HTML error: empty document`);
        }

        const doc       =     new DOMParser().parseFromString(html, "text/html");
        const parentDiv =     doc.querySelector("body > div:nth-child(2)");
        
        const snippets = new Map();

        if(parentDiv)
        {
            
        const pages = parentDiv.querySelectorAll("div");
        
        for(const page of pages)
        {
            
          const virtPageNum = Number(page.querySelector('span').innerText.trim().split(" : ")[1]);
          const pageSnippet = page.querySelector('a').innerText.replace(/\s+/g, ' ').trim(); 

             if(isEligible(virtPageNum, Number(startPage), Number(endPage)))
             {
                 snippets.set(virtPageNum,pageSnippet);
             }
 
        }

        }

        return snippets;

    } catch (error) {

        window.reportAppError?.(error);
        throw error;
    }

}





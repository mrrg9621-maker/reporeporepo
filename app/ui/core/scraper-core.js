/***********************************************
 *               IMPORTS                       *
 ***********************************************/
import {  mergeStrWithOverlap,
          hasMultipleOccurrences,
          arrayFromNUMRange,
          ArrayProcessor
      } from '../utils/utils.js';
import { MIN_QUERY_WORDS, STOP_WORDS, MAX_STOP_WORDS, BIBS_SPECS } from '../configs/configs.js';
import { search } from './search.js';


/***********************************************
 *               Class Page                    *
 **********************************************/


class Page
{
     constructor(virtPageNum, pageContent, paperPageNum) 
     {
         this.virtPageNum = virtPageNum;
         this.pageContent = pageContent;
         this.paperPageNum = paperPageNum;

     }

     static sortPages(pages)
    {
       return pages.sort( (page_a, page_b) => page_a.virtPageNum - page_b.virtPageNum );
    }

    static deDupPages(pages)
    {
       return [
             ...new Map(pages.map(page => [page.virtPageNum, page])).values()
        ];
    }
     

};

const sortPages = Page.sortPages;
const deDupPages = Page.deDupPages;

/***********************************************
 *               FUNCTIONS                     *
 ***********************************************/
export async function performSearches([{__query, __bibID, __virtPageLNum, __virtPageRNum,}], pagesNumMap)
{
        const paramsArr   = arguments[0];
     	const arrayProcessor = new ArrayProcessor(performSearch, paramsArr, pagesNumMap);
   		const nestedPages = await arrayProcessor.process();
        return sortPages(deDupPages(nestedPages.flat()));
}
export async function performSearch({ query, bibID, virtPageLNum, virtPageRNum = null}, pagesNumMap)
{    

     const pages = [];
     const snippets = await search(query, bibID, virtPageLNum, virtPageRNum);
    
     for (const [virtPageNum,pageSnippet] of snippets.entries())
     {  
        const paperPageNum =  pagesNumMap && pagesNumMap[virtPageNum];
        const page = new Page(virtPageNum,pageSnippet,paperPageNum);
        pages.push(page);
     }


     return sortPages(pages);

}



export async function performScrap(query, virtPageNum, bibID)
{
    
     let _yield, prevYield, queryWords;

     _yield = query;
     prevYield = '';
     queryWords = query.split(' ');

    const pageStartText = await async function(){
        const nestedSnippet = await search("%%", bibID, virtPageNum, virtPageNum);
        if(nestedSnippet.size)
        {
            return nestedSnippet.values().next().value;
        }
        else
        {
            return '';
        }
    }();

     

     
     const report = {};
     let i = 0;
     while(prevYield !== _yield)
     {
            prevYield = _yield;

            queryWords.shift();
            
            const nGrams = getWordsNGrams(queryWords);
            

            const filteredNGrams = nGrams.filter(nGram =>
               {
          
           
                   let wordsLeft = MAX_STOP_WORDS;
                   const nGramWords = nGram.split(' ');

                   ( nGramWords.length ===  MIN_QUERY_WORDS ) && 
                   ( nGramWords.forEach(nGramWord => STOP_WORDS.some(stopWord => stopWord.includes(nGramWord)) && wordsLeft--) );

                   return ( 
                      ( !hasMultipleOccurrences(_yield.toLowerCase(),nGram.toLowerCase()) ) && 
                      (wordsLeft >= 0 )
                   );
               }

            );

            for (const nGram of filteredNGrams.toReversed())   //filteredNGrams.toReversed(): more downstream = faster operation
            { 

                 const nestedSnippet = await search(nGram, bibID, virtPageNum, virtPageNum);      
                 if(nestedSnippet.size)
                 {   
                         const snippetText  = nestedSnippet.values().next().value;
                    
                         if(!pageStartText || pageStartText !== snippetText)
                         {
                            const snippetWords = snippetText.split(' ');
                             queryWords = snippetWords;
                             _yield = mergeStrWithOverlap(_yield, snippetText);
                        

                          if(prevYield !== _yield)
                             {
                                 i++;
                                 report[i] = {nGram,filteredNGrams,_yield, prevYield};
                             
                                 break;
                            }
                         }

                         

                 }

                 
            }


        
     }

     console.log(report);
     
     return _yield;

}

export function getQueryPrefix(bibID) 
{
  return BIBS_SPECS[bibID]?.PAGE_PREFIX ?? ''; 
}

export function getPagesNumMap(bibID,totalPagesNum) 
{

    function extrctMapEntries(pagesArr, pagesMap, pageNumModifier = (pageNum) => String(pageNum))
    {


         pagesArr.reduce( (emptyPagesFound, pageNum, index) => 
         {   

            if(emptyPages.includes(pageNum))
            {
                return ++emptyPagesFound;
            }

            const oneBasedIndx = index + 1;
            const procsedNum = pageNumModifier(oneBasedIndx - emptyPagesFound);

            pagesMap[pageNum] = procsedNum;

            return emptyPagesFound;
         },0);

    }

    function letterize(num) {
     if (isNaN(num)) {
          return NaN;
     }
     let result = '';
      while (num > 0) {
         num--;
         result = String.fromCharCode(65 + (num % 26)) + result;
         num = Math.floor(num / 26);
        }
        return result;
    }

    function romanize(num) {
        if (isNaN(num)) {
        return NaN;
        }
        var digits = String(+num).split(""),
        key = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM", "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC", "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"],
        roman = "",
        i = 3;
        while (i--) {
         roman = (key[+digits.pop() + (i * 10)] || "") + roman;
        }
        return Array(+digits.join("") + 1).join("M") + roman;
    }
    
    const flatCustomPrefixes = (cusPrefixesObj) => {
        const flatCustomPrefixes = {};
        Object.entries(cusPrefixesObj).forEach( ([key,value]) => {

          const isARange = key.includes('-');
          if(isARange)
          {
              const boundaries = key.split('-'); 
              const lowerBound = Number(boundaries[0]);
              const upperBound = Number(boundaries[1]);
              const flatKeys = arrayFromNUMRange(lowerBound,upperBound);
              flatKeys.forEach(flatKey => flatCustomPrefixes[flatKey] = value);
          }
          else
          {
              flatCustomPrefixes[key] = value;
          }
        });
        return flatCustomPrefixes;
    
    };
        
  
    const emptyPages      = BIBS_SPECS[bibID]?.EMPTY_PAGES ?? [];
    const roman1stPgIndex = BIBS_SPECS[bibID]?.PAGES_INDICES?.ROMAN_1ST_PAGE_INDEX - 1;
    const main1stPgIndex  = BIBS_SPECS[bibID]?.PAGES_INDICES?.MAIN_1ST_PAGE_INDEX - 1;
    const customPrefixes   = flatCustomPrefixes(BIBS_SPECS[bibID]?.CUSTOM_PREFIXES ?? {});

    const pagesMap = {};
    const pages = arrayFromNUMRange(1, totalPagesNum);
    
    const prePages =   pages.slice(0, roman1stPgIndex);
    const romanPages = pages.slice(roman1stPgIndex || pages.length,  main1stPgIndex);
    const mainPages =  pages.slice(main1stPgIndex);

    extrctMapEntries(prePages, pagesMap, letterize);
    extrctMapEntries(romanPages, pagesMap, romanize);
    extrctMapEntries(mainPages, pagesMap);

    for (const key of Object.keys(customPrefixes))
    {
        pagesMap[key] = customPrefixes[key];
    }

    return pagesMap;

}



function getWordsNGrams(arr, minSize = MIN_QUERY_WORDS)
{
     const output = [];
     for(let n = arr.length; n >= minSize; n--)
     {
        for( let i = 0; (arr.length - i) >= n;  i++)
		{
		     const subArr = arr.slice(i,n + i);
               const subStr = subArr.join(' ');
               output.push(subStr);
			  
		}
     }
     return output;

}



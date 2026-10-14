export const ORC_MAX_SIZE = 8;
export const MAESTRO_PACE = 100;


export const DEFAULT_START_PAGE = 1;
export const DEFAULT_END_PAGE = 500;

export const DEFAULT_START_YEAR_RANGE = 2010;
export const DEFAULT_START_YEAR = 2015;
export const DEFAULT_END_YEAR = new Date().getFullYear();

export const PREV_SEARCH_PARAMS = 'PREV_PARAMS';

export const LIB_STOR_KEY = 'Libraries';


export const SCRN_DB_NAME  = 'THESIS_SCREENER_DB';  
export const SCRN_DB_PATH  = 'meta.title'; 
export const CACHE_DB_NAME = 'CACHE_DB';
export const CACHE_DB_PATH = 'bibID';

export const PAGES_DOWN = 25;
export const PAGES_PREFS = ["Reference", "Summary", "Discussion", "Result"
    ,"Introduction", "Chapter", "Patient", "Recommendation", "Arabic Summary", "Literature"
    ,"Material", "Conclusion", "ملخص", "Subject", "Annex", "Review", "List"
    ,"المستخلص العربى"
]

export const MAX_PREV_PAGES = 14;

export const IMPORT_FILE_TYPES = {JSON: 'application/json', ZIP: 'application/x-zip-compressed'};

export const SCRAPER_PAGE_MAX_CHAR = 3;

export const QUERY_PLACEHOLDER = 'a';

export const SNIPPET_MAX_WORDS = 12;

export const FOLDER_DESIG_WORDS_LEN = 8;

export const MIN_QUERY_WORDS = 1;
export const MAX_STOP_WORDS  = 0;  //max stop words in the MIN_QUERY_WORDS

export { STOP_WORDS }        from './words.js'; 
export { URL_PROTOCOL, URL_SUBDOMAINS, URL_BASES }        from './url.js'; 
export { BIBS_SPECS }        from './bibs-specs.js'




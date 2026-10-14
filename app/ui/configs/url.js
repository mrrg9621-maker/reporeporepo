export const URL_PROTOCOL = "https://";

export const URL_SUBDOMAINS = ['www'];

export const URL_BASES = 
{
        SEARCH: 'eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=ViewSearchResult&BibID=', 
        BROWSE: 'eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=PublicDrawThesis&BibID=',
        /* One EULC advanced search (Form4). Only the first text slot is used:
           the app runs one request per query and combines the BibID sets itself,
           so any number of required/optional queries can be expressed. */
        LIBRARY: ({ text = '', field = '0.', fullText = '', wordForms = '', bibRange = '', years = '',
                    order = 'publishYear asc', exact = false, scope = '1.', itemType = '24.2.5.' } = {}) =>
            'eulc.edu.eg/eulc_v5/libraries/Start.aspx?' + new URLSearchParams([
                ['ScopeID', '1.'], ['fn', 'ApplySearch'], ['SearchIdForm', ''], ['ScopeIDSelect', scope], ['ItemType', itemType],
                ['SearchText1', text], ['criteria1', field], ['opr1', 'and'],
                ['SearchText2', ''], ['criteria2', '1.'], ['opr2', 'and'],
                ['SearchText3', ''], ['criteria3', '1.'],
                ['SearchTextFT', fullText], ['Generation_Term', wordForms], ['BibID', bibRange], ['PublishYear', years],
                ['OrderKey', order], ['PageSize', '100000000'], ...(exact ? [['ExactSearch', '1']] : [])
            ]).toString(),
        LIB_DETAILS: (bibID) => `eulc.edu.eg/eulc_v5/Libraries/LibCataloging/LibInterface_UpdateDB.aspx?fn=AjaxViewOpacSummary&PageName=start.aspx&ScopeID=1.&ItemType=24.2.5.&item_id=${bibID}&sid=${Math.random()}`,
	IMAGE: 	(pageNumber) => `eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=DrawThesisPic&PageNo=${pageNumber}&BibID=`
    
};


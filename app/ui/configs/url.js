export const URL_PROTOCOL = "https://";

export const URL_SUBDOMAINS = ['www'];

export const URL_BASES = 
{
        SEARCH: 'eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=ViewSearchResult&BibID=', 
        BROWSE: 'eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=PublicDrawThesis&BibID=',
        /* One EULC advanced search (Form4). EULC reads 3 search boxes, joined
           left to right by opr1/opr2 (and | or | and not); boxes 4+ are ignored.
           slots: [{ text, field }] (up to 3), ops: [opr1, opr2]. */
        LIBRARY: ({ slots = [], ops = [], fullText = '', wordForms = '', bibRange = '', years = '',
                    order = 'publishYear asc', exact = false, scope = '1.', itemType = '24.2.5.', pageSize = 100000000 } = {}) =>
            'eulc.edu.eg/eulc_v5/libraries/Start.aspx?' + new URLSearchParams([
                ['ScopeID', '1.'], ['fn', 'ApplySearch'], ['SearchIdForm', ''], ['ScopeIDSelect', scope], ['ItemType', itemType],
                ['SearchText1', slots[0]?.text ?? ''], ['criteria1', slots[0]?.field ?? '0.'], ['opr1', ops[0] ?? 'and'],
                ['SearchText2', slots[1]?.text ?? ''], ['criteria2', slots[1]?.field ?? '1.'], ['opr2', ops[1] ?? 'and'],
                ['SearchText3', slots[2]?.text ?? ''], ['criteria3', slots[2]?.field ?? '1.'],
                ['SearchTextFT', fullText], ['Generation_Term', wordForms], ['BibID', bibRange], ['PublishYear', years],
                ['OrderKey', order], ['PageSize', String(pageSize)], ...(exact ? [['ExactSearch', '1']] : [])
            ]).toString(),
        LIB_DETAILS: (bibID) => `eulc.edu.eg/eulc_v5/Libraries/LibCataloging/LibInterface_UpdateDB.aspx?fn=AjaxViewOpacSummary&PageName=start.aspx&ScopeID=1.&ItemType=24.2.5.&item_id=${bibID}&sid=${Math.random()}`,
	IMAGE: 	(pageNumber) => `eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=DrawThesisPic&PageNo=${pageNumber}&BibID=`
    
};


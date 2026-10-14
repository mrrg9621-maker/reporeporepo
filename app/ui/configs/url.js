export const URL_PROTOCOL = "https://";

export const URL_SUBDOMAINS = ['www'];

export const URL_BASES = 
{
        SEARCH: 'eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=ViewSearchResult&BibID=', 
        BROWSE: 'eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=PublicDrawThesis&BibID=',
        LIBRARY:  (param1 = "", param2 ="", param3 = "", startYear = "", endYear = "") => `eulc.edu.eg/eulc_v5/libraries/Start.aspx?ScopeID=1.&fn=ApplySearch&SearchIdForm=&ScopeIDSelect=1.&ItemType=24.2.5.&SearchText1=${param1}&criteria1=0.&opr1=and&SearchText2=${param2}&criteria2=0.&opr2=and&SearchText3=${param3}&criteria3=0.&SearchTextFT=&Generation_Term=&BibID=&PublishYear=${endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`}&OrderKey=publishYear+asc&PageSize=100000000`,
        LIB_DETAILS: (bibID) => `eulc.edu.eg/eulc_v5/Libraries/LibCataloging/LibInterface_UpdateDB.aspx?fn=AjaxViewOpacSummary&PageName=start.aspx&ScopeID=1.&ItemType=24.2.5.&item_id=${bibID}&sid=${Math.random()}`,
	IMAGE: 	(pageNumber) => `eulc.edu.eg/eulc_v5/Libraries/Thesis/BrowseThesisPages.aspx?fn=DrawThesisPic&PageNo=${pageNumber}&BibID=`
    
};


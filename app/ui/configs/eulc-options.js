/* Option lists mirrored from the EULC advanced search form (start.aspx, Form4).
   Values are sent verbatim; labels are what the app shows. */

// criteria1..3
export const EULC_FIELDS = [
    { value: '0.',  label: 'Title' },
    { value: '1.',  label: 'Anywhere' },
    { value: '2.',  label: 'Author' },
    { value: '4.',  label: 'Supervisor' },
    { value: '3.',  label: 'Subject headings' },
    { value: '8.',  label: 'Table of contents' },
    { value: '9.',  label: 'Publisher' },
    { value: '10.', label: 'Related work' },
    { value: '5.',  label: 'Dewey number' }
];
export const EULC_DEFAULT_FIELD = '0.';

// Generation_Term
export const EULC_WORD_FORMS = [
    { value: '',             label: 'Exact words' },
    { value: 'INFLECTIONAL', label: 'Include inflections' },
    { value: 'THESAURUS',    label: 'Include synonyms' }
];

// OrderKey
export const EULC_ORDERS = [
    { value: 'publishYear asc',  label: 'Oldest first' },
    { value: 'publishYear desc', label: 'Newest first' },
    { value: 'Title',            label: 'Title' },
    { value: 'Author',           label: 'Author' }
];
export const EULC_DEFAULT_ORDER = 'publishYear asc';

// ItemType: theses only, the app screens nothing else
export const EULC_THESIS_ITEM_TYPE = '24.2.5.';

// ScopeIDSelect
export const EULC_SCOPES = [
    { value: '1.',    label: 'All consortium libraries' },
    { value: '1.4.',  label: 'جامعة القاهرة' },
    { value: '1.7.',  label: 'جامعة الاسكندريه' },
    { value: '1.5.',  label: 'جامعة عين شمس' },
    { value: '1.18.', label: 'جامعة أسيوط' },
    { value: '1.3.',  label: 'جامعة طنطا' },
    { value: '1.1.',  label: 'جامعة المنصورة' },
    { value: '1.6.',  label: 'جامعة الزقازيق' },
    { value: '1.22.', label: 'جامعة العاصمة' },
    { value: '1.2.',  label: 'جامعة المنيا' },
    { value: '1.9.',  label: 'جامعة المنوفية' },
    { value: '1.8.',  label: 'جامعة قناة السويس' },
    { value: '1.13.', label: 'جامعه جنوب الوادى' },
    { value: '1.17.', label: 'جامعة الفيوم' },
    { value: '1.19.', label: 'جامعة بنها' },
    { value: '1.20.', label: 'جامعة بني سويف' },
    { value: '1.15.', label: 'جامعة كفر الشيخ' },
    { value: '1.11.', label: 'جامعة سوهاج' },
    { value: '1.107.', label: 'جامعة بورسعيد' },
    { value: '1.111.', label: 'جامعة دمنهور' },
    { value: '1.70.', label: 'جامعة دمياط' },
    { value: '1.112.', label: 'جامعة أسوان' },
    { value: '1.113.', label: 'جامعة مدينة السادات' },
    { value: '1.114.', label: 'جامعة السويس' },
    { value: '1.221.', label: 'جامعة العريش' },
    { value: '1.224.', label: 'جامعة الأقصر' },
    { value: '1.225.', label: 'جامعة الوادى الجديد' },
    { value: '1.236.', label: 'جامعة الغردقة' },
    { value: '1.229.', label: 'جامعة مطروح' },
    { value: '1.23.', label: 'جامعة الازهر' },
    { value: '1.21.', label: 'شبكة الرسائل الجامعية' },
    { value: '1.118.', label: 'المجلس القومي للمرأة' },
    { value: '1.116.', label: 'اكاديمية الاسكندرية للإدارة والمحاسبة' },
    { value: '1.109.', label: 'المعهد التكنولوجي بالعاشر من رمضان' },
    { value: '1.106.', label: 'الأكاديمية العربية للعلوم المالية والمصرفية' },
    { value: '1.110.', label: 'معهد اكتوبر العالى للهندسة والتكنولوجيا' },
    { value: '1.120.', label: 'المركز القومي للبحوث التربوية والتنمية' },
    { value: '1.105.', label: 'مؤسسة المرأة والذاكرة' },
    { value: '1.223.', label: 'المعهد العالي لنظم التجارة الإلكترونية بسوهاج' },
    { value: '1.232.', label: 'الجامعة المصرية الصينية' },
    { value: '1.222.', label: 'جامعة دراية' },
    { value: '1.216.', label: 'جامعة النهضة' },
    { value: '1.218.', label: 'اكاديمية طيبة الجيزة' },
    { value: '1.219.', label: 'اكاديمية طيبه المعادي' },
    { value: '1.220.', label: 'معاهد العبور' },
    { value: '1.226.', label: 'هيئة قناة السويس' },
    { value: '1.227.', label: 'مخطاات رسائل أقسام المكتبات بالجامعات المصرية' },
    { value: '1.233.', label: 'المعهد العالي للعلوم الإدارية بأوسيم' },
    { value: '1.234.', label: 'جامعة السلام بمصر' },
    { value: '1.237.', label: 'جامعة العبور للعلوم والتكنولوجيا' },
    { value: '1.238.', label: 'الهيئة العامة للمستشفيات والمعاهد التعليمية' },
    { value: '1.239.', label: 'جامعة نيو إيجيبت' },
    { value: '1.230.', label: 'كلية القانون بالجامعة البريطانية' },
    { value: '1.235.', label: 'مركز تقنية الاتصالات والمعلومات' }
];
export const EULC_DEFAULT_SCOPE = '1.';

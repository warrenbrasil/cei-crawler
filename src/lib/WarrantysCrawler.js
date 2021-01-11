const typedefs = require("./typedefs");
const CeiUtils = require('./CeiUtils');
const FetchCookieManager = require('./FetchCookieManager');
const { CeiCrawlerError, CeiErrorTypes } = require('./CeiCrawlerError')
const cheerio = require('cheerio');
const normalizeWhitespace = require('normalize-html-whitespace');

const PAGE = {
    URL: 'https://ceiapp.b3.com.br/CEI_Responsivo/garantiasNGA.aspx',
    SELECT_INSTITUTION: '#ctl00_ContentPlaceHolder1_ddlAgentes',
    SELECT_INSTITUTION_OPTIONS: '#ctl00_ContentPlaceHolder1_ddlAgentes option',
    DATE_INPUT: '#ctl00_ContentPlaceHolder1_txtData',
    DATE_MIN_VALUE: '#ctl00_ContentPlaceHolder1_lblPeriodoInicial',
    DATE_MAX_VALUE: '#ctl00_ContentPlaceHolder1_lblPeriodoFinal',
    ALERT_BOX: '.alert-box',
    SUBMIT_BUTTON: '#ctl00_ContentPlaceHolder1_btnConsultar',
    WARRANTYS_ACCOUNT: '#ctl00_ContentPlaceHolder1_repContasVista_ctl00_lblConta',
    WARRANTYS_TABLE: '#tblOfertasPublicas',
    WARRANTYS_TABLE_BODY: '#tblOfertasPublicas tbody',
    WARRANTYS_TABLE_BODY_ROWS: '#tblOfertasPublicas tbody tr',    
    RESULT_FOOTER_100: '#tblOfertasPublicas tfoot',
    PAGE_ALERT_ERROR: '.alert-box.alert',
    PAGE_ALERT_SUCCESS: '.alert-box.success'
}

const WARRANTYS_TABLE_HEADER = {
    type: 'string',
    code: 'string',
    quantity: 'float',
    unitPrice: 'float',
    warrantyValue: 'float'
};

const FETCH_OPTIONS = {
    WARRANTY_INSTITUTION: {
        "headers": {
          "accept": "*/*",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "cache-control": "no-cache",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-microsoftajax": "Delta=true",
          "x-requested-with": "XMLHttpRequest"
        },
        "referrer": "https://ceiapp.b3.com.br/CEI_Responsivo/garantiasNGA.aspx",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    },
    WARRANTY_ACCOUNT:  {
        "headers": {
          "accept": "*/*",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "cache-control": "no-cache",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-microsoftajax": "Delta=true",
          "x-requested-with": "XMLHttpRequest"
        },
        "referrer": "https://ceiapp.b3.com.br/CEI_Responsivo/garantiasNGA.aspx",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    }
};

const FETCH_FORMS = {
    WARRANTY_INSTITUTION: [
        'ctl00$ContentPlaceHolder1$ToolkitScriptManager1',
        'ctl00_ContentPlaceHolder1_ToolkitScriptManager1_HiddenField',
        '__EVENTTARGET',
        '__EVENTARGUMENT',
        '__LASTFOCUS',
        '__VIEWSTATE',
        '__VIEWSTATEGENERATOR',
        '__EVENTVALIDATION',
        'ctl00$ContentPlaceHolder1$ddlAgentes',
        'ctl00$ContentPlaceHolder1$ddlContas',
        'ctl00$ContentPlaceHolder1$txtData',
        '__ASYNCPOST'
    ],
    WARRANTY_ACCOUNT: [
        'ctl00$ContentPlaceHolder1$ToolkitScriptManager1',
        'ctl00_ContentPlaceHolder1_ToolkitScriptManager1_HiddenField',
        'ctl00$ContentPlaceHolder1$ddlAgentes',
        'ctl00$ContentPlaceHolder1$ddlContas',
        'ctl00$ContentPlaceHolder1$txtData',
        '__EVENTTARGET',
        '__EVENTARGUMENT',
        '__LASTFOCUS',
        '__VIEWSTATE',
        '__VIEWSTATEGENERATOR',
        '__EVENTVALIDATION',
        '__ASYNCPOST',
        'ctl00$ContentPlaceHolder1$btnConsultar'
    ]
}

class WarrantysCrawler {

    /**
     * Get the warrantys data from CEI
     * @param {FetchCookieManager} cookieManager - FetchCookieManager to work with
     * @param {typedefs.CeiCrawlerOptions} [options] - Options for the crawler
     * @param {Date} [date] - The date of the warranty. If none passed, the default of CEI will be used
     * @returns {Promise<typedefs.AccountWarranty[]>} - List of Stock histories
     */
    static async getWarrantys(cookieManager, options = null, date = null) {
        const traceOperations = (options && options.trace) || false;

        const result = [];

        const getPage = await cookieManager.fetch(PAGE.URL);
        const domPage = cheerio.load(await getPage.text());

        // Set date
        if (date !== null) {
            /* istanbul ignore next */
            const minDateStr = domPage(PAGE.DATE_MIN_VALUE).text().trim();
            const minDate = CeiUtils.getDateFromInput(minDateStr);

            /* istanbul ignore next */
            const maxDateStr = domPage(PAGE.DATE_MAX_VALUE).text().trim();
            const maxDate = CeiUtils.getDateFromInput(maxDateStr);
            
            // Prevent date out of bound if parameter is set
            if (options.capDates && date < minDate) {
                date = minDate;
            }

            if (options.capDates && date > maxDate) {
                date = maxDate;
            }
            domPage(PAGE.DATE_INPUT).attr('value', CeiUtils.getDateForInput(date));
        }

        // Get all institutions to iterate
        const institutions = domPage(PAGE.SELECT_INSTITUTION_OPTIONS)
            .map((_, option) => ({
                value: option.attribs.value,
                label: domPage(option).text()
            })).get()
            .filter(institution => institution.value > 0);

        for (const institution of institutions) {

            /* istanbul ignore next */
            if (traceOperations)
                console.log(`Selecting institution ${institution.label} (${institution.value})`)

            domPage(PAGE.SELECT_INSTITUTION).attr('value', institution.value);

            const formDataInstitution = CeiUtils.extractFormDataFromDOM(domPage, FETCH_FORMS.WARRANTY_INSTITUTION, {
                ctl00$ContentPlaceHolder1$ToolkitScriptManager1: 'ctl00$ContentPlaceHolder1$updFiltro|ctl00$ContentPlaceHolder1$ddlAgentes',
                __EVENTTARGET: 'ctl00$ContentPlaceHolder1$ddlAgentes'
            });

            const req = await cookieManager.fetch(PAGE.URL, {
                ...FETCH_OPTIONS.WARRANTY_INSTITUTION,
                body: formDataInstitution
            });

            const reqInstitutionText = await req.text();

            const updtForm = CeiUtils.extractUpdateForm(reqInstitutionText);
            CeiUtils.updateFieldsDOM(domPage, updtForm);

            const { account, warrantys } = await this._getDataPage(domPage, cookieManager, traceOperations);

            // Save the result
            result.push({
                institution: institution.label,
                account: account,
                warrantys: warrantys
            });
        }

        return result;
    }

    /**
     * Returns the available options to get Warranty data
     * @param {FetchCookieManager} cookieManager - FetchCookieManager to work with
     * @param {typedefs.CeiCrawlerOptions} [options] - Options for the crawler
     * @returns {Promise<typedefs.WarrantyOptions}> - Options to get data from warranty
     */
    static async getWarrantysOptions(cookieManager, options = null) {
        const getPage = await cookieManager.fetch(PAGE.URL);
        const domPage = cheerio.load(await getPage.text());


        const minDateStr = domPage(PAGE.DATE_MIN_VALUE).text().trim();
        const maxDateStr = domPage(PAGE.DATE_MAX_VALUE).text().trim();

        const institutions = domPage(PAGE.SELECT_INSTITUTION_OPTIONS)
            .map((_, option) => ({
                value: option.attribs.value,
                label: domPage(option).text()
            }))
            .get()
            .filter(institution => institution.value > 0);

        return {
            minDate: minDateStr,
            maxDate: maxDateStr,
            institutions: institutions
        }
    }

    /**
     * Returns the data from the page after trying more than once
     * @param {cheerio.Root} dom DOM of page
     * @param {FetchCookieManager} cookieManager - FetchCookieManager to work with
     * @param {Boolean} traceOperations - Whether to trace operations or not
     */
    static async _getDataPage(dom, cookieManager, traceOperations) {
        while(true) {
            const formDataWarranty = CeiUtils.extractFormDataFromDOM(dom, FETCH_FORMS.WARRANTY_ACCOUNT, {
                ctl00$ContentPlaceHolder1$ToolkitScriptManager1: 'ctl00$ContentPlaceHolder1$updFiltro|ctl00$ContentPlaceHolder1$btnConsultar',
                __EVENTARGUMENT: '',
                __LASTFOCUS: ''
            });
            
            const warrantyRequest = await cookieManager.fetch(PAGE.URL, {
                ...FETCH_OPTIONS.WARRANTY_ACCOUNT,
                body: formDataWarranty
            });

            const warrantysText = normalizeWhitespace(await warrantyRequest.text());
            const errorMessage = CeiUtils.extractMessagePostResponse(warrantysText);

            if (errorMessage && errorMessage.type === 2) {
                throw new CeiCrawlerError(CeiErrorTypes.SUBMIT_ERROR, errorMessage.message);
            }

            const warrantysDOM = cheerio.load(warrantysText);
            const account = warrantysDOM(PAGE.WARRANTYS_ACCOUNT).text().replace('Conta nº','').trim().split('-')[0]

            // Process the page
            /* istanbul ignore next */
            if (traceOperations)
                console.log(`Processing warranty data`);

            const warrantys = this._processWarrantys(warrantysDOM);

            if (errorMessage.type !== undefined || this._hasLoadedData(warrantysDOM)) {
                return {
                    account,
                    warrantys
                };
            }
            
            const updtForm = CeiUtils.extractUpdateForm(warrantysText);
            CeiUtils.updateFieldsDOM(dom, updtForm);
        }
    }

    /**
     * Process the stock warranty to a DTO
     * @param {cheerio.Root} dom DOM table stock history
     */
    static _processWarrantys(dom) {
        const headers = Object.keys(WARRANTYS_TABLE_HEADER);

        const data = dom(PAGE.WARRANTYS_TABLE_BODY_ROWS)
            .map((_, tr) => dom('td', tr)
                .map((_, td) => dom(td).text().trim())
                .get()
                .reduce((dict, txt, idx) => {
                    dict[headers[idx]] = txt;
                    return dict;
                }, {})
            ).get();

        return CeiUtils.parseTableTypes(data, WARRANTYS_TABLE_HEADER);
    }

    /**
     * Check wheter the table was rendered on the screen to stop trying to get data
     * @param {cheerio.Root} dom DOM table stock history
     */
    static _hasLoadedData(dom) {
       const query = dom(`${PAGE.RESULT_FOOTER_100}`);
       return query.length > 0;
    }

}

module.exports = WarrantysCrawler;
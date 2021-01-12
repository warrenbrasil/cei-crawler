const typedefs = require("./typedefs");
const CeiUtils = require('./CeiUtils');
const FetchCookieManager = require('./FetchCookieManager');
const { CeiCrawlerError, CeiErrorTypes } = require('./CeiCrawlerError')
const cheerio = require('cheerio');
const normalizeWhitespace = require('normalize-html-whitespace');

const PAGE = {
    URL: 'https://ceiapp.b3.com.br/CEI_Responsivo/ConsultarValoresMobiliariosPorProduto.aspx?prdt=Consolidado&inst=0',
    SELECT_INSTITUTION: '#ctl00_ContentPlaceHolder1_ddlAgentes',
    SELECT_INSTITUTION_OPTIONS: '#ctl00_ContentPlaceHolder1_ddlAgentes option',
    SELECT_PRODUCT: '#ctl00_ContentPlaceHolder1_ddlProduto',
    SELECT_PRODUCT_OPTIONS: '#ctl00_ContentPlaceHolder1_ddlProduto option',
    DATE_INPUT: '#ctl00_ContentPlaceHolder1_txtData',
    DATE_MIN_VALUE: '#ctl00_ContentPlaceHolder1_lblPeriodoInicial',
    DATE_MAX_VALUE: '#ctl00_ContentPlaceHolder1_lblPeriodoFinal',
    ALERT_BOX: '.alert-box',
    SUBMIT_BUTTON: '#ctl00_ContentPlaceHolder1_btnConsultar',
    CETIP_FURNITURES_TABLE: '.responsive',
    CETIP_FURNITURES_TABLE_BODY: '.responsive tbody',
    CETIP_FURNITURES_TABLE_BODY_ROWS: '.responsive tbody tr',    
    RESULT_FOOTER_100: '.responsive tfoot',
    PAGE_ALERT_ERROR: '.alert-box.alert',
    PAGE_ALERT_SUCCESS: '.alert-box.success'
}

const CETIP_FURNITURES_TABLE_HEADER = {
    onDate: 'date',
    instrument: 'string',
    code: 'string',
    issuer: 'string',
    issueDate: 'date',
    dueDate: 'date',
    quantityAvail: 'int',
    quantityUnavail: 'int',
    quantityReserve: 'int',
    quantityBlocked: 'int',
    warrantyQuantityReceived: 'int',
    warrantyQuantityProvided: 'int',
    warrantyObservation: 'string',
    burdensQuantityReceived: 'int',
    burdensQuantityProvided: 'int',
    burdensCounterpart: 'string',
    burdensObservation: 'string'
};

const FETCH_OPTIONS = {
    CETIP_FURNITURE_INSTITUTION: {
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
        "referrer": "https://ceiapp.b3.com.br/CEI_Responsivo/ConsultarValoresMobiliariosPorProduto.aspx?prdt=Consolidado&inst=0",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    },
    CETIP_FURNITURE_ACCOUNT:  {
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
        "referrer": "https://ceiapp.b3.com.br/CEI_Responsivo/ConsultarValoresMobiliariosPorProduto.aspx?prdt=Consolidado&inst=0",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    }
};

const FETCH_FORMS = {
    CETIP_FURNITURE_INSTITUTION: [
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
    CETIP_FURNITURE_ACCOUNT: [
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

class CetipFurnitureCrawler {

    /**
     * Get the cetip furnitures data from CEI
     * @param {FetchCookieManager} cookieManager - FetchCookieManager to work with
     * @param {typedefs.CeiCrawlerOptions} [options] - Options for the crawler
     * @param {Date} [date] - The date of the cetip furniture. If none passed, the default of CEI will be used
     * @returns {Promise<typedefs.AccountCetipFurniture[]>} - List of Stock histories
     */
    static async getCetipFurniture(cookieManager, options = null, date = null) {
        const traceOperations = (options && options.trace) || false;

        const result = [];

        const getPage = await cookieManager.fetch(PAGE.URL);
        const domPage = cheerio.load(await getPage.text());

        // console.log(domPage.text())
        
        // console.log('aqui')
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

                const { cetipFurnitures } = await this._getDataPage(domPage, cookieManager, traceOperations);

                // Save the result
                result.push({
                    institution: institution.label,
                    // account: account,
                    cetipFurnitures: cetipFurnitures
                });
            // }
        }

        return result;
    }

    /**
     * Returns the available options to get CetipFurniture data
     * @param {FetchCookieManager} cookieManager - FetchCookieManager to work with
     * @param {typedefs.CeiCrawlerOptions} [options] - Options for the crawler
     * @returns {Promise<typedefs.CetipFurnitureOptions}> - Options to get data from cetip furniture
     */
    static async getCetipFurnitureOptions(cookieManager, options = null) {
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

        for (const institution of institutions) {
            domPage(PAGE.SELECT_INSTITUTION).attr('value', institution.value);
            const formDataStr = CeiUtils.extractFormDataFromDOM(domPage, FETCH_FORMS.CETIP_FURNITURE_INSTITUTION);

            const getProductsPage = await cookieManager.fetch(PAGE.URL, {
                ...FETCH_OPTIONS.CETIP_FURNITURE_INSTITUTION,
                body: formDataStr
            });

            const getProductsPageTxt = await getProductsPage.text();

            const getProductsPageDom = cheerio.load(getProductsPageTxt);

            const products = getProductsPageDom(PAGE.SELECT_PRODUCT_OPTIONS)
                .map((_, option) => option.attribs.value).get()
                .filter(accountId => accountId > 0);

            institution.products = products;
        }

        return {
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
            const formDataCetipFurniture = CeiUtils.extractFormDataFromDOM(dom, FETCH_FORMS.CETIP_FURNITURE_ACCOUNT, {
                ctl00$ContentPlaceHolder1$ToolkitScriptManager1: 'ctl00$ContentPlaceHolder1$updFiltro|ctl00$ContentPlaceHolder1$btnConsultar',
                __EVENTARGUMENT: '',
                __LASTFOCUS: ''
            });
            
            const cetipFurnitureRequest = await cookieManager.fetch(PAGE.URL, {
                ...FETCH_OPTIONS.CETIP_FURNITURE_ACCOUNT,
                body: formDataCetipFurniture
            });

            const cetipFurnituresText = normalizeWhitespace(await cetipFurnitureRequest.text());
            const errorMessage = CeiUtils.extractMessagePostResponse(cetipFurnituresText);

            if (errorMessage && errorMessage.type === 2) {
                throw new CeiCrawlerError(CeiErrorTypes.SUBMIT_ERROR, errorMessage.message);
            }

            const cetipFurnituresDOM = cheerio.load(cetipFurnituresText);

            // Process the page
            /* istanbul ignore next */
            if (traceOperations)
                console.log(`Processing cetip furniture data`);

            const cetipFurnitures = this._processCetipFurnitures(cetipFurnituresDOM);

            if (errorMessage.type !== undefined || this._hasLoadedData(cetipFurnituresDOM)) {
                return {
                    cetipFurnitures
                };
            }
            
            const updtForm = CeiUtils.extractUpdateForm(cetipFurnituresText);
            CeiUtils.updateFieldsDOM(dom, updtForm);
        }
    }

    /**
     * Process the stock cetip furniture to a DTO
     * @param {cheerio.Root} dom DOM table stock history
     */
    static _processCetipFurnitures(dom) {
        const headers = Object.keys(CETIP_FURNITURES_TABLE_HEADER);

        const data = dom(PAGE.CETIP_FURNITURES_TABLE_BODY_ROWS)
            .map((_, tr) => dom('td', tr)
                .map((_, td) => dom(td).text().trim())
                .get()
                .reduce((dict, txt, idx) => {
                    dict[headers[idx]] = txt;
                    return dict;
                }, {})
            ).get();

        return CeiUtils.parseTableTypes(data, CETIP_FURNITURES_TABLE_HEADER);
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

module.exports = CetipFurnitureCrawler;
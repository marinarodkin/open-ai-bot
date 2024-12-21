const puppeteer = require('puppeteer-core')

const BROWSERLESS_API_KEY = '9ecb1f8d-68ca-4eae-b411-6bdd9af2ebc1'

function removeTimestamp(text) {
    const timestampRegex = /^\d{1,2}(:\d{2}){1,2}\n/;
    return text.replace(timestampRegex, '');
}

exports.scraping = async function getYoutubeVideoData(videoURL) {
    const browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_API_KEY}&stealth`,
    });

    const page = await browser.newPage()

    await page.goto(videoURL);
    await page.setViewport({width: 1080, height: 1024});

    const titleElement = await page.$('h1 > yt-formatted-string[class="style-scope ytd-video-primary-info-renderer"]')
    const title = await titleElement.evaluate(el => el.textContent)
    console.log('title', title)

    const authorElement = await page.$('yt-formatted-string[class="style-scope ytd-channel-name complex-string"]')
    const author = await authorElement.evaluate(el => el.textContent)
    console.log('author', author)
    const extendSelector = 'tp-yt-paper-button[class="ytd-text-inline-expander"]';
    const button = await page.$('#expand');
    console.log('button', button)
    let text
    if (button) {
        await button.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
        const showButtonSelector = '#primary-button ytd-button-renderer button';
        const showButton = await page.waitForSelector(showButtonSelector, {visible: true});
        console.log('showButton', showButton)
        if (showButton) {
            await showButton.click();

            await new Promise(resolve => setTimeout(resolve, 2000));

            const searchResultSelector3 = 'ytd-transcript-segment-renderer';
            const elements = await page.$$(searchResultSelector3);
            const element = elements[0]
            console.log('element', element)
            const elementsInnerText = await Promise.all(
                elements.map(element => element.evaluate(el => el.innerText))
            );
            const elementsWithoutTimestamp = elementsInnerText.map(removeTimestamp);
            text = elementsWithoutTimestamp.join()
        }
    }
    /*


    const searchResultSelector = 'yt-button-shape[class="style-scope ytd-menu-renderer"] > button';
    const button = await page.waitForSelector(searchResultSelector);
    let text
    if (button) {
        await button.click();

        await new Promise(resolve => setTimeout(resolve, 2000));

        const searchResultSelector2 = 'ytd-menu-service-item-renderer[class="style-scope ytd-menu-popup-renderer"]';
        const menuBtns = await page.$$(searchResultSelector2);
        const menuBtn = menuBtns[menuBtns.length - 1];
        if (menuBtn) {
            await menuBtn.click();

            await new Promise(resolve => setTimeout(resolve, 2000));

            const searchResultSelector3 = 'ytd-transcript-segment-renderer';
            const elements = await page.$$(searchResultSelector3);
            const element = elements[0]
            const elementsInnerText = await Promise.all(
                elements.map(element => element.evaluate(el => el.innerText))
            );

            const elementsWithoutTimestamp = elementsInnerText.map(removeTimestamp);
            text = elementsWithoutTimestamp.join()

            // console.log(elementsWithoutTimestamp, elementsWithoutTimestamp.join())
           */
            await page.close();
            await browser.close()

        return {
            title,
            author,
            text

    }

}

/*
(async function() {
    const videoStatistics = await getYoutubeVideoData('https://www.youtube.com/watch?v=-voTJE2bcb0')

    console.log(videoStatistics)
})()

 */

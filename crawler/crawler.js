const puppeteer_original = require('puppeteer');
const puppeteer = require("puppeteer-extra");
const pluginStealth = require("puppeteer-extra-plugin-stealth");
const path = require('path');
const async = require('async');
const fs = require('fs');
const parseDomain = require("parse-domain");
const ArgumentParser = require('argparse').ArgumentParser;
const mime = require("mime-types");
const fileType = require('file-type');
const S3 = require('aws-sdk/clients/s3');

const { postgresInsertImageData, postgresInsertGraphMLMapping, postgresInsertError } = require('./postgres');
const { sha1, sleep, shuffle } = require('./utils');

let s3ImagesBucket;
let s3PageGraphBucket;
const s3Options = process.env.AWS_ENDPOINT ? {endpoint: process.env.AWS_ENDPOINT, s3ForcePathStyle: true} : {};
const s3Server = new S3(s3Options);

// the user agent for the brave binary
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.72 Safari/537.36";

const brave_args = [
    '--user-agent=' + userAgent,
    '--lang=si',
    '--incognito',
    '--user-data-dir-name=page_graph',
    '--v=0',
    '--disable-brave-update',
    '--enable-logging=stderr',
    '--no-sandbox'
];

puppeteer.use(pluginStealth());

function tryGetImagesOnPage(page, domain, url, isTopPage, timeout) {
    if (page) {
        console.log('visiting: ', url);
        let pageWorked = true;

        return new Promise(async (resolve, reject) => {
            if (isTopPage) {
                page.on(
                    'error',
                    async err => {
                        console.log('page crashed..');
                        pageWorked = false;
                        // page crashed! Then log it..
                        const entry = {
                            page_url: url,
                            error_page_crash: true
                        };
                        await postgresInsertError(entry);
                        reject(err);
                    }
                );

                page.on(
                    'response',
                    response => {
                        if (response.ok() && response.status !== 204 && response.status !== 205) {
                            const request = response.request();
                            if (request.resourceType() === 'image') {
                                const responseHeaders = response.headers();
                                if (responseHeaders['content-length'] === 'undefined' ||
                                        responseHeaders['content-length'] === '0') {
                                    return;
                                }

                                response.buffer().then(async content => {
                                    let fileExtension = responseHeaders['content-type'] ?
                                        mime.extension(responseHeaders['content-type']) : undefined;
                                    if (fileExtension === undefined) {
                                        const actualFileType = fileType(content.slice(0, fileType.minimumBytes));
                                        if (actualFileType) {
                                            fileExtension = actualFileType.ext;
                                        }
                                    }

                                    const responseFrame = response.frame();
                                    const parentFrame = responseFrame.parentFrame();
                                    const resourceUrl = response.url();
                                    const sha1ResourceUrl = resourceUrl ? `x${sha1(resourceUrl)}` : undefined;
                                    const fileName = fileExtension ?
                                        path.join('filterlist-gen', 'images', `${domain}_${sha1ResourceUrl}.${fileExtension}`) :
                                        path.join('filterlist-gen', 'images', `${domain}_${sha1ResourceUrl}`);

                                    const filePath = 's3://' + path.join(s3ImagesBucket, fileName);

                                    const imageData = {
                                        domain: domain,
                                        page_url: url,
                                        frame_id: await responseFrame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null),
                                        frame_name: await responseFrame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null),
                                        parent_frame_id: parentFrame ?
                                            await parentFrame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null)
                                            : null,
                                        parent_frame_name: parentFrame ? 
                                            await parentFrame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null)
                                            : null,
                                        frame_url: responseFrame.url(),
                                        resource_type: 'image',
                                        resource_url: resourceUrl,
                                        imaged_data: filePath,
                                        content_length: responseHeaders['content-length'],
                                        sha1_resource_url: sha1ResourceUrl
                                    };

                                    await postgresInsertImageData(imageData);
                                    s3Server.putObject({
                                        Bucket: s3ImagesBucket,
                                        Key: fileName,
                                        Body: content
                                    }).promise().catch(err => console.log(err));
                                })
                                /*.catch(err => {
                                    console.log('a weird error... ', err);
                                });*/
                            }
                        }
                    }
                );

                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'si'
                });
                await page.setGeolocation({
                    latitude: 6.92, longitude: 79.86
                });
                await page.setViewport({
                    width: 1680, height: 1050
                });
            }

            try {
                const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout });
                if (response !== null && response.ok() && pageWorked) {
                    /* 
                    * All image responses for the main frame should have been captured
                    * here, so next step is to go through all subframes
                    */
                    let childFrames = await page.mainFrame().childFrames();
                    while (childFrames.length != 0) {
                        const childFrame = childFrames.pop();
                        if (childFrame.isDetached()) {
                            continue;
                        }

                        let grandChildren = childFrame.childFrames();
                        childFrames.concat(grandChildren);
                        const frameBody = await childFrame.$('body');
                        if (frameBody === null) {
                            continue;
                        }
                        const frameBoundingBox = await frameBody.boundingBox();
                        if (frameBoundingBox !== null && frameBoundingBox.width > 0
                                && frameBoundingBox.height > 0) {

                            const frameUrl = childFrame.url();
                            const sha1ResourceUrl = frameUrl ? `x${sha1(frameUrl)}` : undefined;
                            const fileName = path.join('filterlist-gen', 'frames', `${domain}_${sha1ResourceUrl}.png`);
                            const filePath = 's3://' + path.join(s3ImagesBucket, fileName);

                            await page.screenshot({
                                clip: {
                                    x: frameBoundingBox.x,
                                    y: frameBoundingBox.y,
                                    width: Math.ceil(frameBoundingBox.width),
                                    height: Math.ceil(frameBoundingBox.height)
                                }
                            }).then(screenshot => s3Server.putObject({
                                Bucket: s3ImagesBucket,
                                Key: fileName,
                                Body: screenshot
                            }).promise().catch(err => console.log(err)));

                            const parentFrame = childFrame.parentFrame();
                            const imageData = {
                                domain: domain,
                                page_url: url,
                                frame_id: await childFrame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null),
                                frame_name: await childFrame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null),
                                parent_frame_id: await parentFrame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null),
                                parent_frame_name: await parentFrame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null),
                                frame_url: childFrame.url(),
                                resource_type: 'iframe',
                                resource_url: frameUrl,
                                imaged_data: filePath,
                                sha1_resource_url: sha1ResourceUrl
                            };

                            await postgresInsertImageData(imageData);
                        }
                    }

                    // allow for any lingering requests...
                    await sleep(2500)

                    // then fix the graphml file
                    const devtools = await page.target().createCDPSession();
                    const graphml = await devtools.send('Page.generatePageGraph');
                    const sha1_url = sha1(url);
                    const graphmlFileName = path.join('filterlist-gen', `${domain}-${sha1_url}_${new Date().toISOString()}.graphml`);

                    const graphmlEntry = {
                        file_name: graphmlFileName,
                        page_url: url
                    };

                    await postgresInsertGraphMLMapping(graphmlEntry);
                    s3Server.putObject({
                        Bucket: s3PageGraphBucket,
                        Key: graphmlFileName,
                        Body: graphml.data
                    }).promise().catch(err => console.log(err));

                    resolve(true);
                } else {
                    resolve(false);
                }
            } catch(err) {
                if (pageWorked && err instanceof puppeteer_original.errors.TimeoutError) {
                    // timeout, so let's log...
                    const entry = {
                        page_url: url,
                        error_timeout: true
                    };
                    await postgresInsertError(entry);
                }

                resolve(false);
            }
        });
    }
}

async function crawlSpecificPage(execPath, domain, url, timeout) {
    const browser = await puppeteer.launch(
        { executablePath: execPath
        , dumpio: false
        , args: brave_args
        , headless: true
        }
    );

    let [page] = await browser.pages();
    const result = await Promise.race([
        tryGetImagesOnPage(page, domain, url, true, timeout)
            .catch(_err => {
                return false;
        }),
        new Promise((resolve, reject) => setTimeout(reject, timeout + 60000))
    ]).catch(async _err => {
        // we timed out with the failsafe...
        const entry = {
            page_url: url,
            error_failsafe_timeout: true
        };
        await postgresInsertError(entry);
        return false;
    });

    return { result: result, page: page, browser: browser };
}

async function crawlPage(execPath, domain, protocol, timeout) {
    const resultObject = await crawlSpecificPage(execPath, domain, protocol + domain, timeout);

    // Lingering requests...
    await sleep(2500);

    if (resultObject.result === true) {
        const children = await getChildrenLinks(resultObject.page, 10);
        await resultObject.page.close();
        await resultObject.browser.close();

        await async.eachSeries(children, async (url) => {
            const childResultObject = await crawlSpecificPage(execPath, domain, url, timeout);
            await sleep(2500);
            if (childResultObject.page) {
                await childResultObject.page.close();
            }
            await childResultObject.browser.close();
        });
    } else {
        if (resultObject.page) {
            await resultObject.page.close();
        }

        await resultObject.browser.close();
    }
}

async function getChildrenLinks(page, children) {
    let pageUrl = await parseDomain(page.url(), {privateTlds: true});
    let childrenLinks = await page.$x('//a/@href');
    let myset = new Set();
    childrenLinks = await async.mapLimit(childrenLinks, 4,
        async child => await page.evaluate(a => new URL(a.nodeValue, document.baseURI).href, child)
    );
    childrenLinks = await childrenLinks.filter( href => {
        let hrefParsed = parseDomain(href, {privateTlds: true});
        if (!hrefParsed) return false;
        if (page.url().split('?')[0] == href.split('?')[0]) return false;
        return  hrefParsed.domain == pageUrl.domain && hrefParsed.tld == pageUrl.tld;
    })
        .filter(elem => {
            url = elem.split('?')[0].split('#')[0].replace(/\/$/g,'');
            if (myset.has(url)) return false;
            else {
                myset.add(url);
                return true;
            }
        });

    childrenLinks = await shuffle(childrenLinks);
    return childrenLinks.slice(0, children);
}

(async () => {
    const inputFile = fs.readFileSync('/Users/asjosten/regional-filterlist-gen/alexa-lk-top-1-2000-20190812.txt', 'utf-8')
        .split('\n')
        .filter(Boolean);

    const argParser = new ArgumentParser({ addHelp: true });
    argParser.addArgument(
        ['-bp', '--brave-path'],
        { help: 'Path to brave executable' }
    );
    argParser.addArgument(
        ['-t', '--timeout'],
        { help: 'Set the timeout to wait for page load, in seconds' }
    );
    argParser.addArgument(
        ['-s3i'],
        {help: 'AWS endpoint for image storage'}
    );
    argParser.addArgument(
        ['-s3p'],
        {help: 'AWS endpoint for pagegraph storage'}
    );

    const args = argParser.parseArgs();
    const brave_path = args.brave_path;
    const timeout = args.timeout;
    s3ImagesBucket = args.s3i;
    s3PageGraphBucket = args.s3p;

    const startDate = new Date().getTime();
    for (let i = 0; i < inputFile.length; i++) {
        // structure of inputFile[i] is (rank,url), so we must remove the rank
        let domain = inputFile[i].trim();
        await crawlPage(brave_path, domain, 'http://', timeout * 1000);
    }

    console.log(`Time elapsed ${Math.round((new Date().getTime() - startDate) / 1000)} s`);
    process.exit(1);
})();
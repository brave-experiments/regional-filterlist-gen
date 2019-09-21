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

// default viewport...
const defaultViewport = {
    width: 1920,
    height: 1280
};

// constant for waiting for the frames to load on a page (30 seconds)
const WAIT_FOR_FRAMES_LOAD = 30000;

// constant for waiting for potential lingering requests (3 seconds)
const WAIT_FOR_LINGERING_REQUESTS = 3000;

// foldername for the s3 buckets
let s3FolderName = '';

// the user agent for the brave binary
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.72 Safari/537.36";

const brave_args = [
    '--user-agent=' + userAgent,
    '--lang=si,ta',
    '--incognito',
    '--user-data-dir-name=page_graph',
    '--v=0',
    '--disable-brave-update',
    '--enable-logging=stderr',
    '--no-sandbox'
];

puppeteer.use(pluginStealth());

async function traverseFrames(frames, url, domain) {
    while (frames.length != 0) {
        const frame = frames.pop();
        if (frame.isDetached()) {
            continue;
        }

        let children = frame.childFrames();
        frames = frames.concat(children);
        const frameBody = await frame.$('body');
        if (frameBody === null) {
            continue;
        }

        // no need to screenshot frames which are either 0 in width or height
        const frameBoundingBox = await frameBody.boundingBox();
        if (frameBoundingBox !== null && frameBoundingBox.width > 0
                && frameBoundingBox.height > 0) {

            const frameUrl = frame.url();
            const sha1ResourceUrl = frameUrl ? `x${sha1(frameUrl)}` : undefined;
            const randomIdentifier = Math.random();
            const fileName = path.join(s3FolderName, 'frames', `${domain}_${sha1ResourceUrl}_${randomIdentifier}.png`);
            const filePath = 's3://' + path.join(s3ImagesBucket, fileName);

            let insertionError = false;
            await frameBody.screenshot().then(screenshot => s3Server.putObject({
                Bucket: s3ImagesBucket,
                Key: fileName,
                Body: screenshot
            }).promise().catch(_err => insertionError = true));

            const is_local_frame = await frame.evaluate('window.parent.location.host; true').catch(_err => false);
            const parentFrame = frame.parentFrame();
            const imageData = {
                domain: domain,
                page_url: url,
                frame_id: await frame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null),
                frame_name: await frame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null),
                frame_url: frame.url(),
                is_local_frame: is_local_frame,
                parent_frame_id: parentFrame ? await parentFrame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null) : null,
                parent_frame_name: parentFrame ? await parentFrame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null) : null,
                parent_frame_url: parentFrame ? parentFrame.url() : null,
                resource_type: 'iframe',
                resource_url: frameUrl,
                imaged_data: filePath,
                sha1_resource_url: sha1ResourceUrl,
                random_identifier: randomIdentifier,
                s3_insertion_error: insertionError
            };

            await postgresInsertImageData(imageData);
        }
    }
}

async function dumpPageGraph(page, url, domain) {
    const devtools = await page.target().createCDPSession();
    const graphml = await devtools.send('Page.generatePageGraph');
    const sha1_url = sha1(url);
    const graphmlFileName = path.join(s3FolderName, `${domain}-${sha1_url}_${new Date().toISOString()}.graphml`);

    let graphmlInsertionError = false;
    s3Server.putObject({
        Bucket: s3PageGraphBucket,
        Key: graphmlFileName,
        Body: graphml.data
    }).promise().catch(_err => graphmlInsertionError = true);

    const graphmlEntry = {
        file_name: graphmlFileName,
        queried_url: url,
        page_url: page.url(),
        s3_insertion_error: graphmlInsertionError
    };

    await postgresInsertGraphMLMapping(graphmlEntry);
}

async function setViewport(page) {
    const bodyHandle = await page.$('body');
    const boundingBox = await bodyHandle.boundingBox();
    const pageViewport = {
        width: Math.max(defaultViewport.width, Math.ceil(boundingBox.width)),
        height: Math.max(defaultViewport.height, Math.ceil(boundingBox.height)),
    };
    await page.setViewport(Object.assign({}, defaultViewport, pageViewport));
}

function tryGetImagesOnPage(page, domain, url, timeout) {
    if (page) {
        console.log('visiting: ', url);
        let pageWorked = true;

        return new Promise(async (resolve, reject) => {
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
                                const randomIdentifier = Math.random();
                                const firstPartOfFileName = `${domain}_${sha1ResourceUrl}_${randomIdentifier}`;
                                const fileName = fileExtension ?
                                    path.join(s3FolderName, 'images', `${firstPartOfFileName}.${fileExtension}`) :
                                    path.join(s3FolderName, 'images', firstPartOfFileName);

                                const filePath = 's3://' + path.join(s3ImagesBucket, fileName);

                                const is_local_frame = await responseFrame.evaluate('window.parent.location.host; true').catch(_err => false);
                                if (is_local_frame) {
                                    const imageData = {
                                        domain: domain,
                                        page_url: url,
                                        frame_id: await responseFrame.evaluate(() => this.frameElement.getAttribute('id')).catch(_err => null),
                                        frame_name: await responseFrame.evaluate(() => this.frameElement.getAttribute('name')).catch(_err => null),
                                        is_local_frame: is_local_frame,
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
                                        sha1_resource_url: sha1ResourceUrl,
                                        random_identifier: randomIdentifier
                                    };

                                    s3Server.putObject({
                                        Bucket: s3ImagesBucket,
                                        Key: fileName,
                                        Body: content
                                    }).promise().catch(_err => imageData.s3_insertion_error = true);

                                    await postgresInsertImageData(imageData);
                                }
                            })
                        }
                    }
                }
            );

            try {
                const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout });
                if (response !== null && response.ok() && pageWorked) {
                    /* 
                    * All image responses for the main frame should have been captured
                    * here, so next step is to go through all subframes.
                    * However, to be safe, we start by allowing 30 seconds to have
                    * as much as possible loaded.
                    */
                    await sleep(WAIT_FOR_FRAMES_LOAD);

                    /* Before taking screenshots, modify the viewport, since
                     * screenshots will be blank if the elements are outside
                     * the viewport
                     */
                    await setViewport(page);

                    // then traverse the frames and take screenshots
                    let childFrames = await page.mainFrame().childFrames();
                    await traverseFrames(childFrames, url, domain);

                    // then fix the graphml file
                    await dumpPageGraph(page, url, domain);

                    resolve(true);
                } else {
                    resolve(false);
                }
            } catch(err) {
                if (pageWorked && err instanceof puppeteer_original.errors.TimeoutError) {
                    // Timeout... first, set the viewport...
                    await setViewport(page);

                    // then traverse the frames...
                    let childFrames = await page.mainFrame().childFrames();
                    await traverseFrames(childFrames, url, domain);

                    // and finally dump the graphml file
                    await dumpPageGraph(page, url, domain);
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
        tryGetImagesOnPage(page, domain, url, timeout)
            .catch(_err => {
                return false;
        }),
        new Promise((resolve, reject) => setTimeout(reject, timeout + 180000))
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
    await sleep(WAIT_FOR_LINGERING_REQUESTS);

    if (resultObject.result === true) {
        const children = await getChildrenLinks(resultObject.page, 4)
            .catch(_err => { return [] });
        await resultObject.page.close();
        await resultObject.browser.close();

        await async.eachSeries(children, async (url) => {
            const childResultObject = await crawlSpecificPage(execPath, domain, url, timeout);
            await sleep(WAIT_FOR_LINGERING_REQUESTS);
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
    argParser.addArgument(
        ['-s3f'],
        {help: 'Folder name for the S3 bucket'}
    );
    argParser.addArgument(
        ['-d', '--domains'],
        {help: 'Path to file with the domains to crawl'}
    );

    const args = argParser.parseArgs();
    const brave_path = args.brave_path;
    const timeout = args.timeout;
    s3ImagesBucket = args.s3i;
    s3PageGraphBucket = args.s3p;
    s3FolderName = args.s3f;

    console.log(args.domains);
    const inputFile = fs.readFileSync(args.domains, 'utf-8')
        .split('\n')
        .filter(Boolean);

    const startDate = new Date().getTime();
    for (let i = 0; i < inputFile.length; i++) {
        // structure of inputFile[i] is (rank,url), so we must remove the rank
        //let [_rank, domain] = inputFile[i].trim().split(',');
        let domain = inputFile[i].trim();
        await crawlPage(brave_path, domain, 'http://', timeout * 1000);
    }

    console.log(`Time elapsed ${Math.round((new Date().getTime() - startDate) / 1000)} s`);
    process.exit(1);
})();
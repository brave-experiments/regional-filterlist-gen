const puppeteer_original = require('puppeteer');
const puppeteer = require("puppeteer-extra");
const pluginStealth = require("puppeteer-extra-plugin-stealth");
const fs = require('fs-extra');
const ArgumentParser = require('argparse').ArgumentParser;
const mime = require("mime-types");
const fileType = require('file-type');

// the user agent for the brave binary
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.72 Safari/537.36";

const brave_args = [
    '--user-agent=' + userAgent,
    '--incognito',
    '--user-data-dir-name=page_graph',
    '--v=0',
    '--disable-brave-update',
    '--enable-logging=stderr',
    '--no-sandbox'
];

const errorsFolderPath = __dirname + '/errors/';

puppeteer.use(pluginStealth());

function tryGetImagesOnPage(page, protocol, url, timeout) {
    const imagesFolderPath = __dirname + `/images/${url}/`;

    let imageData = {};
    let imageNbr = 0;
    let pageWorked = true;

    return new Promise(async (resolve, reject) => {
        page.on(
            'error',
            err => { 
                pageWorked = false;
                reject(err);
            }
        );

        page.on(
            'response',
             response => {
                if (response.ok()) {
                    const request = response.request();
                    if (request.resourceType() === 'image') {
                        const responseHeaders = response.headers();
                        if (responseHeaders['content-length'] === 'undefined' ||
                                responseHeaders['content-length'] === '0') {
                            return;
                        }
    
                        response.buffer().then(content => {
                            if (!fs.existsSync(imagesFolderPath)) {
                                fs.mkdirSync(imagesFolderPath);
                            }
    
                            let fileExtension = responseHeaders['content-type'] ?
                                mime.extension(responseHeaders['content-type']) : undefined;
                            if (fileExtension === undefined) {
                                const actualFileType = fileType(content.slice(0, fileType.minimumBytes));
                                if (actualFileType) {
                                    fileExtension = actualFileType.ext;
                                }
                            }
    
                            const filePath = imagesFolderPath + `${imageNbr}.${fileExtension}`;
                            imageNbr++;
                            const writeStream = fs.createWriteStream(filePath);
                            writeStream.write(content);
    
                            const responseFrame = response.frame();
                            imageData[`${imageNbr}.${fileExtension}`] = {
                                url: response.url(),
                                data: content,
                                frameId: responseFrame.evaluate(
                                    () => this.frameElement.getAttribute('id'))
                                    .catch(_err => null),
                                frameName: responseFrame.evaluate(
                                    () => this.frameElement.getAttribute('name'))
                                    .catch(_err => null),
                                frameUrl: responseFrame.url()
                            };
                        })
                        .catch(err => {
                            console.log('a weird error... ', err);
                        });
                    }
                }
            }
        );

        try {
            let response = await page.goto(protocol + url, { waitUntil: 'networkidle0', timeout: timeout });
            if (response === null) {
                // response sometimes get null, then wait for it again
                console.log('response was null');
                response = await page.waitForResponse(() => true);
            }
            if (response.ok() && pageWorked) {
                const devtools = await page.target().createCDPSession();
                const graphml = await devtools.send('Page.generatePageGraph');
                fs.writeFileSync('graphml/' + url + '.graphml', graphml.data);

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
                        const filePath = imagesFolderPath + `${imageNbr}.png`;
                        imageNbr++;
                        await page.screenshot({
                            path: filePath,
                            clip: {
                                x: frameBoundingBox.x,
                                y: frameBoundingBox.y,
                                width: Math.ceil(frameBoundingBox.width),
                                height: Math.ceil(frameBoundingBox.height)
                            }
                        });

                        imageData[`${imageNbr}.png`] = {
                            url: url,
                            data: filePath,
                            frameId: childFrame.evaluate(
                                () => this.frameElement.getAttribute('id'))
                                .catch(_err => null),
                            frameName: childFrame.evaluate(
                                () => this.frameElement.getAttribute('name'))
                                .catch(_err => null),
                            frameUrl: childFrame.url()
                        };
                    }
                }

                fs.writeFileSync(imagesFolderPath + 'image_data.json', JSON.stringify(imageData));
            } else {
                fs.writeFileSync('response_errors.log', url + ': ' + response.status() + '\n', { flag: 'a' });
            }
            resolve(true);
        } catch(err) {
            if (pageWorked && err instanceof puppeteer_original.errors.TimeoutError) {
                console.log('received timeout for: ' + url);
                fs.writeFileSync('timeouts.log', url + '\n', { flag: 'a' });
                resolve(false);
            } else if (pageWorked) {
                console.log('Got an unknown error for: ' + url + ': ' + err);
                fs.writeFileSync(errorsFolderPath + url + '.error', err);
                resolve(false);
            }
        } finally {
            if (pageWorked) {
                await page.close()
            }
        }
    });
}

async function crawlPage(execPath, protocol, url, timeout) {
    const browser = await puppeteer.launch(
        { executablePath: execPath
        , dumpio: false
        , args: brave_args
        , headless: true
        }
    );

    console.log(url);

    let [page] = await browser.pages();
    const result = await tryGetImagesOnPage(page, protocol, url, timeout)
        .catch(err => {
            // page crashed! Then log it, and remove the images
            console.log('---- error for ' + url + ': ' + err);
            fs.writeFileSync(errorsFolderPath + url + '.error', err);
            const imageFolder = __dirname + `/images/${url}`;
            fs.removeSync(imageFolder)
        });

    await browser.close();
}

(async () => {
    const inputFile = fs.readFileSync('/Users/asjosten/regional-filterlist-gen/crawler/top-1m.csv', 'utf-8')
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

    const args = argParser.parseArgs();
    const brave_path = args.brave_path;
    const timeout = args.timeout;
    const startDate = new Date().getTime();
    for (let i = 0; i < 500; i++) {
        // structure of inputFile[i] is (rank,url), so we must remove the rank
        let line = inputFile[i].trim();
        const [_rank, url] = line.split(',');
        await crawlPage(brave_path, 'http://', url, timeout * 1000);
    }

    //await crawlPage(brave_path, 'http://', 'sina.com.cn', timeout * 1000);
    console.log(`Time elapsed ${Math.round((new Date().getTime() - startDate) / 1000)} s`);
})();
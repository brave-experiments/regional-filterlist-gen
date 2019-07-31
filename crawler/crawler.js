const puppeteer_original = require('puppeteer');
const puppeteer = require("puppeteer-extra");
const pluginStealth = require("puppeteer-extra-plugin-stealth");
const fs = require('fs');
const ArgumentParser = require('argparse').ArgumentParser;
const mime = require("mime-types");
const fileType = require('file-type');

// the user agent for the brave binary
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.72 Safari/537.36";

const brave_args = [
    /*'--ignore-certificate-errors',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--no-first-run',
    '--enable-automation',
    '--password-store=basic',
    '--use-mock-keychain',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
    '--remote-debugging-port=0',*/
    '--user-agent=' + userAgent,
    '--incognito',
    '--user-data-dir-name=page_graph',
    '--v=0',
    '--disable-brave-update',
    '--enable-logging=stderr',
    '--no-sandbox'
];

puppeteer.use(pluginStealth());

async function crawlPage(execPath, protocol, url, timeout) {
    const browser = await puppeteer.launch(
        { executablePath: execPath
        , dumpio: false
        , args: brave_args
        , headless: true
        }
    );
    let pageWorked = true;

    console.log(url);
    let imageNbr = 0;
    let [page] = await browser.pages();
    page.on(
        'error',
        err => {
            console.log('---- error for ' + url + ': ' + err);
            fs.writeFileSync('errors/' + url + '.error', err);
            pageWorked = false;
            //page.close();
        }
    );

    page.on(
        'response',
        async response => {
            if (response.ok()) {
                const request = response.request();
                if (request.resourceType() === 'image') {
                    const responseHeaders = response.headers();
                    if (responseHeaders['content-length'] === 'undefined' ||
                            responseHeaders['content-length'] === '0') {
                        return;
                    }
                    await response.buffer().then(content => {
                        const path = __dirname + `/images/${url}`;
                        if (!fs.existsSync(path)) {
                            fs.mkdirSync(path);
                        }

                        let fileExtension = responseHeaders['content-type'] ?
                            mime.extension(responseHeaders['content-type']) : undefined;
                        if (fileExtension === undefined) {
                            const actualFileType = fileType(content.slice(0, fileType.minimumBytes));
                            if (actualFileType) {
                                fileExtension = actualFileType.ext;
                            }
                        }

                        const filePath = path + `/${imageNbr}.${fileExtension}`;
                        imageNbr++;
                        const writeStream = fs.createWriteStream(filePath);
                        writeStream.write(content);
                    });
                }
            }
        }
    );

    await page.goto(protocol + url, { waitUntil: 'networkidle0', timeout: timeout })
        .then(async response => {
            if (response === null) {
                // response sometimes get null, then wait for it again
                response = await chromePage.waitForResponse(() => true);
            }
            if (pageWorked && response.ok()) {
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
                        const filePath = __dirname + `/images/${url}/${imageNbr}.png`;
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
                    }
                }
            } else if (pageWorked) {
                fs.writeFileSync('response_errors.log', url + ': ' + response.status() + '\n', { flag: 'a' });
            }
        })
        .catch(err => {
            if (err instanceof puppeteer_original.errors.TimeoutError) {
                if (pageWorked) { // Only log as timeout errors if the page didn't crash
                    console.log('received timeout for: ' + url);
                    fs.writeFileSync('timeouts.log', url + '\n', { flag: 'a' });
                }
            } else {
                if (pageWorked) {
                    console.log('Got an unknown error for: ' + url + ': ' + err);
                    fs.writeFileSync('errors/' + url + '.error', err);
                }
            }
        });

    if (pageWorked) {
        await page.close();
    }
    await browser.close();
}

(async () => {
    const inputFile = fs.readFileSync('top-1m.csv', 'utf-8')
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

    console.log(`Time elapsed ${Math.round((new Date().getTime() - startDate) / 1000)} s`);
})();
const AdBlockClient = require('adblock-rs');
const fs = require('fs');
const path = require('path');

const list_folder = path.join(__dirname, 'filter_lists');

const el_rules = fs.readFileSync(path.join(list_folder, 'easylist.txt'), { encoding: 'utf-8' }).split('\n');
const sri_lanka_rules = fs.readFileSync(path.join(list_folder, 'sri_lanka.txt'), { encoding: 'utf-8' }).split('\n');
const ep_rules = fs.readFileSync(path.join(list_folder, 'easyprivacy.txt'), { encoding: 'utf-8' }).split('\n');

const combined_rules = el_rules.concat(sri_lanka_rules).concat(ep_rules);

const image_resources = fs.readFileSync(path.join(__dirname, 'resources', 'images_all.csv'), {encoding: 'utf-8'}).split('\n');
const iframes_resources = fs.readFileSync(path.join(__dirname, 'resources', 'iframes_all.csv'), {encoding: 'utf-8'}).split('\n');

const script_resources = fs.readFileSync(path.join(__dirname, 'resources', 'block_urls'), {encoding: 'utf-8'}).split('\n');

let result = {};

for (let i = 0; i < 4; i++) {
    let client;
    if (i == 0) {
        client = new AdBlockClient.Engine(el_rules, true);
    } else if (i == 1) {
        client = new AdBlockClient.Engine(sri_lanka_rules, true);
    } else if (i == 2) {
        client = new AdBlockClient.Engine(ep_rules, true);
    } else {
        client = new AdBlockClient.Engine(combined_rules, true);
    }

    let imagesMatching = 0;
    let imagesNotMatching = 0;
    for (const line of image_resources) {
        if (line) {
            const [pageUrl, resourceType, resourceUrl] = line.split(',');
            if (client.check(resourceUrl, pageUrl, resourceType)) {
                imagesMatching++;
            } else {
                imagesNotMatching++;
            }
        }
    }

    let iframesMatching = 0;
    let iframesNotMatching = 0;
    for (const line of iframes_resources) {
        if (line) {
            const [pageUrl, _resourceType, resourceUrl] = line.split(',');
            if (client.check(resourceUrl, pageUrl, 'sub_frame')) {
                iframesMatching++;
            } else {
                iframesNotMatching++;
            }
        }
    }

    let scriptsMatching = 0;
    let scriptsNotMatching = 0;
    for (const line of script_resources) {
        if (line) {
            const [pageUrl, resourceUrl] = line.split(',');
            if (client.check(resourceUrl, pageUrl, 'script')) {
                scriptsMatching++;
            } else {
                scriptsNotMatching++;
            }
        }
    }

    result[i] = { 'imagesMatching': imagesMatching
                , 'imagesNotMatching': imagesNotMatching
                , 'iframesMatching': iframesMatching
                , 'iframesNotMatching': iframesNotMatching
                , 'scriptsMatching': scriptsMatching
                , 'scriptsNotMatching': scriptsNotMatching
                };
}

console.log(result)


/* create client with debug = true


console.log("Matching:", client.check("http://example.com/-advertisement-icon.", "http://example.com/helloworld", "image"))
// Match with full debuging info
console.log("Matching:", client.check("http://example.com/-advertisement-icon.", "http://example.com/helloworld", "image", true))
// No, but still with debugging info
console.log("Matching:", client.check("https://github.githubassets.com/assets/frameworks-64831a3d.js", "https://github.com/AndriusA", "script", true))
// Example that inlcludes a redirect response
console.log("Matching:", client.check("https://bbci.co.uk/test/analytics.js", "https://bbc.co.uk", "script", true))*/
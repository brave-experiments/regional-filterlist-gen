const AdBlockClient = require('adblock-rs');
const fs = require('fs');
const path = require('path');

const list_folder = path.join(__dirname, 'filter_lists');

const el_rules = fs.readFileSync(path.join(list_folder, 'easylist.txt'), { encoding: 'utf-8' }).split('\n');
const sri_lanka_rules = fs.readFileSync(path.join(list_folder, 'sri_lanka.txt'), { encoding: 'utf-8' }).split('\n');

const combined_rules = el_rules.concat(sri_lanka_rules);

const image_resources = fs.readFileSync(path.join(__dirname, 'resources', 'images.csv'), {encoding: 'utf-8'}).split('\n');
const iframes_resources = fs.readFileSync(path.join(__dirname, 'resources', 'iframes.csv'), {encoding: 'utf-8'}).split('\n');

const client = new AdBlockClient.Engine(combined_rules, true);

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
        const [pageUrl, resourceType, resourceUrl] = line.split(',');
        if (client.check(resourceUrl, pageUrl, resourceType)) {
            iframesMatching++;
        } else {
            iframesNotMatching++;
        }
    }
}

console.log(`imagesMatching: ${imagesMatching}, imagesNotMatching: ${imagesNotMatching}`);
console.log(`iframesMatching: ${iframesMatching}, iframesNotMatching: ${iframesNotMatching}`);


/* create client with debug = true


console.log("Matching:", client.check("http://example.com/-advertisement-icon.", "http://example.com/helloworld", "image"))
// Match with full debuging info
console.log("Matching:", client.check("http://example.com/-advertisement-icon.", "http://example.com/helloworld", "image", true))
// No, but still with debugging info
console.log("Matching:", client.check("https://github.githubassets.com/assets/frameworks-64831a3d.js", "https://github.com/AndriusA", "script", true))
// Example that inlcludes a redirect response
console.log("Matching:", client.check("https://bbci.co.uk/test/analytics.js", "https://bbc.co.uk", "script", true))*/
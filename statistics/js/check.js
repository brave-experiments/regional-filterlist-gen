const AdBlockClient = require('adblock-rs');
const ArgumentParser = require('argparse').ArgumentParser;

const fs = require('fs');
const path = require('path');

const argParser = new ArgumentParser({ addHelp: true });
argParser.addArgument(
    ['-s', '--supplement'],
    { help: 'supplement list to use' }
);

const args = argParser.parseArgs();
const supplement_folder = args.supplement;

const list_folder = path.join(__dirname, 'filter_lists');
const el_rules = fs.readFileSync(path.join(list_folder, 'easylist.txt'), { encoding: 'utf-8' }).split('\n');
const supplement_filename = fs.readdirSync(path.join(list_folder, supplement_folder))[0]
const supplement_rules = fs.readFileSync(path.join(list_folder, supplement_folder, supplement_filename), { encoding: 'utf-8' }).split('\n');
const ep_rules = fs.readFileSync(path.join(list_folder, 'easyprivacy.txt'), { encoding: 'utf-8' }).split('\n');

const combined_rules = el_rules.concat(supplement_rules).concat(ep_rules);

chains_path = path.join('..', '..', 'chains_resources');

const client = new AdBlockClient.Engine(combined_rules, true);
let foundBlocked = new Set();
let allBlockedUnique = new Set();
let allBlocked = [];
let framesBlockedUnique = new Set();
let framesBlocked = 0;
let imagesBlocked = 0;
let imagesBlockedUnique = new Set();
let notTopMostOne = 0;
const dataFile = require(path.join(chains_path, supplement_folder,  'original_everything_albania.json'));
for (const pageUrl in dataFile) {
    for (const imageData in dataFile[pageUrl]) {
        const [resourceUrl, resourceType, chain] = dataFile[pageUrl][imageData];
        const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
        const actualResourceType = resourceType === 'image' ? 'image' : 'sub_frame';

        let found = false;
        const chainLength = chain.length;
        chain.reverse(); // to have the top most script first
        for (let i = 0; i < chainLength; i++) {
            if(!chain[i].startsWith('blob:') && !chain[i].startsWith('data:')) {
                if (client.check(chain[i], pageUrl, 'script')) {
                    if (i != 0) {
                        notTopMostOne++;
                    }
                    foundBlocked.add(chain[i]);
                    const remainingElems = chain.slice(i);
                    allBlocked = allBlocked.concat(remainingElems);
                    for (let elem of remainingElems) {
                        allBlockedUnique.add(elem);
                    }
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            if (unquotedResourceUrl.startsWith('data:') || unquotedResourceUrl.startsWith('blob:')) {
                continue;
            }
            if (client.check(unquotedResourceUrl, pageUrl, actualResourceType)) {
                foundBlocked.add(unquotedResourceUrl);
                allBlocked.push(unquotedResourceUrl);
                allBlockedUnique.add(unquotedResourceUrl);
                if (actualResourceType === 'image') {
                    imagesBlocked++;
                    imagesBlockedUnique.add(unquotedResourceUrl);
                } else {
                    framesBlocked++;
                    framesBlockedUnique.add(unquotedResourceUrl);
                }
            }
        } else {
            allBlocked.push(unquotedResourceUrl);
            allBlockedUnique.add(unquotedResourceUrl);
            if (actualResourceType === 'image') {
                imagesBlocked++;
                imagesBlockedUnique.add(unquotedResourceUrl);
            } else {
                framesBlocked++;
                framesBlockedUnique.add(unquotedResourceUrl);
            }
        }
    }
}

console.log('unique resources that is blocking: ' + foundBlocked.size);
console.log('all resources blocked: ' + allBlockedUnique.size);
console.log('resources blocked: ' + allBlocked.length);
console.log('images blocked: ' + imagesBlocked);
console.log('unique images blocked: ' + imagesBlockedUnique.size);
console.log('frames blocked: ' + framesBlocked);
console.log('unique frames blocked: ' + framesBlockedUnique.size);
console.log('not top most one: ' + notTopMostOne);
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

chains_path = path.join(__dirname, 'chains_resources');

const client = new AdBlockClient.Engine(combined_rules, true);
let blockedResourcesPerPageUrl = {};
let uniqueBlockedResources = new Set();
let outputMap = {};
const dataFile = require(path.join(chains_path, supplement_folder,  `downstream_everything_${supplement_folder}.json`));
for (const pageUrl in dataFile) {
    for (const imageData in dataFile[pageUrl]) {
        const [_resourceUrl, _resourceType, chain] = dataFile[pageUrl][imageData];
        const chainLength = chain.length;
        chain.reverse(); // to have the top most script first
        for (let i = 0; i < chainLength; i++) {
            if(!chain[i].startsWith('blob:') && !chain[i].startsWith('data:')) {
                if (client.check(chain[i], pageUrl, 'script')) {
                    outputMap[imageData] = chain[i];
                    if (blockedResourcesPerPageUrl[pageUrl] === undefined) {
                        blockedResourcesPerPageUrl[pageUrl] = {};
                        blockedResourcesPerPageUrl[pageUrl][chain[i]] = chain.slice(i).length;
                        for (let elem of chain.slice(i)) {
                            uniqueBlockedResources.add(elem);
                        }
                    } else {
                        if (blockedResourcesPerPageUrl[pageUrl][chain[i]] === undefined) {
                            blockedResourcesPerPageUrl[pageUrl][chain[i]] = chain.slice(i).length;
                            for (let elem of chain.slice(i)) {
                                uniqueBlockedResources.add(elem);
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
}

let additionalResources = 0;
for (let pageUrl in blockedResourcesPerPageUrl) {
    for (let blocked in blockedResourcesPerPageUrl[pageUrl]) {
        additionalResources += blockedResourcesPerPageUrl[pageUrl][blocked];
    }
}

console.log('additional resources: ', additionalResources);
console.log('unique resources: ', uniqueBlockedResources.size);

fs.writeFileSync('chain_blocking_' + supplement_folder + '.json', JSON.stringify(outputMap), 'utf8');
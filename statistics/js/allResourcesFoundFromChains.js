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

const list_folder = path.join('..', '..', 'adblock-rust-checking', 'filter_lists');
const el_rules = fs.readFileSync(path.join(list_folder, 'easylist.txt'), { encoding: 'utf-8' }).split('\n');
const supplement_filename = fs.readdirSync(path.join(list_folder, supplement_folder))[0]
const supplement_rules = fs.readFileSync(path.join(list_folder, supplement_folder, supplement_filename), { encoding: 'utf-8' }).split('\n');
const ep_rules = fs.readFileSync(path.join(list_folder, 'easyprivacy.txt'), { encoding: 'utf-8' }).split('\n');

const combined_rules = el_rules.concat(supplement_rules).concat(ep_rules);

chains_path = path.join('..', '..', 'chains_resources');

const dataFiles = ['upstream_lists', 'upstream_us_difference_lists'];
let uniqueResources = new Set();
let allResources = [];
for (let dataFile of dataFiles) {
    console.log(dataFile);
    const file = require(path.join(chains_path, supplement_folder,  dataFile + '.json'));
    for (const pageUrl in file) {
        for (const imageData in file[pageUrl]) {
            const [resourceUrl, resourceType, chain] = file[pageUrl][imageData];
            const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
            if (unquotedResourceUrl.startsWith('data:') || unquotedResourceUrl.startsWith('blob:')) {
                continue;
            }

            // we should take everything from the chain...
            for (let i = 0; i < chain.length; i++) {
                uniqueResources.add(chain[i]);
                allResources.push(chain[i]);
            }
        }
    }
}


console.log('total unique resources: ', uniqueResources.size);
console.log('total resources: ', allResources.length);
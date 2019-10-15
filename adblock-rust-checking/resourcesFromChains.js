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
const dataFile = require(path.join(chains_path, supplement_folder,  'upstream_all.json'));
let uniqueResources = new Set();
for (const pageUrl in dataFile) {
    for (const imageData in dataFile[pageUrl]) {
        const [resourceUrl, resourceType, chain] = dataFile[pageUrl][imageData];
        const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
        const actualResourceType = resourceType === 'image' ? 'image' : 'sub_frame';
        if (unquotedResourceUrl.startsWith('data:') || unquotedResourceUrl.startsWith('blob:')) {
            continue;
        }

        // If the current lists classify as ad, take the highest point in the
        // chain if the current list does not block it
        if (client.check(unquotedResourceUrl, pageUrl, actualResourceType)) {
            const chainLength = chain.length;
            if (chainLength > 0) {
                chain.reverse(); // to have the top most script first
                if (!client.check(chain[0], pageUrl, 'script')) {
                    uniqueResources.add(chain[0]);
                }
            }
        } else {
            // Otherwise it's something we block, and we do the same..
            const chainLength = chain.length;
            if (chainLength > 0) {
                chain.reverse(); // to have the top most script first
                if (!client.check(chain[0], pageUrl, 'script')) {
                    uniqueResources.add(chain[0]);
                }
            } else {
                uniqueResources.add(unquotedResourceUrl);
            }
        }
    }
}

let output = '';
for (let resource of uniqueResources) {
    output += resource + '\n';
}

fs.writeFileSync(supplement_folder + '.txt', output);
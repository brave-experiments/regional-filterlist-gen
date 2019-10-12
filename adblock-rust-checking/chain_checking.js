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
const types = ['us', 'filterlists', 'all'];
const files = ['upstream', 'original'];

const client = new AdBlockClient.Engine(combined_rules, true);
for (const type of types) {
    for (const file of files) {
        let resourcesMissed = 0;
        let uniqueResourcesMissed = 0;
        const dataFile = require(path.join(chains_path, supplement_folder, file + '_' + type + '.json'));
        for (const pageUrl in dataFile) {
            uniqueResources = new Set();
            for (const imageData in dataFile[pageUrl]) {
                const [resourceUrl, resourceType, chain] = dataFile[pageUrl][imageData];
                const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
                const actualResourceType = resourceType === 'image' ? 'image' : 'sub_frame';
                if (unquotedResourceUrl.startsWith('data:') || unquotedResourceUrl.startsWith('blob:')) {
                    continue;
                }

                if (client.check(unquotedResourceUrl, pageUrl, actualResourceType)) {
                    const chainLength = chain.length;
                    chain.reverse(); // to have the top most script first
                    for (let i = 0; i < chainLength; i++) {
                        if (!client.check(chain[i], pageUrl, 'script')) {
                            resourcesMissed++;
                            uniqueResources.add(chain[i]);
                        } else {
                            break;
                        }
                    }
                }
            }

            uniqueResourcesMissed += uniqueResources.size;
        }

        console.log();
        console.log(file + '_' + type);
        console.log('unique resources missed from chains: ' + uniqueResourcesMissed);
        console.log('resources missed: ' + resourcesMissed);
    }
}

console.log('\n--------------------------------------');
console.log('--------------------------------------');

for (const file of files) {
    let resourcesMissed = 0;
    const dataFile = require(path.join(chains_path, supplement_folder, file + '_us' + '.json'));
    let uniqueResourcesMissed = 0;
    for (const pageUrl in dataFile) {
        uniqueResources = new Set();
        for (const imageData in dataFile[pageUrl]) {
            const [resourceUrl, resourceType, chain] = dataFile[pageUrl][imageData];
            const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
            const actualResourceType = resourceType === 'image' ? 'image' : 'sub_frame';
            if (unquotedResourceUrl.startsWith('data:') || unquotedResourceUrl.startsWith('blob:')) {
                continue;
            }

            if (!client.check(unquotedResourceUrl, pageUrl, actualResourceType)) {
                const chainLength = chain.length;
                chain.reverse();
                let found = false;
                for (let i = 0; i < chainLength; i++) {
                    if (!client.check(chain[i], pageUrl, 'script')) {
                        resourcesMissed++;
                        uniqueResources.add(chain[i]);
                    } else {
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    resourcesMissed++;
                    uniqueResources.add(resourceUrl);
                }
            }
        }

        uniqueResourcesMissed += uniqueResources.size;
    }

    console.log();
    console.log(file + '_us');
    console.log('unique resources missed: ' + uniqueResourcesMissed);
    console.log('resources missed: ' + resourcesMissed);
}
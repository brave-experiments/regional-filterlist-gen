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

const resource_folder = path.join(path.join(__dirname, 'resources', supplement_folder));
const images_blocked_by_us = fs.readFileSync(path.join(resource_folder, 'classified_ad_images.txt'), {encoding: 'utf-8'}).split('\n');
const frames_blocked_by_us = fs.readFileSync(path.join(resource_folder, 'classified_ad_frames.txt'), {encoding: 'utf-8'}).split('\n');
const images_not_blocked_by_us = fs.readFileSync(path.join(resource_folder, 'classified_nonad_images.txt'), {encoding: 'utf-8'}).split('\n');
const frames_not_blocked_by_us = fs.readFileSync(path.join(resource_folder, 'classified_nonad_frames.txt'), {encoding: 'utf-8'}).split('\n');

let result = {
    'easylist': {},
    'supplement': {},
    'easyprivacy': {},
    'combined_filterlists': {}
};

const blockedMapping = {
    'easylist': [],
    'supplement': [],
    'easyprivacy': [],
    'combined_filterlists': []
};

const notBlockedMapping = {
    'easylist': [],
    'supplement': [],
    'easyprivacy': [],
    'combined_filterlists': []
};

for (let clientName in result) {
    let client;
    if (clientName == 'easylist') {
        client = new AdBlockClient.Engine(el_rules, true);
    } else if (clientName == 'supplement') {
        client = new AdBlockClient.Engine(supplement_rules, true);
    } else if (clientName == 'easyprivacy') {
        client = new AdBlockClient.Engine(ep_rules, true);
    } else {
        client = new AdBlockClient.Engine(combined_rules, true);
    }

    let blockedByUsAndNotList = 0;

    let imageBlockedByUsAndList = 0;
    let imageBlockedByUsAndNotList = 0;
    for (const line of images_blocked_by_us) {
        if (line) {
            const [pageUrl, resourceType, resourceUrl, imaged_data] = line.match(/("[^"]*")|[^,]+/g);
            const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
            if (client.check(unquotedResourceUrl, pageUrl, resourceType)) {
                imageBlockedByUsAndList++;
                blockedMapping[clientName].push(imaged_data);
            } else {
                imageBlockedByUsAndNotList++;
                blockedByUsAndNotList++;
                notBlockedMapping[clientName].push(imaged_data);
            }
        }
    }

    
    let imageNotBlockedByUsButList = 0;
    let imageNotBlockedByUsAndList = 0;
    for (const line of images_not_blocked_by_us) {
        if (line) {
            const [pageUrl, resourceType, resourceUrl, imaged_data] = line.match(/("[^"]*")|[^,]+/g);
            const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
            if (unquotedResourceUrl.startsWith('data:') || unquotedResourceUrl.startsWith('blob:')) {
                continue;
            }
            if (client.check(unquotedResourceUrl, pageUrl, resourceType)) {
                imageNotBlockedByUsButList++;
                blockedMapping[clientName].push(imaged_data);
            } else {
                imageNotBlockedByUsAndList++;
                notBlockedMapping[clientName].push(imaged_data);
            }
        }
    }

    let frameBlockedByUsAndList = 0;
    let frameBlockedByUsAndNotList = 0;
    for (const line of frames_blocked_by_us) {
        if (line) {
            const [pageUrl, resourceType, resourceUrl, imaged_data] = line.match(/("[^"]*")|[^,]+/g);
            const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
            if (client.check(unquotedResourceUrl, pageUrl, 'sub_frame', true)) {
                frameBlockedByUsAndList++;
                blockedMapping[clientName].push(imaged_data);
            } else {
                frameBlockedByUsAndNotList++;
                blockedByUsAndNotList++;
                notBlockedMapping[clientName].push(imaged_data);
            }
        }
    }

    let frameNotBlockedByUsButList = 0;
    let frameNotBlockedByUsAndNotList = 0;
    for (const line of frames_not_blocked_by_us) {
        if (line) {
            const [pageUrl, resourceType, resourceUrl, imaged_data] = line.match(/("[^"]*")|[^,]+/g);
            const unquotedResourceUrl = resourceUrl.replace(/"/g,"");
            if (client.check(unquotedResourceUrl, pageUrl, 'sub_frame', true)) {
                frameNotBlockedByUsButList++;
                blockedMapping[clientName].push(imaged_data);
            } else {
                frameNotBlockedByUsAndNotList++;
                notBlockedMapping[clientName].push(imaged_data);
            }
        }
    }

    // result[clientName] = { 'imageBlockedByUsAndList': imageBlockedByUsAndList
    //                      , 'imageBlockedByUsAndNotList': imageBlockedByUsAndNotList
    //                      , 'imageNotBlockedByUsButList': imageNotBlockedByUsButList
    //                      , 'imageNotBlockedByUsAndList': imageNotBlockedByUsAndList
    //                      , 'frameBlockedByUsAndList': frameBlockedByUsAndList
    //                      , 'frameBlockedByUsAndNotList': frameBlockedByUsAndNotList
    //                      , 'frameNotBlockedByUsButList': frameNotBlockedByUsButList
    //                      , 'frameNotBlockedByUsAndNotList': frameNotBlockedByUsAndNotList
    //                      , 'totalBlockedByUsAndNotList': blockedByUsAndNotList
    //                      };
}

console.log(result)
fs.writeFileSync('blocking_' + supplement_folder + '.json', JSON.stringify(blockedMapping), 'utf8');
fs.writeFileSync('non_blocking_' + supplement_folder + '.json', JSON.stringify(notBlockedMapping), 'utf8');
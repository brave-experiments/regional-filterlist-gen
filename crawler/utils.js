const crypto = require('crypto');

function sha1(data) {
    return crypto.createHash('sha1').update(data, 'binary').digest('hex');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffle(array) {
    let currentIndex = array.length - 1;
    while (currentIndex > 0) {
        let i = Math.floor(Math.random() * currentIndex);
    
        // And swap it with the current element.
        const tmp = array[currentIndex];
        array[currentIndex] = array[i];
        array[i] = tmp;

        currentIndex--;
    }
    
    return array;
}

module.exports = {
    sha1: sha1,
    sleep: sleep,
    shuffle: shuffle
};
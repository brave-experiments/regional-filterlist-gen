# regional-filterlist-gen

Details are in each subfolder, but to run it, the following should be done:

* Start by running the crawler located in `crawler`.
* Once the crawler is done, classify the images. This is done in two steps.
    - First, execute `extract_features.py` in `feature-extractor`
    - Then, execute `classifier.py` in `classifier`.
* Once the classification is done, run the chain generation in `chain_generation` with `--direction` set to `downstream`.
* After that, head over to `adblock-rust-checking`.
    - First execute `checkAll.js`
    - After that, execute `insert_all.py`
    - Then, execute `checking.js`
    - Execute `insert.py`
* At this point, the database should contain all the information needed to get statistics.
* Still in `adblock-rust-checking`, execute `resourcesFromChains.js`, which will create an output file to be used to generate filter list rules.
* As a last step, execute `filterlist-generator/generate-filterlist.py`
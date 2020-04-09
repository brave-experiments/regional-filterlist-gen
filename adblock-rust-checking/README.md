You should have the chain resources files from running numbers/generate.py in chain_resources/region.

# checking.js
Checks how all resources we identify as ads are blocked against each individual filter list.
Produces outputs `blocking_region.json` and `non_blocking_region.json`, which will be used by `insertion.py` to insert it to the database.

# checkAll.js
Checks all downstream requests against the filter lists.
Executed with `node checkAll.js -s region`, where region is the supplement region.
It outputs the file `chain_blocking_region.json`, which maps the top most blocked element in the chain to all the other elements that is blocked due to the top most element being blocked.

# allResourcesFoundFromChains.js
This checks all additional files found by looking at the chains.
Executed with `node allResourcesFoundFromChains.js -s region`.

# resourcesFromChains.js
This generates a text file containing all the highest resources blocked from chains.
Executed with `node resourcesFromChains.js -s region`.
Move this text file to `../filterlist-generator`, since it is then used there.

# insertion.py
Inserts the blocking and non-blocking features into the database.
Executed with `PG_CONNECTION_STRING="postgressql-database-string" python insertion.py`.
This should be done before `insert_all.py`.

# insert_all.py
Inserts into the database the resource which is blocked through chains, as well as mapping them to the resource which is actually blocked.
Executed with `PG_CONNECTION_STRING="postgressql-database-string" python insert_all.py --region region`.
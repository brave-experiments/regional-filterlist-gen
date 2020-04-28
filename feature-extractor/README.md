In order to execute the feature extractor, first install the perceptual classifier (found under classifier/perceptual).

Them to extract features, execute `PG_CONNECTION_STRING="postgressql-database" python3 extract_features.py --aws-access-key AWS_ACCESS_KEY --aws-secret-key AWS_SECRET_KEY --pg-bucket BUCKET_TO_PAGEGRAPH_FILES`.

# Content features extracted
* image width
* image height
* is image a standard ad width?
* is image a standard ad height?
* is image a standard ad size?
* length of resource url
* is it from a subdomain?
* is it from a third party?
* is the base domain in query string?
* is there a semi colon in query string?
* is it an iframe?
* ad probability from perceptual classifier

# Structural features extracted
* node in degree
* node in average degree connectivity
* node out degree
* node out_average_degree_connectivity
* node in-out degree
* node in-out average degree connectivity
* node is modified by script?
* parent in degree
* parent in average degree connectivity
* parent out degree
* parent out average degree connectivity
* parent in-out degree
* parent in-out average degree connectivity
* is parent_modified_by_script?
* amount of nodes
* amount of edges
* nodes-edge ratio
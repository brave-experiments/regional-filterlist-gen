The crawler is designed to add data to a database and to S3.

# Run with S3 and local DB
Change the variables accordingly.
```
AWS_PROFILE=profile \
 AWS_ACCESS_KEY_ID=ACCESS_KEY \
 AWS_SECRET_ACCESS_KEY=SECRET_ACCESS_KEY \
 PG_CONNECTION_STRING="database-string" \
 PG_DATABASE_ERROR_FOLDER="database-errors" \
 node crawler.js -bp "path/to/pagegraph-brave" -t 120 -s3i "image-bucket" -s3p "page-graph-bucket" -s3f "folder-name-in-s3-bucket" -d "path/to/domains.csv (e.g. Alexa top 1m)"
```
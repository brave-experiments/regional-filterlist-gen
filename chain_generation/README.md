# Run the chain generation
To run the chain generation, execute the following command:
```
PG_CONNECTION_STRING="string-to-database" python3 generate_chains.py --aws-access-key AWS_ACCESS_KEY --aws-secret-key AWS_SECRET_KEY --pg-bucket 'bucket-to-pagegraph-files' --region REGION --direction DIRECTION
```
where `REGION` is the region to generate the chains for.
`DIRECTION` is optional (it is either `downstream`, or omitted).

This is used when creating the output folder, which will be located at `../chains_resources/region`.

The generated files will be used by `../adblock-rust-checking`, to determine where to block etc.
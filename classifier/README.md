To run the classifier, simply run:
`PG_CONNECTION_STRING_TRAINING_DATA="database-with-training-data" PG_CONNECTION_STRING_CLASSIFICATION_DATA="database-with-images-to-be-classified" python classifier.py`

You must ensure that the folder `training_data` contains `csv` files with the "links" to the files in the S3 bucket.
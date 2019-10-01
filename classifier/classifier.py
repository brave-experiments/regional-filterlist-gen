import numpy
from sklearn.model_selection import KFold
from sklearn.metrics import classification_report
from sklearn import svm

import argparse
import os
from s3fs import S3FileSystem
import psycopg2
import psycopg2.extras
from PIL import Image
from tempfile import TemporaryDirectory
from tqdm import tqdm

def initiate_vectors(s3):
    all_features = []
    all_labels = []
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    with open('images_ads.csv', 'r') as input_file:
        for line in tqdm(input_file.readlines()):
            line = line.strip()
            dict_cur.execute('select * from image_features where imaged_data = %s', [line])
            data = dict_cur.fetchall()[0]
            if data['parent_in_degree'] is None or data['ad_probability'] is None:
                continue
            features = []
            features.append(data['in_degree'])
            features.append(data['in_average_degree_connectivity'])
            features.append(data['out_degree'])
            features.append(data['out_average_degree_connectivity'])
            features.append(data['in_out_degree'])
            features.append(data['in_out_average_degree_connectivity'])
            features.append(0 if data['is_modified_by_script'] is None else 1)
            features.append(data['parent_in_degree'])
            features.append(data['parent_in_average_degree_connectivity'])
            features.append(data['parent_out_degree'])
            features.append(data['parent_out_average_degree_connectivity'])
            features.append(data['parent_in_out_degree'])
            features.append(data['parent_in_out_average_degree_connectivity'])
            features.append(0 if data['parent_modified_by_script'] is None else 1)
            features.append(1 if data['is_classified_as_ad'] else 0)
            features.append(data['ad_probability'])
            features.append(data['nodes'])
            features.append(data['edges'])
            features.append(data['nodes_edge_ratio'])
            features.append(data['width'])
            features.append(data['height'])
            features.append(1 if data['standard_ad_width'] else 0)
            features.append(1 if data['standard_ad_height'] else 0)
            features.append(1 if data['standard_ad_size'] else 0)
            features.append(data['length_of_url'])
            features.append(1 if data['is_subdomain'] else 0)
            features.append(1 if data['is_third_party'] else 0)
            features.append(1 if data['base_domain_in_query_string'] else 0)
            features.append(1 if data['semi_colon_in_query_string'] else 0)
            features.append(1 if data['is_iframe'] else 0)

            all_features.append(features)
            all_labels.append(1)

    with open('frames_ads.csv', 'r') as input_file:
        for line in tqdm(input_file.readlines()):
            line = line.strip()
            dict_cur.execute('select * from image_features where imaged_data = %s', [line])
            data = dict_cur.fetchall()[0]
            if data['parent_in_degree'] is None or data['ad_probability'] is None:
                continue
            features = []
            features.append(data['in_degree'])
            features.append(data['in_average_degree_connectivity'])
            features.append(data['out_degree'])
            features.append(data['out_average_degree_connectivity'])
            features.append(data['in_out_degree'])
            features.append(data['in_out_average_degree_connectivity'])
            features.append(0 if data['is_modified_by_script'] is None else 1)
            features.append(data['parent_in_degree'])
            features.append(data['parent_in_average_degree_connectivity'])
            features.append(data['parent_out_degree'])
            features.append(data['parent_out_average_degree_connectivity'])
            features.append(data['parent_in_out_degree'])
            features.append(data['parent_in_out_average_degree_connectivity'])
            features.append(0 if data['parent_modified_by_script'] is None else 1)
            features.append(1 if data['is_classified_as_ad'] else 0)
            features.append(data['ad_probability'])
            features.append(data['nodes'])
            features.append(data['edges'])
            features.append(data['nodes_edge_ratio'])
            features.append(data['width'])
            features.append(data['height'])
            features.append(1 if data['standard_ad_width'] else 0)
            features.append(1 if data['standard_ad_height'] else 0)
            features.append(1 if data['standard_ad_size'] else 0)
            features.append(data['length_of_url'])
            features.append(1 if data['is_subdomain'] else 0)
            features.append(1 if data['is_third_party'] else 0)
            features.append(1 if data['base_domain_in_query_string'] else 0)
            features.append(1 if data['semi_colon_in_query_string'] else 0)
            features.append(1 if data['is_iframe'] else 0)

            all_features.append(features)
            all_labels.append(1)

    with open('images_nonads.csv', 'r') as input_file:
        for line in tqdm(input_file.readlines()):
            line = line.strip()
            dict_cur.execute('select * from image_features where imaged_data = %s', [line])
            try:
                data = dict_cur.fetchall()[0]
            except:
                continue
            if data['parent_in_degree'] is None or data['ad_probability'] is None:
                continue
            features = []
            features.append(data['in_degree'])
            features.append(data['in_average_degree_connectivity'])
            features.append(data['out_degree'])
            features.append(data['out_average_degree_connectivity'])
            features.append(data['in_out_degree'])
            features.append(data['in_out_average_degree_connectivity'])
            features.append(0 if data['is_modified_by_script'] is None else 1)
            features.append(data['parent_in_degree'])
            features.append(data['parent_in_average_degree_connectivity'])
            features.append(data['parent_out_degree'])
            features.append(data['parent_out_average_degree_connectivity'])
            features.append(data['parent_in_out_degree'])
            features.append(data['parent_in_out_average_degree_connectivity'])
            features.append(0 if data['parent_modified_by_script'] is None else 1)
            features.append(1 if data['is_classified_as_ad'] else 0)
            features.append(data['ad_probability'])
            features.append(data['nodes'])
            features.append(data['edges'])
            features.append(data['nodes_edge_ratio'])
            features.append(data['width'])
            features.append(data['height'])
            features.append(1 if data['standard_ad_width'] else 0)
            features.append(1 if data['standard_ad_height'] else 0)
            features.append(1 if data['standard_ad_size'] else 0)
            features.append(data['length_of_url'])
            features.append(1 if data['is_subdomain'] else 0)
            features.append(1 if data['is_third_party'] else 0)
            features.append(1 if data['base_domain_in_query_string'] else 0)
            features.append(1 if data['semi_colon_in_query_string'] else 0)
            features.append(1 if data['is_iframe'] else 0)

            all_features.append(features)
            all_labels.append(0)

    with open('frames_nonads.csv', 'r') as input_file:
        for line in tqdm(input_file.readlines()):
            line = line.strip()
            dict_cur.execute('select * from image_features where imaged_data = %s', [line])
            try:
                data = dict_cur.fetchall()[0]
            except:
                continue
            if data['parent_in_degree'] is None or data['ad_probability'] is None:
                continue
            features = []
            features.append(data['in_degree'])
            features.append(data['in_average_degree_connectivity'])
            features.append(data['out_degree'])
            features.append(data['out_average_degree_connectivity'])
            features.append(data['in_out_degree'])
            features.append(data['in_out_average_degree_connectivity'])
            features.append(0 if data['is_modified_by_script'] is None else 1)
            features.append(data['parent_in_degree'])
            features.append(data['parent_in_average_degree_connectivity'])
            features.append(data['parent_out_degree'])
            features.append(data['parent_out_average_degree_connectivity'])
            features.append(data['parent_in_out_degree'])
            features.append(data['parent_in_out_average_degree_connectivity'])
            features.append(0 if data['parent_modified_by_script'] is None else 1)
            features.append(1 if data['is_classified_as_ad'] else 0)
            features.append(data['ad_probability'])
            features.append(data['nodes'])
            features.append(data['edges'])
            features.append(data['nodes_edge_ratio'])
            features.append(data['width'])
            features.append(data['height'])
            features.append(1 if data['standard_ad_width'] else 0)
            features.append(1 if data['standard_ad_height'] else 0)
            features.append(1 if data['standard_ad_size'] else 0)
            features.append(data['length_of_url'])
            features.append(1 if data['is_subdomain'] else 0)
            features.append(1 if data['is_third_party'] else 0)
            features.append(1 if data['base_domain_in_query_string'] else 0)
            features.append(1 if data['semi_colon_in_query_string'] else 0)
            features.append(1 if data['is_iframe'] else 0)

            all_features.append(features)
            all_labels.append(0)

    return numpy.array(all_features), numpy.array(all_labels)


def split_s3_path(s3path):
    path_parts = s3path.replace('s3://', '').split('/')
    bucket = path_parts.pop(0)
    key = '/'.join(path_parts)
    return bucket, key

def run_classifier(s3, X, Y):
    kf = KFold(n_splits=5, shuffle=True)
    for train_index, test_index in kf.split(X):
        #print("TRAIN:", train_index, "TEST:", test_index)
        X_train, X_test = X[train_index], X[test_index]
        Y_train, Y_test = Y[train_index], Y[test_index]

        clf = svm.SVC(gamma='auto').fit(X_train, Y_train)
        Y_pred = clf.predict(X_test)
        print(classification_report(Y_test, Y_pred))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Classify all the images from their paths in a Postgres database')

    parser.add_argument('--aws-access-key', help='aws access key')
    parser.add_argument('--aws-secret-key', help='aws secret key')
    args = parser.parse_args()

    s3 = S3FileSystem(anon=False, key=args.aws_access_key, secret=args.aws_secret_key)

    X, Y = initiate_vectors(s3)

    run_classifier(s3, X, Y)
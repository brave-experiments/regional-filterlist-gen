import numpy
from sklearn.model_selection import KFold
from sklearn.metrics import classification_report, precision_recall_fscore_support, roc_auc_score
from sklearn import svm
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier

import os
import psycopg2
import psycopg2.extras
from psycopg2.extensions import AsIs
from tqdm import tqdm

ads = set()
non_ads = set()

def initiate_vectors(ads_training, nonads_training):
    all_features = []
    all_labels = []
    ads = 0
    non_ads = 0
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING_TRAINING_DATA'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    with open(ads_training, 'r') as input_file:
        for line in tqdm(input_file.readlines()):
            line = line.strip()
            dict_cur.execute('select * from image_features where imaged_data = %s', [line])
            data = dict_cur.fetchone()
            if data is None:
                continue

            features = get_features(data)
            all_features.append(features)
            all_labels.append(1)
            ads += 1

    with open(nonads_training, 'r') as input_file:
        for line in tqdm(input_file.readlines()):
            line = line.strip()
            dict_cur.execute('select * from image_features where imaged_data = %s', [line])
            data = dict_cur.fetchone()
            if data is None:
                continue

            features = get_features(data)
            all_features.append(features)
            all_labels.append(0)
            non_ads += 1

    dict_cur.close()
    pg_conn.close()
    print('training ads: ' + str(ads))
    print('training non ads: ' + str(non_ads))
    return numpy.array(all_features), numpy.array(all_labels)

def get_features(data):
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

    return features

def split_s3_path(s3path):
    path_parts = s3path.replace('s3://', '').split('/')
    bucket = path_parts.pop(0)
    key = '/'.join(path_parts)
    return bucket, key

def run_classifier_with_kFold(X, Y, k):
    kf = KFold(n_splits=k, shuffle=True)
    target_names = ['non-ad', 'ad']
    recall = 0
    precision = 0
    f1_score = 0
    roc_auc = 0
    for train_index, test_index in kf.split(X):
        #print("TRAIN:", train_index, "TEST:", test_index)
        X_train, X_test = X[train_index], X[test_index]
        Y_train, Y_test = Y[train_index], Y[test_index]

        clf_rand_forest = RandomForestClassifier(n_estimators=100).fit(X_train, Y_train)
        Y_pred_rand_forest = clf_rand_forest.predict(X_test)
        print(classification_report(Y_test, Y_pred_rand_forest, target_names=target_names))
        prec, rec, f1, _sup = precision_recall_fscore_support(Y_test, Y_pred_rand_forest)
        precision += sum(prec)
        recall += sum(rec)
        f1_score += sum(f1)
        roc_auc += roc_auc_score(Y_test, Y_pred_rand_forest)

    print ('average precision: ' + str(precision / (k * 2)))
    print ('average recall: ' + str(recall / (k * 2)))
    print ('average f1-score: ' + str(f1_score / (k * 2)))
    print ('average roc_auc_score: ' + str(roc_auc / k))

def run_classifier(ads_training, nonads_training, resource_type):
    X, Y = initiate_vectors(ads_training, nonads_training)
    classifier = RandomForestClassifier(n_estimators=100, class_weight='balanced').fit(X, Y)
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING_CLASSIFICATION_DATA'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ads = set()
    non_ads = set()
    dict_cur.execute('select * from image_features where resource_type=%s', [resource_type])
    for img_data in tqdm(dict_cur.fetchall()):
        classification = classifier.predict([get_features(img_data)])[0]
        if classification == 1:
            ads.add(img_data['imaged_data'])
        else:
            non_ads.add(img_data['imaged_data'])

    dict_cur.close()
    pg_conn.close()

    return ads, non_ads


def insert_classification(ads, non_ads):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING_CLASSIFICATION_DATA'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    for ad in tqdm(ads):
        dict_cur.execute('select page_url, resource_url, resource_type, frame_url from image_data_table where imaged_data=%s', [ad])
        data = dict_cur.fetchone()
        if data is not None:
            data['is_classified_as_ad'] = True
            data['imaged_data'] = ad
            columns = data.keys()
            values = [data[column] for column in columns]
            query = 'INSERT INTO classifications (%s) VALUES %s'
            cur = pg_conn.cursor()
            cur.execute(query, (AsIs(','.join(columns)), tuple(values)))

            pg_conn.commit()

    for non_ad in tqdm(non_ads):
        dict_cur.execute('select page_url, resource_url, resource_type, frame_url from image_data_table where imaged_data=%s', [non_ad])
        data = dict_cur.fetchone()
        if data is not None:
            data['is_classified_as_ad'] = False
            data['imaged_data'] = non_ad
            columns = data.keys()
            values = [data[column] for column in columns]
            query = 'INSERT INTO classifications (%s) VALUES %s'
            cur = pg_conn.cursor()
            cur.execute(query, (AsIs(','.join(columns)), tuple(values)))

            pg_conn.commit()

    dict_cur.close()
    pg_conn.close()

if __name__ == "__main__":
    ads_images = os.path.join(os.getcwd(), 'training_data', 'ads_images.csv')
    nonads_images = os.path.join(os.getcwd(), 'training_data', 'nonads_images.csv')
    ads_frames = os.path.join(os.getcwd(), 'training_data', 'ads_frames.csv')
    nonads_frames = os.path.join(os.getcwd(), 'training_data', 'nonads_frames.csv')

    #X, Y = initiate_vectors(ads_images, nonads_images)
    #run_classifier_with_kFold(X, Y, 3)

    #X, Y = initiate_vectors(ads_frames, nonads_frames)
    #run_classifier_with_kFold(X, Y, 3)

    ads, non_ads = run_classifier(ads_images, nonads_images, 'image')
    insert_classification(ads, non_ads)

    ads, non_ads = run_classifier(ads_frames, nonads_frames, 'iframe')
    insert_classification(ads, non_ads)
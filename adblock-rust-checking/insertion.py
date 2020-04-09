import json
import psycopg2
import psycopg2.extras
import os
from tqdm import tqdm

pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
insert_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
with open('blocking_albania.json', 'r') as input_file:
    blocking = json.load(input_file)
    for key in blocking:
        if key == 'easylist':
            for imaged_data in tqdm(blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_easylist=%s where imaged_data=%s', [True, imaged_data])
                pg_conn.commit()
        elif key == 'supplement':
            for imaged_data in tqdm(blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_supplement=%s where imaged_data=%s', [True, imaged_data])
                pg_conn.commit()
        elif key == 'easyprivacy':
            for imaged_data in tqdm(blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_easyprivacy=%s where imaged_data=%s', [True, imaged_data])
                pg_conn.commit()
        elif key == 'combined_filterlists':
            for imaged_data in tqdm(blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_combined_filter_lists=%s where imaged_data=%s', [True, imaged_data])
                pg_conn.commit()

with open('non_blocking_albania.json', 'r') as input_file:
    non_blocking = json.load(input_file)
    for key in non_blocking:
        if key == 'easylist':
            for imaged_data in tqdm(non_blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_easylist=%s where imaged_data=%s', [False, imaged_data])
                pg_conn.commit()
        elif key == 'supplement':
            for imaged_data in tqdm(non_blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_supplement=%s where imaged_data=%s', [False, imaged_data])
                pg_conn.commit()
        elif key == 'easyprivacy':
            for imaged_data in tqdm(non_blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_easyprivacy=%s where imaged_data=%s', [False, imaged_data])
                pg_conn.commit()
        elif key == 'combined_filterlists':
            for imaged_data in tqdm(non_blocking[key]):
                insert_cur.execute('update classifications set is_classified_as_ad_combined_filter_lists=%s where imaged_data=%s', [False, imaged_data])
                pg_conn.commit()
import argparse
import json
import psycopg2
import psycopg2.extras
import os
from tqdm import tqdm

def insert(region):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    insert_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    with open('chain_blocking_' + region + '.json', 'r') as input_file:
        blocking = json.load(input_file)
        for imaged_data in tqdm(blocking):
            insert_cur.execute('update classifications set chain_element_block=%s where imaged_data=%s', [blocking[imaged_data], imaged_data])
            pg_conn.commit()
            insert_cur.execute('update classifications set is_classified_as_ad_combined_filter_lists=%s where imaged_data=%s', [True, imaged_data])
            pg_conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='insertion of found blocking in database')
    parser.add_argument('--region', help='Region to insert for')

    args = parser.parse_args()
    insert(args.region)
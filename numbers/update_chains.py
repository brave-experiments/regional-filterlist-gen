import argparse

import os
import psycopg2
import psycopg2.extras
import json
from tqdm import tqdm

def update_chains(region):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    chain_path = os.path.join(os.getcwd(), 'chains_' + region)
    all_files = [os.path.join(chain_path, f) for f in os.listdir(chain_path) if os.path.isfile(os.path.join(chain_path, f))]
    for f in all_files:
        output_dict = dict()
        with open(f, 'r') as input_file:
            input_dict = json.load(input_file)
            for key in tqdm(input_dict):
                page_dict = input_dict[key]
                updated_page_dict = dict()
                for img in page_dict:
                    chain = page_dict[img]
                    dict_cur.execute('select resource_url, resource_type from image_data_table where imaged_data=%s', [img])
                    data = dict_cur.fetchone()
                    updated_page_dict[img] = [data['resource_url'], data['resource_type'], chain]

                output_dict[key] = updated_page_dict

        with open(f + '_updated', 'w') as output:
            json.dump(output_dict, output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Updates the generated chains to also contain resource url and resource type')
    parser.add_argument('--region', help='language region')

    args = parser.parse_args()

    update_chains(args.region)
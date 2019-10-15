from networkx import graphml

import argparse
import os
import psycopg2
import psycopg2.extras

from s3fs.core import S3FileSystem
from tempfile import TemporaryDirectory

from urllib.parse import urlsplit
from tqdm import tqdm

import html

def generate_vanity_stats(bucket, s3, region):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'] + '/' + region)
    page_graph_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    page_graph_cur.execute('select distinct on (queried_url) file_name from graphml_mappings')

    total_nodes = 0
    total_edges = 0
    total_graph_files = 0
    total_size_mb = 0
    for entry in tqdm(page_graph_cur.fetchall()):
        graphml_path = entry['file_name']

        with TemporaryDirectory() as temp_dir:
            local_file = os.path.join(temp_dir, graphml_path.split('/')[-1])
            try:
                s3.s3.download_file(bucket, graphml_path, local_file)
            except:
                print('cannot find file ' + graphml_path)
                continue

            with open(local_file, 'r') as graphml_file:
                page_graph_data = ''
                for line in graphml_file:
                    page_graph_data += line

                try:
                    page_graph = graphml.parse_graphml(page_graph_data)
                except:
                    continue

                total_graph_files += 1
                total_nodes += len(page_graph.nodes)
                total_edges += len(page_graph.edges)

                total_size_mb += (os.path.getsize(local_file) / 1000000)

    return total_nodes / total_graph_files, total_edges / total_graph_files, total_size_mb / total_graph_files

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generates the nodes which corresponds to ads')
    parser.add_argument('--aws-access-key', help='aws access key')
    parser.add_argument('--aws-secret-key', help='aws secret key')
    parser.add_argument('--pg-bucket', help='aws bucket address')

    args = parser.parse_args()
    s3Bucket = S3FileSystem(anon=False, key=args.aws_access_key, secret=args.aws_secret_key)

    print('sri lanka: ')
    print(generate_vanity_stats(args.pg_bucket, s3Bucket, 'sri_lanka'))
    print('hungary: ')
    print(generate_vanity_stats(args.pg_bucket, s3Bucket, 'hungary'))
    print('albania: ')
    print(generate_vanity_stats(args.pg_bucket, s3Bucket, 'albania'))
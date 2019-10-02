import argparse
import os
import json

from tempfile import TemporaryDirectory
from s3fs.core import S3FileSystem
from PIL import Image
import psycopg2
import psycopg2.extras
from psycopg2.extensions import AsIs

from urllib.parse import urlparse
import tldextract

import html
from tqdm import tqdm

from networkx import graphml, average_neighbor_degree, average_degree_connectivity

from adsidentifier import AdsIdentifier

# standard ad information from https://blog.bannersnack.com/banner-standard-sizes/
standard_ad_widths = [
    250,
    200,
    468,
    728,
    300,
    336,
    120,
    160,
    970
]

standard_ad_heights = [
    250,
    200,
    60,
    90,
    280,
    600
]

standard_ad_sizes = [
    '250x250',
    '200x200',
    '468x60',
    '728x90',
    '300x250',
    '336x280',
    '120x600',
    '160x600',
    '300x600',
    '970x90'
]

# utility function
def edges_from_mapping(edges):
    mapping = dict()
    for edge in edges:
        if edge[0] in mapping:
            mapping[edge[0]].append(edge)
        else:
            mapping[edge[0]] = [edge]

    return mapping

def edges_to_mapping(edges):
    mapping = dict()
    for edge in edges:
        if edge[1] in mapping:
            mapping[edge[1]].append(edge)
        else:
            mapping[edge[1]] = [edge]

    return mapping

def is_modifying_edge(edge):
    edge_type = edge[2]['edge type']
    return (
        edge_type == 'set attribute'
        or edge_type == 'delete attribute'
        or edge_type == 'remove node'
        or edge_type == 'delete node'
    )

def get_resource_nodes(all_nodes):
    resource_nodes = []

    for node in all_nodes:
        node_info = node[1]
        if node_info['node type'] == 'resource':
            decoded_resource_url = html.unescape(node_info['url'])
            while decoded_resource_url != html.unescape(decoded_resource_url):
                decoded_resource_url = html.unescape(decoded_resource_url)

            node_info['url'] = decoded_resource_url
            resource_nodes.append(node)

    return resource_nodes

def get_remote_frame_nodes(all_nodes):
    remote_frame_nodes = []
    for node in all_nodes:
        node_info = node[1]
        if node_info['node type'] == 'remote frame':
            decoded_resource_url = html.unescape(node_info['url'])
            while decoded_resource_url != html.unescape(decoded_resource_url):
                decoded_resource_url = html.unescape(decoded_resource_url)

            node_info['url'] = decoded_resource_url
            remote_frame_nodes.append(node)

    return remote_frame_nodes

def get_value_edges(all_edges):
    value_edges = []
    for edge in all_edges:
        if 'value' in edge[2]:
            decoded_url = html.unescape(edge[2]['value'])
            while decoded_url != html.unescape(decoded_url):
                decoded_url = html.unescape(decoded_url)

            edge[2]['value'] = decoded_url
            value_edges.append(edge)

    return value_edges

def get_image_node(resource_nodes, value_edges, resource_url):
    for resource in resource_nodes:
        node_id = resource[0]
        node_info = resource[1]
        if node_info['url'] == resource_url:
            return True, node_id

    for edge in value_edges:
        node_id = edge[1]
        edge_info = edge[2]
        if edge_info['value'] == resource_url:
            return True, node_id

    return False, None

def get_remote_frame_node(frame_nodes, frame_url):
    for frame in frame_nodes:
        node_id = frame[0]
        node_info = frame[1]
        if node_info['url'] == frame_url:
            return True, node_id

    return False, None

###############################################################################

def get_features(s3, pg_bucket):
    identifier = AdsIdentifier()
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    page_graph_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    page_graph_cur.execute('select distinct on (queried_url) queried_url, file_name from graphml_mappings')
    img_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    for entry in tqdm(page_graph_cur.fetchall()):
        graphml_path = entry['file_name']
        page_url = entry['queried_url']

        with TemporaryDirectory() as temp_dir:
            local_file = os.path.join(temp_dir, graphml_path.split('/')[-1])
            try:
                s3.s3.download_file(pg_bucket, graphml_path, local_file)
            except:
                print('cannot find file ' + graphml_path)
                continue

            with open(local_file, 'r') as graphml_file:
                page_graph_data = ''
                for line in graphml_file:
                    page_graph_data += line

                try:
                    try:
                        page_graph = graphml.parse_graphml(page_graph_data)
                    except:
                        continue
                    graph_in_out_average_degree_connectivity = average_degree_connectivity(page_graph)
                    graph_in_out_degree = page_graph.degree

                    graph_in_average_degree_connectivity = average_degree_connectivity(page_graph, 'in', 'in')
                    graph_in_degree = page_graph.in_degree

                    graph_out_average_degree_connectivity = average_degree_connectivity(page_graph, 'out', 'out')
                    graph_out_degree = page_graph.out_degree

                    all_nodes = page_graph.nodes(data=True)
                    all_edges = page_graph.edges(data=True)
                    all_nodes_length = len(all_nodes)
                    all_edges_length = len(all_edges)
                    nodes_edge_ratio = all_nodes_length / all_edges_length
                    edges_to_map = edges_to_mapping(all_edges)

                    resource_nodes = get_resource_nodes(all_nodes)
                    remote_frame_nodes = get_remote_frame_nodes(all_nodes)
                    value_edges = get_value_edges(all_edges)

                    img_cur.execute('select id, domain, resource_url, resource_type, imaged_data from image_data_table where page_url = %s', [page_url])
                    for img in tqdm(img_cur.fetchall()):
                        image_dict = dict()
                        domain = img['domain']
                        resource_url = img['resource_url']

                        image_bucket, image_path = split_s3_path(img['imaged_data'])
                        local_image_file = os.path.join(temp_dir, image_path.split('/')[-1])
                        s3.s3.download_file(image_bucket, image_path, local_image_file)

                        width, height = None, None
                        try:
                            with Image.open(local_image_file) as img_file:
                                width, height = img_file.size
                        except:
                            continue


                        if img['resource_type'] == 'iframe':
                            found, node_id = get_remote_frame_node(remote_frame_nodes, resource_url)
                        else:
                            found, node_id = get_image_node(resource_nodes, value_edges, resource_url)

                        if found:
                            actual_node_id = node_id
                            node_have_in_edges = True
                            if img['resource_type'] == 'image':
                                try:
                                    for edge in edges_to_map[node_id]:
                                        if edge[2]['edge type'] == 'request start':
                                            actual_node_id = edge[0]
                                            break
                                except KeyError:
                                    node_have_in_edges = False

                            if actual_node_id != 'n1' and node_have_in_edges:
                                image_dict['time_from_page_start'] = all_nodes[actual_node_id]['timestamp']

                                elem_in_degree = graph_in_degree[actual_node_id]
                                image_dict['in_degree'] = elem_in_degree
                                image_dict['in_average_degree_connectivity'] = graph_in_average_degree_connectivity[elem_in_degree]

                                elem_out_degree = graph_out_degree[actual_node_id]
                                image_dict['out_degree'] = elem_out_degree
                                image_dict['out_average_degree_connectivity'] = graph_out_average_degree_connectivity[elem_out_degree]

                                elem_in_out_degree = graph_in_out_degree[actual_node_id]
                                image_dict['in_out_degree'] = elem_in_out_degree
                                image_dict['in_out_average_degree_connectivity'] = graph_in_out_average_degree_connectivity[elem_in_out_degree]

                                image_dict['is_modified_by_script'] = False
                                for edge in edges_to_map[actual_node_id]:
                                    if is_modifying_edge(edge):
                                        image_dict['is_modified_by_script'] = True

                                parent = None
                                for edge in edges_to_map[actual_node_id]:
                                    if edge[2]['edge type'] == 'structure':
                                        parent = edge[0]

                                if parent is not None:
                                    parent_in_degree = graph_in_degree[parent]
                                    image_dict['parent_in_degree'] = parent_in_degree
                                    image_dict['parent_in_average_degree_connectivity'] = graph_in_average_degree_connectivity[parent_in_degree]

                                    parent_out_degree = graph_out_degree[parent]
                                    image_dict['parent_out_degree'] = parent_out_degree
                                    image_dict['parent_out_average_degree_connectivity'] = graph_out_average_degree_connectivity[parent_out_degree]

                                    parent_in_out_degree = graph_in_out_degree[parent]
                                    image_dict['parent_in_out_degree'] = parent_in_out_degree
                                    image_dict['parent_in_out_average_degree_connectivity'] = graph_in_out_average_degree_connectivity[parent_in_out_degree]

                                    image_dict['parent_modified_by_script'] = False
                                    for edge in edges_to_map[parent]:
                                        if is_modifying_edge(edge):
                                            image_dict['parent_modified_by_script'] = True
                                            break
                                else:
                                    # ignore the entire image, since we can't extract all features
                                    continue
                            else:
                                # ignore the entire image, since we can't extract all features
                                continue
                        else:
                            # ignore the entire image, since we can't extract all features
                            continue


                        # get the classification probability for the image
                        try:
                            (classification, probability) = identifier.predict_with_ad_prob(local_image_file)
                            image_dict['is_classified_as_ad'] = classification == '1_Ads'
                            image_dict['ad_probability'] = probability
                        except:
                            # ignore the entire image, since we can't extract all features
                            continue

                        # structural features
                        image_dict['nodes'] = all_nodes_length
                        image_dict['edges'] = all_edges_length
                        image_dict['nodes_edge_ratio'] = nodes_edge_ratio

                        # content features
                        if width is not None and height is not None:
                            image_dict['width'] = width
                            image_dict['height'] = height
                            combined = str(width) + 'x' + str(height)
                            image_dict['standard_ad_width'] = width in standard_ad_widths
                            image_dict['standard_ad_height'] = width in standard_ad_heights
                            image_dict['standard_ad_size'] = combined in standard_ad_sizes

                        image_dict['length_of_url'] = len(resource_url)

                        image_address_parts = tldextract.extract(resource_url)
                        site_address_parts = tldextract.extract(domain)
                        image_dict['is_subdomain'] = image_address_parts.domain == site_address_parts.domain and image_address_parts.subdomain != ''
                        image_dict['is_third_party'] = image_address_parts.domain != site_address_parts.domain

                        query_string = urlparse(resource_url).query
                        image_dict['base_domain_in_query_string'] = domain in query_string
                        image_dict['semi_colon_in_query_string'] = ';' in query_string

                        image_dict['is_iframe'] = img['resource_type'] == 'iframe'

                        image_dict['id'] = img['id']
                        image_dict['resource_url'] = resource_url
                        image_dict['resource_type'] = img['resource_type']
                        image_dict['imaged_data'] = img['imaged_data']

                        columns = image_dict.keys()
                        values = [image_dict[column] for column in columns]
                        query = 'INSERT INTO image_features (%s) VALUES %s'
                        cur = pg_conn.cursor()
                        cur.execute(query, (AsIs(','.join(columns)), tuple(values)))

                        pg_conn.commit()

                except e:
                    # with open('error.graphml', 'w') as output:
                    #     output.write(page_graph_data)

                    # print(e)
                    # return True
                    pass

    return True


def split_s3_path(s3path):
    path_parts = s3path.replace('s3://', '').split('/')
    bucket = path_parts.pop(0)
    key = '/'.join(path_parts)
    return bucket, key

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='extract features to be used when classifying')
    parser.add_argument('--aws-access-key', help='aws access key')
    parser.add_argument('--aws-secret-key', help='aws secret key')
    parser.add_argument('--pg-bucket', help='aws page graph bucket address')

    args = parser.parse_args()
    s3Bucket = S3FileSystem(anon=False, key=args.aws_access_key, secret=args.aws_secret_key)

    get_features(s3Bucket, args.pg_bucket)
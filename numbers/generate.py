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
import utils

# utility functions
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

def get_image_node(resource_nodes, value_edges, resource_url):
    for resource in resource_nodes:
        node_id = resource[0]
        node_info = resource[1]
        if node_info['url'] == resource_url:
            return node_id

    for edge in value_edges:
        node_id = edge[1]
        edge_info = edge[2]
        if edge_info['value'] == resource_url:
            return node_id

    return None

def get_remote_frame_node(frame_nodes, frame_url):
    for frame in frame_nodes:
        node_id = frame[0]
        node_info = frame[1]
        if node_info['url'] == frame_url:
            return node_id

    return None

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

def is_modifying_edge(edge):
    edge_type = edge[2]['edge type']
    return (
        edge_type == 'set attribute'
        or edge_type == 'delete attribute'
        or edge_type == 'remove node'
        or edge_type == 'delete node'
    )

def is_event_listener_edge(edge):
    edge_type = edge[2]['edge type']
    return edge_type == 'add event listener' or edge_type == 'remove event listener'

def is_creation_edge(edge):
    return edge[2]['edge type'] == 'create node' or edge[2]['edge type'] == 'insert node'

def get_injector_chain(node, injectors, all_nodes, to_edges_mapping):
    injector_node = None
    if all_nodes[node]['node type'] == 'script':
        for edge in to_edges_mapping[node]:
            if 'edge type' in edge[2] and edge[2]['edge type'] == 'execute':
                injector_node = edge[0]
                injectors.append(injector_node)
                break
            elif 'edge type' in edge[2] and edge[2]['edge type'] == 'create node':
                injector_node = edge[0]
                injectors.append(injector_node)
                break
    else:
        for edge in to_edges_mapping[node]:
            if 'edge type' in edge[2] and edge[2]['edge type'] == 'create node':
                injector_node = edge[0]
                injectors.append(injector_node)
                break

    if injector_node is not None and injector_node != 'n1':
        get_injector_chain(injector_node, injectors, all_nodes, to_edges_mapping)

    if injectors[-1] == 'n1':
        return injectors[:-1]

    return injectors

def generate_chains(bucket, s3, filter_list=None):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ad_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    upstream_chains = dict()
    ads_by_us = dict()
    if filter_list == 'easylist':
        ad_cur.execute('select page_url, resource_url, resource_type, frame_url from classifications where is_classified_as_ad_easylist')
    elif filter_list == 'supplement':
        ad_cur.execute('select page_url, resource_url, resource_type, frame_url from classifications where is_classified_as_ad_supplement')
    elif filter_list == 'easyprivacy':
        ad_cur.execute('select page_url, resource_url, resource_type, frame_url from classifications where is_classified_as_ad_easyprivacy')
    else:
        ad_cur.execute('select page_url, resource_url, resource_type, frame_url from classifications where is_classified_as_ad')

    for ad in ad_cur.fetchall():
        if ad['page_url'] in ads_by_us:
            ads_by_us[ad['page_url']].append((ad['resource_url'], ad['resource_type']))
        else:
            ads_by_us[ad['page_url']] = [(ad['resource_url'], ad['resource_type'])]

    for page_url in tqdm(ads_by_us):
        dict_cur.execute('select file_name from graphml_mappings where queried_url=%s', [page_url])
        data = dict_cur.fetchone()
        if data is None:
            continue

        graphml_path = data['file_name']
        with TemporaryDirectory() as temp_dir:
            local_file = os.path.join(temp_dir, graphml_path.split('/')[-1])
            try:
                s3.s3.download_file(bucket, graphml_path, local_file)
            except Exception as e:
                print('cannot find file ' + graphml_path)
                continue

            with open(local_file, 'r') as graphml_file:
                page_graph_data = ''
                for line in graphml_file:
                    page_graph_data += line

                try:
                    page_graph = graphml.parse_graphml(page_graph_data)
                    all_nodes = page_graph.nodes(data=True)
                    all_edges = page_graph.edges(data=True)
                    value_edges = get_value_edges(all_edges)
                    edges_to_map = edges_to_mapping(all_edges)

                    all_resource_nodes = get_resource_nodes(all_nodes)
                    all_remote_frames = get_remote_frame_nodes(all_nodes)

                    injector_chains = dict()
                    for resource_url, resource_type in ads_by_us[page_url]:
                        starting_node = None
                        if resource_type == 'image':
                            resource_node = get_image_node(all_resource_nodes, value_edges, resource_url)
                            for edge in edges_to_map[resource_node]:
                                if edge[2]['edge type'] == 'request start':
                                    starting_node = edge[0]
                                    break
                        else:
                            frame_node = get_remote_frame_node(all_remote_frames, resource_url)
                            for edge in edges_to_map[frame_node]:
                                if edge[2]['edge type'] == 'cross DOM':
                                    starting_node = edge[0]
                                    break

                        if starting_node is None:
                            continue

                        injector_chains[starting_node] = get_injector_chain(starting_node, [], all_nodes, edges_to_map)

                except e:
                    continue

                # now, cut the injector chains to only store the ones which
                # makes no other modifications
                from_edges_mapping = edges_from_mapping(all_edges)
                cutted_chains = cut(injector_chains, from_edges_mapping)
                script_chains = gen_script_chains(cutted_chains, all_nodes)
                upstream_chains[page_url] = script_chains

    print(upstream_chains)

def cut(injector_chains, from_edges_mapping):
    all_injector_nodes = set()
    for start_node in injector_chains:
        all_injector_nodes.add(start_node)
        for node in injector_chains[start_node]:
            all_injector_nodes.add(node)

    cutted_chains = dict()
    for start_node in injector_chains:
        found_cut = False
        current_chain = injector_chains[start_node]
        for i in range(0, len(current_chain)):
            for edge in from_edges_mapping[current_chain[i]]:
                if is_modifying_edge(edge) or is_event_listener_edge(edge) or is_creation_edge(edge):
                    print(edge)
                    print(start_node)
                    print(current_chain)
                    for edge_2 in from_edges_mapping[edge[1]]:
                        if edge_2['edge type'] == 'structure' and edge_2[1] in all_injector_nodes:
                            print('yeay!')
                    if edge[1] not in all_injector_nodes:
                        found_cut = True
                        cutted_chains[start_node] = current_chain[:i]
                        break

            if found_cut:
                break

        if not found_cut:
            cutted_chains[start_node] = current_chain

    return cutted_chains

def gen_script_chains(chains, all_nodes):
    script_resources = dict()
    for start_node in chains:
        current_chain = chains[start_node]
        scripts = []
        for node in current_chain:
            if all_nodes[node]['node type'] == 'script' and all_nodes[node]['script type'] == 'external file':
                scripts.append(all_nodes[node]['url'])

        script_resources[start_node] = scripts

    return script_resources

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generates the nodes which corresponds to ads')
    parser.add_argument('--aws-access-key', help='aws access key')
    parser.add_argument('--aws-secret-key', help='aws secret key')
    parser.add_argument('--pg-bucket', help='aws bucket address')

    args = parser.parse_args()
    s3Bucket = S3FileSystem(anon=False, key=args.aws_access_key, secret=args.aws_secret_key)

    generate_chains(args.pg_bucket, s3Bucket)
    #generate_chains(args.pg_bucket, s3Bucket, 'easylist')
    #generate_chains(args.pg_bucket, s3Bucket, 'supplement')
    #generate_chains(args.pg_bucket, s3Bucket, 'easyprivacy')
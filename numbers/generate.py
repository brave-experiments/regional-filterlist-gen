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
import json
import sys

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
    if node in to_edges_mapping:
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

def get_new_starting_node(node, script_url, all_nodes, to_edges_mapping):
    if all_nodes[node]['node type'] == 'script' and all_nodes[node]['script type'] == 'external file':
        node_script_url = find_script_request_url(node, all_nodes, to_edges_mapping)
        if node_script_url is None:
            node_script_url = all_nodes[node]['url']

        if node_script_url == script_url:
            return node

    start_node = None
    if node in to_edges_mapping:
        if all_nodes[node]['node type'] == 'script':
            for edge in to_edges_mapping[node]:
                if 'edge type' in edge[2] and edge[2]['edge type'] == 'execute':
                    start_node = edge[0]
                    break
                elif 'edge type' in edge[2] and edge[2]['edge type'] == 'create node':
                    start_node = edge[0]
                    break
        else:
            for edge in to_edges_mapping[node]:
                if 'edge type' in edge[2] and edge[2]['edge type'] == 'create node':
                    start_node = edge[0]
                    break

    if start_node is not None and start_node != 'n1':
        return get_new_starting_node(start_node, script_url, all_nodes, to_edges_mapping)

    return None


def generate_chains(bucket, s3, filter_list):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ad_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    upstream_chains = dict()
    original_script_chains = dict()
    ads = dict()
    if filter_list == 'lists':
        print(filter_list)
        ad_cur.execute('select imaged_data, page_url, resource_url, resource_type, frame_url, chain_element_block from classifications where is_classified_as_ad_combined_filter_lists')
    elif filter_list == 'us_difference_lists':
        print(filter_list)
        ad_cur.execute('select imaged_data, page_url, resource_url, resource_type, frame_url from classifications where (is_classified_as_ad and (not is_classified_as_ad_combined_filter_lists))')
    elif filter_list == 'everything':
        print(filter_list)
        ad_cur.execute('select imaged_data, page_url, resource_url, resource_type, frame_url from classifications')
    else:
        print('PANIC! Got unknown command: ' + filter_list)
        sys.exit(1)

    for ad in ad_cur.fetchall():
        ad_data = None
        if 'chain_element_block' in ad:
            ad_data = (ad['imaged_data'], ad['resource_url'], ad['resource_type'], ad['chain_element_block'])
        else:
            ad_data = (ad['imaged_data'], ad['resource_url'], ad['resource_type'], None)
        if ad['page_url'] in ads:
            ads[ad['page_url']].append(ad_data)
        else:
            ads[ad['page_url']] = [ad_data]

    for page_url in tqdm(ads):
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

            all_nodes = None
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
                    for imaged_data, resource_url, resource_type, chain_element_block in ads[page_url]:
                        starting_node = None
                        if resource_type == 'image':
                            resource_node = get_image_node(all_resource_nodes, value_edges, resource_url)
                            if resource_node is None:
                                continue
                            for edge in edges_to_map[resource_node]:
                                if edge[2]['edge type'] == 'request start':
                                    starting_node = edge[0]
                                    break
                        else:
                            frame_node = get_remote_frame_node(all_remote_frames, resource_url)
                            if frame_node is None:
                                continue
                            for edge in edges_to_map[frame_node]:
                                if edge[2]['edge type'] == 'cross DOM':
                                    starting_node = edge[0]
                                    break

                        if starting_node is None:
                            continue

                        if chain_element_block is None:
                            injector_chains[imaged_data] = get_injector_chain(starting_node, [], all_nodes, edges_to_map)
                        else:
                            new_starting_node = get_new_starting_node(starting_node, chain_element_block, all_nodes, edges_to_map)
                            if new_starting_node is None:
                                injector_chains[imaged_data] = get_injector_chain(starting_node, [], all_nodes, edges_to_map)
                            else:
                                injector_chains[imaged_data] = get_injector_chain(new_starting_node, [], all_nodes, edges_to_map)

                except e:
                    continue

                # now, cut the injector chains to only store the ones which
                # makes no other modifications
                from_edges_mapping = edges_from_mapping(all_edges)
                original_script_chains[page_url] = gen_script_chains(injector_chains, all_nodes, edges_to_map)
                cutted_chains = cut(injector_chains, from_edges_mapping, all_nodes)
                script_chains = gen_script_chains(cutted_chains, all_nodes, edges_to_map)
                upstream_chains[page_url] = script_chains

    return upstream_chains, original_script_chains

def cut(injector_chains, from_edges_mapping, all_nodes):
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
            if not safe_to_remove(current_chain[i], from_edges_mapping, all_nodes):
                found_cut = True
                cutted_chains[start_node] = current_chain[:i]
                break

        if not found_cut:
            cutted_chains[start_node] = current_chain

    return cutted_chains

def find_script_request_url(node, all_nodes, to_edges):
    execute_node = None
    for edge in to_edges[node]:
        if 'edge type' in edge[2] and edge[2]['edge type'] == 'execute':
            execute_node = edge[0]
            break

    if execute_node is not None:
        request_node = None
        for edge in to_edges[execute_node]:
            if 'edge type' in edge[2] and edge[2]['edge type'] == 'request complete':
                request_node = edge[0]
                break

        if request_node is not None:
            if 'url' in all_nodes[request_node]:
                return all_nodes[request_node]['url']

    return None


def gen_script_chains(chains, all_nodes, to_edges):
    script_resources = dict()

    for start_node in chains:
        current_chain = chains[start_node]
        scripts = []
        for node in current_chain:
            if all_nodes[node]['node type'] == 'script' and all_nodes[node]['script type'] == 'external file':
                script_url = find_script_request_url(node, all_nodes, to_edges)
                if script_url is None:
                    scripts.append(all_nodes[node]['url'])
                else:
                    scripts.append(script_url)

        script_resources[start_node] = scripts

    return script_resources

def safe_to_remove(node, from_edges_mapping, all_nodes):
    nodes_created_by_script = set()
    parents_to_nodes_created_by_script = set()
    scripts_from_node = set()

    for edge in from_edges_mapping[node]:
        if edge[2]['edge type'] == 'create node':
            graphml_node = edge[1]
            actual_id = all_nodes[graphml_node]['node id']
            nodes_created_by_script.add(actual_id)
            if all_nodes[graphml_node]['node type'] == 'script':
                scripts_from_node.add(graphml_node)
        elif edge[2]['edge type'] == 'insert node':
            parents_to_nodes_created_by_script.add(edge[2]['parent'])

    scripts_safe_to_remove = all(safe_to_remove(script_node, from_edges_mapping, all_nodes) for script_node in scripts_from_node)
    parents_not_created_by_script = parents_to_nodes_created_by_script.difference(nodes_created_by_script)
    return len(parents_not_created_by_script) <= 2 and scripts_safe_to_remove


def update(input_dict):
    pg_conn = psycopg2.connect(os.environ['PG_CONNECTION_STRING'])
    dict_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    output_dict = dict()
    for key in tqdm(input_dict):
        page_dict = input_dict[key]
        updated_page_dict = dict()
        for img in page_dict:
            chain = page_dict[img]
            dict_cur.execute('select resource_url, resource_type from image_data_table where imaged_data=%s', [img])
            data = dict_cur.fetchone()
            updated_page_dict[img] = [data['resource_url'], data['resource_type'], chain]

        output_dict[key] = updated_page_dict

    return output_dict

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generates the nodes which corresponds to ads')
    parser.add_argument('--aws-access-key', help='aws access key')
    parser.add_argument('--aws-secret-key', help='aws secret key')
    parser.add_argument('--pg-bucket', help='aws bucket address')
    parser.add_argument('--region', help='region to generate for')
    parser.add_argument('--direction', help='generate upstream or downstream')

    args = parser.parse_args()
    s3Bucket = S3FileSystem(anon=False, key=args.aws_access_key, secret=args.aws_secret_key)

    if args.direction == 'downstream':
        upstream_everything, original_everything = generate_chains(args.pg_bucket, s3Bucket, 'everything')
        with open('downstream_everything_' + args.region + '.json', 'w') as original:
            json.dump(update(original_everything), original)
    else:
        # upstream_intersection, original_intersection = generate_chains(args.pg_bucket, s3Bucket, 'lists')
        # with open('upstream_lists_' + args.region + '.json', 'w') as upstream:
        #     json.dump(update(upstream_intersection), upstream)

        # upstream_lists_difference_us, original_lists_difference_us = generate_chains(args.pg_bucket, s3Bucket, 'lists_difference_us')
        # with open('upstream_lists_difference_us_' + args.region + '.json', 'w') as upstream:
        #     json.dump(update(upstream_lists_difference_us), upstream)

        upstream_us_difference_lists, original_us_difference_lists = generate_chains(args.pg_bucket, s3Bucket, 'us_difference_lists')
        with open('upstream_us_difference_lists_' + args.region + '.json', 'w') as upstream:
            json.dump(update(upstream_us_difference_lists), upstream)
import argparse

import os
from tqdm import tqdm
import json

def additional_resources(region):
    chain_path = os.path.join(os.getcwd(), 'chains_' + region)
    files = ['original', 'upstream']
    types = ['all', 'filterlists', 'us']
    for type in types:
        for f in files:
            unique_resources = set()
            unique_images = set()
            unique_frames = set()
            file_path = os.path.join(chain_path, f + '_' + type + '_' + region + '.json_updated')
            additional_resources_total = 0
            additional_images = 0
            additional_frames = 0
            nbr_of_chains_images = 0
            nbr_of_chains_frames = 0
            nbr_of_chains_total = 0
            with open(file_path, 'r') as input_file:
                input_dict = json.load(input_file)
                for key in tqdm(input_dict):
                    page_dict = input_dict[key]
                    for img in page_dict:
                        [_resource_url, resource_type, chains] = page_dict[img]
                        chain_length = len(chains)
                        if resource_type == 'image':
                            nbr_of_chains_images += 1
                            additional_images += chain_length
                        else:
                            nbr_of_chains_frames += 1
                            additional_frames += chain_length

                        for chain_elem in chains:
                            if resource_type == 'image':
                                unique_images.add(chain_elem)
                            else:
                                unique_frames.add(chain_elem)

                            unique_resources.add(chain_elem)

                        additional_resources_total += chain_length
                        nbr_of_chains_total += 1

            print(f + '_' + type + '_' + region)
            print('additional images: ' + str(additional_images))
            print('additional frames: ' + str(additional_frames))
            print('total additional resources: ' + str(additional_resources_total))
            print('average chain images: ' + str(additional_images / nbr_of_chains_images))
            print('average chain frames: ' + str(additional_frames / nbr_of_chains_frames))
            print('average chain total: ' + str(additional_resources_total / nbr_of_chains_total))
            print('unique image resources: ' + str(len(unique_images)))
            print('unique frame resources: ' + str(len(unique_frames)))
            print('unique resources: ' + str(len(unique_resources)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Updates the generated chains to also contain resource url and resource type')
    parser.add_argument('--region', help='language region')

    args = parser.parse_args()

    additional_resources(args.region)
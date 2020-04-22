import argparse
import os
import json
from urllib.parse import urlsplit
from publicsuffix2 import get_sld

def generate_filterlist(region):
    upstream_file = region + '.txt'
    rules = set()
    all_rules = dict()
    with open(upstream_file, 'r') as upstream:
        for line in upstream.readlines():
            line = line.strip()
            url_to_use = line
            url_parts = urlsplit(url_to_use)
            rule = '||' + get_sld(url_parts.netloc) + url_parts.path
            if rule in rules:
                all_rules[rule] += 1
            else:
                all_rules[rule] = 1
                rules.add(rule)

    print(len(rules))
    print(all_rules)
    with open(region + '.rules', 'w') as output:
        output.write('\n'.join(rules))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Regional filterlist generator')
    parser.add_argument('--region', help='Region to generate filterlist for')

    args = parser.parse_args()
    generate_filterlist(args.region)

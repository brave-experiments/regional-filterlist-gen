import argparse
import os
import json
from urllib.parse import urlsplit
import tldextract

def generate_filterlist(region):
    upstream_file = region + '.txt'
    rules = set()
    all_rules = dict()
    with open(upstream_file, 'r') as upstream:
        for url in upstream.readlines():
            url = url.strip()

            # To get the correct eTLD + 1 root
            parts = tldextract.extract(url)
            subdomain_parts = parts.subdomain.split('.')
            plus_one_root = subdomain_parts[-1]

            # To get the path
            path = urlsplit(url).path

            # Finally, merge them together as a rule
            rule = None
            if plus_one_root:
                rule = '||' + plus_one_root + '.' + parts.domain + '.' + parts.suffix
            else:
                rule = '||' + parts.domain + '.' + parts.suffix

            if path:
                rule = rule + path

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

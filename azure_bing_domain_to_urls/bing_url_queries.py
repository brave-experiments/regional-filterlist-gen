import argparse
import json
import http.client
import urllib.parse
import time

bing_host = 'api.cognitive.microsoft.com'
bing_path = '/bing/v7.0/search'


def make_bing_search(search_term, request_nbr, api_key, urls_to_fetch=50):
    headers = {'Ocp-Apim-Subscription-Key': api_key}
    search_query = urllib.parse.quote(search_term)
    parameters = [
        'count={0}'.format(urls_to_fetch),
        'offset={0}'.format(urls_to_fetch * request_nbr),
        'responseFilter=webpages',
        'safeSearch=off',
        'q=' + search_query
    ]

    connection = http.client.HTTPSConnection(bing_host)
    connection.request('GET', bing_path + '?' + '&'.join(parameters), headers=headers)
    response = connection.getresponse()

    return response.read().decode('utf8')

def get_urls_for_domain(domain, urls_to_fetch, retries_per_domain, retries_delay, api_key):
    request_successful = True
    message = 'all good'
    search_term = 'site:{0}'.format(domain)
    urls = dict()
    requests = 0

    while requests < retries_per_domain and len(urls) < urls_to_fetch:
        try:
            requests += 1
            time.sleep(retries_delay)
            result = make_bing_search(search_term, requests, api_key, urls_to_fetch)
            result_json = json.loads(result)

            if 'webPages' in result_json and 'value' in result_json['webPages']:
                urls.update([(result['url'], None) for result in result_json['webPages']['value']])

        except:
            request_successful = False
            message = json.dumps(result_json, indent=2)

    return { 'all_good': request_successful, 'message': message, 'urls': list(urls.keys()), 'requests': requests }

def query_domains(input_file, output_file, urls_to_fetch, max_domains, first_domain_position, retries_per_domain, retries_delay, api_key):
    urls = dict()
    all_good_count = 0
    failures = dict()
    requests_exeeded = 0

    with open(input_file, 'r') as domains_file:
        t_start = time.time()
        domains_counter = 0
        for domain in domains_file:
            # skip the domains until we are where we want to start
            if domains_counter < first_domain_position:
                domains_counter =+ 1
                continue

            # we break once we've processed enough domains
            if domains_counter - first_domain_position >= max_domains:
                break

            domains_counter += 1
            domain = domain.strip()
            # line is rank,domain
            domain = domain.split(',')[1]

            print("Currently at {0}, on count {1}".format(domain, domains_counter))
            result = get_urls_for_domain(domain, urls_to_fetch, retries_per_domain, retries_delay, api_key)
            urls[domain] = result['urls']
            if result['all_good']:
                all_good_count += 1
            else:
                failures[domain] = result['message']

            if len(result['urls']) < urls_to_fetch and result['requests'] >= retries_per_domain:
                requests_exeeded += 1

            print('Done (all good: {0}, #urls: {1}, #requests: {2}).'
                .format(result['all_good'], len(result['urls']), result['requests']))

        
    t_delta = time.time() - t_start
    json.dump(urls, open(output_file, 'w'))

    print('-' * 80)
    print("Result written to file '{0}'".format(output_file))
    print('#domains: {0}'.format(len(urls)))
    print('successes: {0}, failures: {1}'.format(all_good_count, len(failures)))
    print('page limit exceeded: {0}'.format(requests_exeeded))
    print('time: {0}'.format(round(t_delta,1)))

    if len(failures) > 0:
        print('\nFailed domains:')
        for domain in failures:
            print('  {0}'.format(domain))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Fetches URLs for domains.')
    parser.add_argument(
        'input_file_path',
        metavar='INPUT_FILEPATH',
        help='path to file with domains'
    )
    parser.add_argument(
        'output_file_path',
        metavar='OUTPUT_FILEPATH',
        help='path to write the results to'
    )
    parser.add_argument(
        'urls_to_fetch',
        metavar='URLS_FETCH',
        type=int,
        help='amount of urls to fetch'
    )
    parser.add_argument(
        'max_domains',
        metavar='DOMAINS_FETCH',
        type=int,
        help='maximum amount of domains'
    )
    parser.add_argument(
        'first_domain_pos',
        metavar='DOMAIN_POS',
        type=int,
        help='first domain to check'
    )
    parser.add_argument(
        'retries',
        metavar='RETRIES_DOMAIN',
        type=int,
        help='amount of retries per domain'
    )
    parser.add_argument(
        'retries_delay',
        metavar='RETRIES_DELAY',
        type=int,
        help='delay between retries, in seconds'
    )
    parser.add_argument(
        'api_key',
        metavar='API_KEY',
        help='the api key for azure'
    )


    args = parser.parse_args()
    query_domains(args.input_file_path,
                  args.output_file_path,
                  args.urls_to_fetch,
                  args.max_domains,
                  args.first_domain_pos,
                  args.retries,
                  args.retries_delay,
                  args.api_key)
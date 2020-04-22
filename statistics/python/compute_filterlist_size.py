with open('../../adblock-rust-checking/filter_lists/albania/Albania.txt', 'r') as albania:
    total_rules = 0
    network_rules = 0
    for line in albania.readlines():
        line = line.strip()
        if line and not line.startswith('!'):
            total_rules += 1
        if line and not ('##' in line):
            network_rules += 1

    print('Albania: ' + str(total_rules))
    print('network rules: ' + str(network_rules))

with open('../../adblock-rust-checking/filter_lists/hungary/hufilter.txt', 'r') as hungary:
    total_rules = 0
    network_rules = 0
    for line in hungary.readlines():
        line = line.strip()
        if line and not line.startswith('!'):
            total_rules += 1
        if line and not ('##' in line):
            network_rules += 1

    print('Hungary: ' + str(total_rules))
    print('network rules: ' + str(network_rules))

with open('../../adblock-rust-checking/filter_lists/sri_lanka/sri_lanka.txt', 'r') as sri_lanka:
    total_rules = 0
    network_rules = 0
    for line in sri_lanka.readlines():
        line = line.strip()
        if line and not line.startswith('!'):
            total_rules += 1
        if line and not ('##' in line):
            network_rules += 1

    print('Sri Lanka: ' + str(total_rules))
    print('network rules: ' + str(network_rules))
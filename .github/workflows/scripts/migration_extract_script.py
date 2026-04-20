#!/usr/bin/env python3
"""Extract the 'script' field from a migration YAML file and write it to stdout."""
import sys
import yaml

path = sys.argv[1]
d = yaml.safe_load(open(path))
script = d.get("script", "")
if not script:
    print("ERROR: migration file has no script field", file=sys.stderr)
    sys.exit(1)
sys.stdout.write(script)

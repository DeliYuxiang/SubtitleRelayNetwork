#!/usr/bin/env python3
"""Print the 'name' field from a migration YAML file, falling back to the filename."""
import sys
import yaml

path = sys.argv[1]
try:
    d = yaml.safe_load(open(path))
    print(d.get("name", path))
except Exception:
    print(path)

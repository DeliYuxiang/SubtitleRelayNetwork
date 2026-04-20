#!/usr/bin/env python3
"""
Parse table names from wrangler d1 execute --json output.

Wrangler may mix warning/info text with JSON. This script extracts the first
JSON array it finds in stdin and prints one table name per line.

Usage: wrangler d1 execute ... --json 2>&1 | python3 parse_table_names.py
"""
import json
import re
import sys

text = sys.stdin.read()

# Find the first JSON array in the output (wrangler mixes text with JSON)
m = re.search(r'\[.*\]', text, re.DOTALL)
if not m:
    sys.exit(0)  # empty output → caller will detect empty TABLES and fail

try:
    data = json.loads(m.group())
    for row in data[0].get('results', []):
        name = row.get('name', '')
        if name:
            print(name)
except (json.JSONDecodeError, IndexError, KeyError):
    sys.exit(0)

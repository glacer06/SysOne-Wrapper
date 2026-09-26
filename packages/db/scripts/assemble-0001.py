"""Builds migrations/0001_init.sql from drizzle-kit's 0000_init.sql and the security block.

Used once, when migration 0001 was first written, and kept so the step can be repeated before
0001 ships anywhere. Never run it after 0001 has been applied to a shared database.

    pnpm run db:generate --name init
    pnpm run --silent rls:sql > /tmp/block.sql
    python3 scripts/assemble-0001.py /tmp/block.sql
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = os.path.join(HERE, "..", "migrations")

block = open(sys.argv[1]).read().rstrip("\n")
src = os.path.join(MIGRATIONS, "0000_init.sql")
ddl = open(src).read()

old = '\tCONSTRAINT "runs_pkey" PRIMARY KEY("id","created_at")\n);'
assert ddl.count(old) == 1, "runs table not found in drizzle output"
ddl = ddl.replace(old, '\tCONSTRAINT "runs_pkey" PRIMARY KEY("id","created_at")\n) PARTITION BY RANGE ("created_at");')

header = (
    "-- Migration 0001: every table in data-model.md, then the security block from src/rls.ts.\n"
    "-- The table DDL is drizzle-kit output. runs was edited by hand to PARTITION BY RANGE (created_at).\n"
)
out = header + ddl.rstrip("\n") + "\n--> statement-breakpoint\n" + block + "\n"
open(os.path.join(MIGRATIONS, "0001_init.sql"), "w").write(out)
os.remove(src)

meta = os.path.join(MIGRATIONS, "meta")
os.rename(os.path.join(meta, "0000_snapshot.json"), os.path.join(meta, "0001_snapshot.json"))
journal_path = os.path.join(meta, "_journal.json")
journal = json.load(open(journal_path))
journal["entries"][0]["tag"] = "0001_init"
with open(journal_path, "w") as f:
    json.dump(journal, f, indent=2)
    f.write("\n")

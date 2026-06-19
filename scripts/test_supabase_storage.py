"""Test Supabase Storage connection."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "be", ".env"))

url = os.getenv("SUPABASE_URL", "")
key = os.getenv("SUPABASE_SERVICE_KEY", "")

print(f"SUPABASE_URL: {url}")
print(f"SUPABASE_SERVICE_KEY: {'*' * 10 + key[-10:] if len(key) > 10 else '(empty)'}")

if not key:
    print("ERROR: SUPABASE_SERVICE_KEY is empty. Add it to be/.env")
    sys.exit(1)

from supabase import create_client
client = create_client(url, key)

# List buckets
buckets = client.storage.list_buckets()
print(f"\nBuckets found: {[b.name for b in buckets]}")

if "recordings" in [b.name for b in buckets]:
    print("OK: 'recordings' bucket exists")
    # Try listing files
    files = client.storage.from_("recordings").list()
    print(f"Files in root: {len(files)}")
else:
    print("WARNING: 'recordings' bucket NOT found.")
    print("Create it: Supabase Dashboard -> Storage -> New bucket -> name: recordings, public: yes")

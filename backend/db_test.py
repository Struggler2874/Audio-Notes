import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("DATABASE_URL")
if not url:
       raise SystemExit("DATABASE_URL not found. Check backend/.env")

with psycopg.connect(url) as conn:
       print(conn.execute("select count(*) from recordings").fetchone())
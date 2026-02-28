"""Block until PostgreSQL accepts connections (max 60 s)."""
import os, time
from sqlalchemy import create_engine, text

url = os.getenv("DATABASE_URL", "postgresql://sentinel:sentinel@db:5432/sentinel")
engine = create_engine(url)

for attempt in range(30):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database is ready.")
        break
    except Exception as exc:
        print(f"Waiting for database (attempt {attempt + 1}/30) ...")
        time.sleep(2)
else:
    raise RuntimeError("Database not reachable after 60 seconds")

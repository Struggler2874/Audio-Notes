import os
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")


def get_conn():
    # dict_row makes each row a dict, e.g. row["status"]
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def insert_recording(rec_id, filename, language, storage_path, duration):
    with get_conn() as conn:
        return conn.execute(
            """
            insert into recordings (id, filename, language, storage_path, duration_seconds, status)
            values (%s, %s, %s, %s, %s, 'queued')
            returning *
            """,
            (rec_id, filename, language, storage_path, duration),
        ).fetchone()


def list_recordings():
    with get_conn() as conn:
        return conn.execute(
            """
            select id, filename, language, status, progress, progress_message,
                   duration_seconds, error_message, created_at
            from recordings order by created_at desc
            """
        ).fetchall()


def get_recording(rec_id):
    with get_conn() as conn:
        return conn.execute(
            "select * from recordings where id = %s", (rec_id,)
        ).fetchone()
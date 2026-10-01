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

def update_progress(rec_id, progress, message):
    with get_conn() as conn:
        conn.execute(
            "update recordings set progress=%s, progress_message=%s, updated_at=now() where id=%s",
            (progress, message, rec_id),
        )


def claim_next():
    """Atomically take the oldest queued job. SKIP LOCKED means two workers never grab the same row."""
    with get_conn() as conn:
        return conn.execute(
            """
            update recordings
            set status='processing', progress=1, progress_message='Starting...',
                error_message=null, updated_at=now()
            where id = (
                select id from recordings where status='queued'
                order by created_at limit 1 for update skip locked
            )
            returning *
            """
        ).fetchone()


def requeue_stuck():
    """On startup: jobs left 'processing' by a crash or restart go back in the queue."""
    with get_conn() as conn:
        conn.execute(
            "update recordings set status='queued', progress_message='Re-queued after a restart' "
            "where status='processing'"
        )


def save_transcript(rec_id, transcript):
    with get_conn() as conn:
        conn.execute(
            "update recordings set transcript=%s, updated_at=now() where id=%s",
            (transcript, rec_id),
        )


def mark_completed(rec_id, summary, error_message):
    with get_conn() as conn:
        conn.execute(
            """
            update recordings
            set status='completed', progress=100, progress_message='Done',
                summary=%s, error_message=%s, updated_at=now()
            where id=%s
            """,
            (summary, error_message, rec_id),
        )


def mark_failed(rec_id, message):
    with get_conn() as conn:
        conn.execute(
            """
            update recordings
            set status='failed', progress_message='Failed', error_message=%s, updated_at=now()
            where id=%s
            """,
            (message, rec_id),
        )


def requeue(rec_id):
    """Retry: only failed recordings, or completed ones whose summary is missing."""
    with get_conn() as conn:
        return conn.execute(
            """
            update recordings
            set status='queued', progress=0, progress_message='Queued', error_message=null,
                updated_at=now()
            where id=%s and (status='failed' or (status='completed' and summary is null))
            returning *
            """,
            (rec_id,),
        ).fetchone()
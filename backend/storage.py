import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

BUCKET = "audio"
_client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))


def upload_file(storage_path: str, local_path: str, content_type: str):
    with open(local_path, "rb") as f:
        _client.storage.from_(BUCKET).upload(
            storage_path, f, {"content-type": content_type}
        )


def delete_file(storage_path: str):
    _client.storage.from_(BUCKET).remove([storage_path])


def download_file(storage_path: str) -> bytes:
    return _client.storage.from_(BUCKET).download(storage_path)
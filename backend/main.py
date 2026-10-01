import logging
import mimetypes
import os
import tempfile
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import audio
import db
import storage
import worker

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("audio-notes")

ALLOWED_EXT = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac"}
LANGUAGES = {"bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "ta-IN", "te-IN"}
MAX_BYTES = 50 * 1024 * 1024  # Supabase free plan allows 50 MB per file


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background worker thread when the server starts
    if os.getenv("RUN_WORKER", "true").lower() == "true":
        threading.Thread(target=worker.run_forever, name="worker", daemon=True).start()
    yield


app = FastAPI(title="Audio Notes API", lifespan=lifespan)

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# These are plain `def` (not `async def`) on purpose: they call blocking code
# (ffprobe, file upload), and FastAPI runs plain `def` endpoints in a thread pool.
@app.post("/recordings", status_code=201)
def upload_recording(file: UploadFile = File(...), language: str = Form("en-IN")):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type. Use: {', '.join(sorted(ALLOWED_EXT))}")
    if language not in LANGUAGES:
        raise HTTPException(400, "Unsupported language.")

    rec_id = uuid.uuid4()
    storage_path = f"{rec_id}{suffix}"
    tmp_path = None

    try:
        # 1. Stream the upload to a temp file, enforcing the size limit
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            size = 0
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "File is too large. The limit is 50 MB.")
                tmp.write(chunk)
        if size == 0:
            raise HTTPException(400, "The file is empty.")

        # 2. Confirm it's real audio and get its duration
        try:
            duration = audio.probe_duration(tmp_path)
        except ValueError as e:
            raise HTTPException(400, str(e))

        # 3. Save the file in the storage bucket
        content_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
        try:
            storage.upload_file(storage_path, tmp_path, content_type)
        except Exception:
            log.exception("Storage upload failed")
            raise HTTPException(502, "Could not save the file to storage. Please try again.")

        # 4. Create the database row (status = queued)
        try:
            row = db.insert_recording(rec_id, file.filename, language, storage_path, duration)
        except Exception:
            log.exception("Database insert failed")
            try:
                storage.delete_file(storage_path)  # don't leave an orphan file behind
            except Exception:
                log.exception("Cleanup of orphan file failed")
            raise HTTPException(500, "Could not save the recording. Please try again.")

        return row
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.get("/recordings")
def list_recordings():
    return db.list_recordings()


@app.get("/recordings/{recording_id}")
def get_recording(recording_id: UUID):
    row = db.get_recording(recording_id)
    if not row:
        raise HTTPException(404, "Recording not found.")
    return row


@app.post("/recordings/{recording_id}/retry")
def retry_recording(recording_id: UUID):
    if not db.get_recording(recording_id):
        raise HTTPException(404, "Recording not found.")
    row = db.requeue(recording_id)
    if not row:
        raise HTTPException(409, "Only failed recordings, or ones missing a summary, can be retried.")
    return row
import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path

import db
import gnani
import storage
import summarizer
from gnani import TranscriptionError
from summarizer import SummaryError

log = logging.getLogger("audio-notes.worker")

CHUNK_SECONDS = 28  # Gnani's real limit is 30s; stay safely under it
POLL_SECONDS = 3


class JobError(Exception):
    """Its message is safe to show to the user."""


def split_audio(src: str, out_dir: str) -> list[str]:
    """Convert to 16 kHz mono WAV and cut into CHUNK_SECONDS pieces."""
    pattern = str(Path(out_dir) / "chunk_%04d.wav")
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error", "-i", src, "-vn",
                "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
                "-f", "segment", "-segment_time", str(CHUNK_SECONDS),
                "-reset_timestamps", "1", pattern,
            ],
            capture_output=True, text=True, timeout=900,
        )
    except subprocess.TimeoutExpired:
        raise JobError("Converting the audio took too long.")
    chunks = sorted(Path(out_dir).glob("chunk_*.wav"))
    if result.returncode != 0 or not chunks:
        log.error("ffmpeg failed: %s", result.stderr[:300])
        raise JobError("The audio could not be converted. The file may be corrupted.")
    return [str(c) for c in chunks]


def process(job: dict):
    rec_id = job["id"]
    transcript = job["transcript"]  # already set if this is a retry after a summary failure

    if not transcript:
        with tempfile.TemporaryDirectory() as tmp:
            db.update_progress(rec_id, 5, "Downloading audio...")
            src = os.path.join(tmp, "input" + Path(job["storage_path"]).suffix)
            try:
                Path(src).write_bytes(storage.download_file(job["storage_path"]))
            except Exception:
                log.exception("Download from storage failed")
                raise JobError("Could not read the uploaded file from storage.")

            db.update_progress(rec_id, 10, "Preparing audio...")
            chunks = split_audio(src, tmp)

            parts = []
            total = len(chunks)
            for i, chunk in enumerate(chunks, start=1):
                pct = 10 + int(75 * (i - 1) / total)
                db.update_progress(rec_id, pct, f"Transcribing part {i} of {total}...")
                parts.append(gnani.transcribe_chunk(chunk, job["language"]))

        transcript = " ".join(p for p in parts if p).strip()
        if not transcript:
            raise JobError("No speech was detected in this audio.")
        db.save_transcript(rec_id, transcript)  # keep it even if the summary fails

    db.update_progress(rec_id, 90, "Writing summary...")
    try:
        summary = summarizer.summarize(transcript)
    except SummaryError as e:
        db.mark_completed(rec_id, None, f"The transcript is ready, but the summary failed: {e}")
        return
    db.mark_completed(rec_id, summary, None)


def run_job(job: dict):
    rec_id = job["id"]
    log.info("Processing %s", rec_id)
    try:
        process(job)
        log.info("Finished %s", rec_id)
    except (JobError, TranscriptionError) as e:
        log.warning("Job %s failed: %s", rec_id, e)
        db.mark_failed(rec_id, str(e))
    except Exception:
        log.exception("Unexpected error in job %s", rec_id)
        db.mark_failed(rec_id, "Something went wrong while processing this file. Please try again.")


def run_forever():
    log.info("Worker started")
    try:
        db.requeue_stuck()
    except Exception:
        log.exception("Could not re-queue stuck jobs")
    while True:
        try:
            job = db.claim_next()
        except Exception:
            log.exception("Could not reach the database")
            time.sleep(10)
            continue
        if job is None:
            time.sleep(POLL_SECONDS)
            continue
        run_job(job)
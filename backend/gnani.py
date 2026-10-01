import logging
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("audio-notes.gnani")

URL = "https://api.vachana.ai/stt/v3"
RETRY_STATUSES = {429, 500, 502, 503, 504}


class TranscriptionError(Exception):
    """Its message is safe to show to the user."""


def _friendly(status: int) -> str:
    if status in (401, 403):
        return "The transcription service rejected our API key, or the credits have run out."
    if status == 400:
        return "The transcription service could not process this audio."
    return f"The transcription service returned an unexpected error ({status})."


def transcribe_chunk(path: str, language: str, attempts: int = 3) -> str:
    api_key = os.getenv("GNANI_API_KEY")
    if not api_key:
        raise TranscriptionError("The transcription service is not configured on the server.")

    last_error = "Unknown error."
    for attempt in range(1, attempts + 1):
        try:
            with open(path, "rb") as f:
                resp = httpx.post(
                    URL,
                    headers={"X-API-Key-ID": api_key},
                    files={"audio_file": (os.path.basename(path), f, "audio/wav")},
                    data={"language_code": language, "format": "transcribe"},
                    timeout=60,
                )
        except (httpx.TimeoutException, httpx.TransportError):
            last_error = "The transcription service did not respond in time."
        else:
            if resp.status_code == 200:
                try:
                    return (resp.json().get("transcript") or "").strip()
                except ValueError:
                    last_error = "The transcription service sent an unreadable response."
            elif resp.status_code in RETRY_STATUSES:
                last_error = f"The transcription service is busy or down ({resp.status_code})."
            else:
                # 400/401/403 etc: retrying won't help, fail immediately
                log.error("Gnani error %s: %s", resp.status_code, resp.text[:300])
                raise TranscriptionError(_friendly(resp.status_code))

        log.warning("Gnani attempt %d/%d failed: %s", attempt, attempts, last_error)
        if attempt < attempts:
            time.sleep(2 ** attempt)  # wait 2s, then 4s

    raise TranscriptionError(f"{last_error} Gave up after {attempts} attempts.")
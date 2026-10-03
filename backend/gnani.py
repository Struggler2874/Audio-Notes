import logging
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("audio-notes.gnani")

URL = "https://api.vachana.ai/stt/v3"
RETRY_STATUSES = {429, 500, 502, 503, 504}

# Gnani error codes we know about, mapped to short messages that are safe to show
KNOWN_ERRORS = {
    "INVALID_API_KEY": "The transcription service rejected our API key.",
    "MAX_AUDIO_DURATION_EXCEEDED": "An audio piece was longer than the transcription service allows (30 seconds).",
    "AUDIO_CONVERSION_ERROR": "The transcription service could not decode this audio. The file may be corrupted.",
}


class TranscriptionError(Exception):
    """Its message is safe to show to the user."""


def _error_info(resp: httpx.Response) -> tuple[str, str]:
    """Pull (error code, message) out of a Gnani error response. Two formats exist:
    {"detail": {"error_code": ..., "message": ...}} and {"error": {"type": ..., "message": ...}}."""
    try:
        data = resp.json()
    except ValueError:
        return "", ""
    if not isinstance(data, dict):
        return "", ""
    detail = data.get("detail")
    if isinstance(detail, dict):
        return str(detail.get("error_code", "")), str(detail.get("message", ""))
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("type", "")), str(error.get("message", ""))
    return "", ""


def _friendly(resp: httpx.Response) -> str:
    code, msg = _error_info(resp)
    if code in KNOWN_ERRORS:
        return KNOWN_ERRORS[code]
    if resp.status_code in (401, 403):
        return "The transcription service rejected our API key, or the credits have run out."
    if code or msg:
        first_line = (msg.strip().splitlines() or [""])[0][:150]
        return f"The transcription service returned an error ({resp.status_code} {code}). {first_line}".strip()
    return f"The transcription service returned an unexpected error ({resp.status_code})."


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
                    data = resp.json()
                    # "output.literal" has correct word spacing; fall back to "transcript"
                    literal = (data.get("output") or {}).get("literal")
                    return (literal or data.get("transcript") or "").strip()
                except (ValueError, AttributeError):
                    last_error = "The transcription service sent an unreadable response."
            elif resp.status_code in RETRY_STATUSES:
                last_error = f"The transcription service is busy or down ({resp.status_code})."
            else:
                # 400/401/403 etc: retrying won't help, so fail immediately.
                # The full response is logged for us; the user only sees the short message.
                log.error("Gnani error %s: %s", resp.status_code, resp.text[:300])
                raise TranscriptionError(_friendly(resp))

        log.warning("Gnani attempt %d/%d failed: %s", attempt, attempts, last_error)
        if attempt < attempts:
            time.sleep(2 ** attempt)  # wait 2s, then 4s

    raise TranscriptionError(f"{last_error} Gave up after {attempts} attempts.")
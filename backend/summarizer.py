import logging
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("audio-notes.summary")

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
RETRY_STATUSES = {429, 500, 502, 503, 504}

PROMPT = """Below is an automatic speech-to-text transcript. It may be lowercase, unpunctuated and contain small errors.
Write a summary in the same language as the transcript, in plain text (no markdown headings, no bold):
1. An overview of 2-3 sentences.
2. "Key points:" followed by short lines starting with "- ".
3. "Action items:" followed by lines starting with "- " (leave this section out if there are none).
Only use information from the transcript. Do not invent anything.

Transcript:
"""


class SummaryError(Exception):
    """Its message is safe to show to the user."""


def summarize(transcript: str, attempts: int = 3) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SummaryError("The summary service is not configured on the server.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    body = {"contents": [{"parts": [{"text": PROMPT + transcript}]}]}

    last_error = "Unknown error."
    for attempt in range(1, attempts + 1):
        try:
            resp = httpx.post(url, headers={"x-goog-api-key": api_key}, json=body, timeout=90)
        except (httpx.TimeoutException, httpx.TransportError):
            last_error = "The summary service did not respond in time."
        else:
            if resp.status_code == 200:
                try:
                    parts = resp.json()["candidates"][0]["content"]["parts"]
                    text = "".join(p.get("text", "") for p in parts).strip()
                except (KeyError, IndexError, ValueError):
                    text = ""
                if text:
                    return text
                last_error = "The summary service returned an empty answer."
            elif resp.status_code in RETRY_STATUSES:
                last_error = f"The summary service is busy or down ({resp.status_code})."
            else:
                log.error("Gemini error %s: %s", resp.status_code, resp.text[:300])
                raise SummaryError(f"The summary service returned an error ({resp.status_code}).")

        log.warning("Gemini attempt %d/%d failed: %s", attempt, attempts, last_error)
        if attempt < attempts:
            time.sleep(2 ** attempt)

    raise SummaryError(f"{last_error} Gave up after {attempts} attempts.")
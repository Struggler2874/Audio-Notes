# Audio Notes

A web app where you upload an audio file and get back a transcript (Gnani ASR) and an AI-generated summary (Gemini).

**Live app:** https://audio-notes-omega.vercel.app/
**Architecture page:** https://audio-notes-omega.vercel.app//architecture

Note: the backend is on a free plan and sleeps when idle, so the first load can take about a minute.

## Features
- Drag-and-drop upload with a live progress bar
- Transcript and summary for each recording, with live processing progress
- Long audio handled by splitting it into chunks
- Past uploads list with search and status filter, and every recording can be reopened
- Copy the transcript, or download the notes as a text file
- Clear messages for every failure, with Try again and Retry summary buttons

## Stack
- Frontend: Next.js (App Router), Tailwind CSS
- Backend: FastAPI, with a background worker thread
- Database and file storage: Supabase (Postgres and a private storage bucket)
- Transcription: Gnani speech-to-text API
- Summary: Google Gemini API
- Hosting: Vercel (frontend), Render with Docker (backend)

## How it works
1. The browser uploads the file to FastAPI, which validates it with ffprobe, saves it in the bucket and creates a `queued` row.
2. A background worker converts the audio with ffmpeg, splits it into 28-second chunks (Gnani accepts at most 30 s), transcribes each chunk, then asks Gemini for a summary.
3. The page polls the API and shows live progress, the summary and the transcript.

See the `/architecture` page for the full explanation.

## Run locally
Requirements: Node.js, Python 3.11+, ffmpeg (with ffprobe).

Backend:

    cd backend
    python -m venv venv
    .\venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt
    python -m uvicorn main:app --reload

Copy `backend/.env.example` to `backend/.env` and fill in the values.

Frontend:

    cd frontend
    npm install
    npm run dev

Create `frontend/.env.local` with: NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

Create a `recordings` table in Postgres (id, filename, language, storage_path, status, progress, progress_message, duration_seconds, transcript, summary, error_message, created_at, updated_at) and a private storage bucket named `audio`.
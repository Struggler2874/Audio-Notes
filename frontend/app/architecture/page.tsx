import Link from "next/link";

export const metadata = { title: "Architecture · Audio Notes" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-800">{children}</div>
    </section>
  );
}

export default function ArchitecturePage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-blue-600 underline">
        &larr; Back to the app
      </Link>
      <h1 className="mt-4 text-2xl font-bold">How Audio Notes works</h1>
      <p className="mt-2 text-sm text-gray-600">
        Source code:{" "}
        <a
          href="https://github.com/Struggler2874/Audio-Notes"
          className="text-blue-600 underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/Struggler2874/Audio-Notes
        </a>
      </p>

      <Section title="Overview">
        <p>
          A user uploads an audio file and gets back a transcript and a summary. The system has
          three parts: a Next.js frontend, a FastAPI backend (which also runs the background
          worker), and Supabase, which provides the Postgres database and the storage bucket.
          Transcription uses Gnani&apos;s speech-to-text API and the summary comes from Google&apos;s
          Gemini API.
        </p>
      </Section>

      <Section title="The flow from upload to transcript">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <b>Browser checks the file.</b> The page rejects wrong file types, empty files and files
            over 50 MB before sending anything, and shows a real upload progress bar.
          </li>
          <li>
            <b>Backend validates it.</b> FastAPI streams the upload to a temporary file and runs{" "}
            <code>ffprobe</code> on it. If it is not valid audio (corrupted, or a renamed text file),
            the request fails immediately with a clear message.
          </li>
          <li>
            <b>Backend stores it.</b> The file is saved in a private Supabase Storage bucket and a
            row is inserted in Postgres with status <code>queued</code>. The request then returns at
            once, so the user never waits for transcription inside an HTTP request.
          </li>
          <li>
            <b>The worker picks it up.</b> A background worker claims the oldest queued row,
            downloads the file, converts it to 16 kHz mono WAV with <code>ffmpeg</code> and cuts it
            into chunks.
          </li>
          <li>
            <b>Chunks are transcribed.</b> Each chunk is sent to Gnani, one after another. After
            every chunk the worker writes its progress to the database. The chunk transcripts are
            joined in order into one transcript, which is saved.
          </li>
          <li>
            <b>The summary is generated.</b> The full transcript is sent to Gemini, and the summary
            is saved. The status becomes <code>completed</code>.
          </li>
          <li>
            <b>The page shows the result.</b> The recording page asks the API for the status every
            two seconds while the job is running, then shows the summary and transcript.
          </li>
        </ol>
      </Section>

      <Section title="Where files and data live">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Audio files:</b> a private Supabase Storage bucket. Only the backend can read or
            write it, using a server-side service key that is never sent to the browser.
          </li>
          <li>
            <b>Everything else:</b> one Postgres table, <code>recordings</code>. It holds the
            filename, language, status, progress, transcript, summary and any error message. It
            doubles as the job queue.
          </li>
          <li>
            <b>Temporary files:</b> uploads and chunks exist on the server&apos;s disk only while a
            request or job is running, and are deleted afterwards.
          </li>
        </ul>
      </Section>

      <Section title="How long audio is handled">
        <p>
          Gnani&apos;s REST endpoint rejects clips longer than 30 seconds (its documentation
          mentions 60, but the API enforced 30 in my tests). So the worker splits every file into
          28-second chunks with ffmpeg, transcribes each chunk, and stitches the text back together
          in order. Because the work is done chunk by chunk, a long file shows
          &quot;Transcribing part 4 of 11&quot; instead of a frozen page, and memory use stays small
          however long the audio is. The Gemini model has a very large context window, so even a
          long transcript is summarised in a single call.
        </p>
        <p>
          Files are limited to 50 MB, which is the per-file limit of Supabase&apos;s free plan.
        </p>
      </Section>

      <Section title="Synchronous vs background work">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Synchronous (inside the upload request):</b> file type and size checks, the{" "}
            <code>ffprobe</code> validity check, saving to the bucket, and creating the database row.
            These are fast, and the user needs to know straight away if they fail.
          </li>
          <li>
            <b>In the background:</b> converting, chunking, calling Gnani, calling Gemini. These can
            take minutes and depend on external services.
          </li>
        </ul>
        <p>
          The queue is the Postgres table itself. The worker is a loop in a background thread that
          claims jobs with <code>UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)</code>, so
          two workers could never take the same job. If the server restarts mid-job, jobs left in{" "}
          <code>processing</code> are put back in the queue on startup.
        </p>
      </Section>

      <Section title="Failure handling">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Bad input is rejected twice: in the browser for instant feedback, and again on the server,
            which never trusts the browser.
          </li>
          <li>
            Calls to Gnani and Gemini have timeouts and retry up to 3 times with a growing delay for
            timeouts, 429 and 5xx errors. Errors that retrying cannot fix (a wrong API key, bad
            audio) fail immediately.
          </li>
          <li>
            Raw errors from other services are logged but never shown. The user sees a plain message
            such as &quot;No speech was detected in this audio&quot;.
          </li>
          <li>
            If the transcript succeeds but the summary fails, the transcript is kept and the page
            offers a &quot;Retry summary&quot; button, which skips the transcription step.
          </li>
          <li>
            If saving the database row fails after the file was uploaded, the file is deleted so no
            orphan is left in the bucket.
          </li>
          <li>
            If the API cannot be reached at all, the frontend says so and offers to try again.
          </li>
          <li>Failed recordings have a &quot;Try again&quot; button that re-queues the job.</li>
        </ul>
      </Section>

      <Section title="Progress">
        <p>
          The worker updates a percentage and a message in the database as it goes: downloading,
          preparing audio, transcribing part N of M, writing the summary. The upload itself has a
          separate progress bar in the browser. Because progress lives in the database and not in the
          browser, the user can close the tab and come back later, and the list of past uploads shows
          the live status of each recording.
        </p>
      </Section>

      <Section title="What I would do differently with more time">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Separate worker process and a real queue</b> (for example Celery with Redis), so
            heavy jobs cannot compete with API requests, and workers can scale on their own. Right
            now the worker thread shares the API process.
          </li>
          <li>
            <b>Direct-to-bucket uploads</b> with signed URLs, so large files do not pass through the
            API server, and the 50 MB limit could be raised.
          </li>
          <li>
            <b>Resume from the last finished chunk.</b> Chunk results are not saved individually, so a
            restart mid-job starts transcription again from the beginning.
          </li>
          <li>
            <b>Smarter chunking:</b> split at silences, with a small overlap, so words are not cut in
            half at a boundary. Transcribe a few chunks in parallel to finish faster.
          </li>
          <li>
            <b>Gnani&apos;s batch API</b> for very large files, instead of many small requests.
          </li>
          <li>
            <b>User accounts</b>, so recordings are private. Right now anyone with the link can open a
            recording, and the list shows all uploads.
          </li>
          <li>
            Delete and rename actions, automatic clean-up of old files, rate limiting, server-sent
            events instead of polling, and automated tests.
          </li>
        </ul>
      </Section>
    </main>
  );
}
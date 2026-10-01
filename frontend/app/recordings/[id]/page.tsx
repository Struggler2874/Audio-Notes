"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LANGUAGES, getRecording, retryRecording, type Recording } from "@/lib/api";

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RecordingPage() {
  const { id } = useParams<{ id: string }>();
  const [rec, setRec] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setRec(await getRecording(id));
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load this recording.";
      if (msg === "Recording not found.") setNotFound(true);
      else setError(msg);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 2 seconds until the recording has finished (or failed)
  const inProgress = !rec || rec.status === "queued" || rec.status === "processing";
  useEffect(() => {
    if (notFound || !inProgress) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [inProgress, notFound, load]);

  async function onRetry() {
    setRetrying(true);
    try {
      setRec(await retryRecording(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setRetrying(false);
    }
  }

  async function copyTranscript() {
    if (!rec?.transcript) return;
    try {
      await navigator.clipboard.writeText(rec.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  }

  const back = (
    <Link href="/" className="text-sm text-blue-600 underline">
      &larr; All recordings
    </Link>
  );

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {back}
        <p className="mt-6">This recording does not exist.</p>
      </main>
    );
  }

  const language = LANGUAGES.find((l) => l.code === rec?.language)?.label ?? rec?.language;

  return (
    <main className="mx-auto max-w-3xl p-6">
      {back}

      {!rec && !error && <p className="mt-6 text-gray-500">Loading...</p>}

      {error && (
        <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <button onClick={load} className="underline">Try again</button>
        </p>
      )}

      {rec && (
        <>
          <h1 className="mt-4 break-words text-2xl font-bold">{rec.filename}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {language}
            {rec.duration_seconds ? ` · ${formatDuration(rec.duration_seconds)}` : ""}
            {" · "}
            {new Date(rec.created_at).toLocaleString()}
          </p>

          {(rec.status === "queued" || rec.status === "processing") && (
            <section className="mt-6 rounded-lg border p-4">
              <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                <div
                  className="h-2 bg-blue-600 transition-all"
                  style={{ width: `${Math.max(rec.progress, 3)}%` }}
                />
              </div>
              <p className="mt-2 text-sm">
                {rec.status === "queued"
                  ? "Waiting in the queue..."
                  : rec.progress_message ?? "Processing..."}{" "}
                <span className="text-gray-500">({rec.progress}%)</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                This runs on the server, so you can leave this page and come back later.
              </p>
            </section>
          )}

          {rec.status === "failed" && (
            <section role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-medium text-red-800">This recording could not be processed.</p>
              <p className="mt-1 text-sm text-red-700">{rec.error_message}</p>
              <button
                onClick={onRetry}
                disabled={retrying}
                className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {retrying ? "Retrying..." : "Try again"}
              </button>
            </section>
          )}

          {rec.status === "completed" && (
            <>
              {rec.error_message && (
                <section role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">{rec.error_message}</p>
                  <button
                    onClick={onRetry}
                    disabled={retrying}
                    className="mt-3 rounded bg-amber-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    {retrying ? "Retrying..." : "Retry summary"}
                  </button>
                </section>
              )}

              {rec.summary && (
                <section className="mt-6">
                  <h2 className="mb-2 font-semibold">Summary</h2>
                  <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-relaxed">
                    {rec.summary}
                  </p>
                </section>
              )}

              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold">Transcript</h2>
                  <button onClick={copyTranscript} className="text-sm text-blue-600 underline">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap rounded-lg border p-4 text-sm leading-relaxed">
                  {rec.transcript}
                </p>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
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
    <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
      &larr; All recordings
    </Link>
  );

  const language = LANGUAGES.find((l) => l.code === rec?.language)?.label ?? rec?.language;

  if (notFound) {
    return (
      <div>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-8">
          {back}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            This recording does not exist.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-8">
        {back}

        {!rec && !error && <div className="mt-6 h-32 animate-pulse rounded-2xl bg-slate-200" />}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}{" "}
            <button onClick={load} className="font-medium underline">Try again</button>
          </p>
        )}

        {rec && (
          <>
            <h1 className="mt-4 break-words text-2xl font-bold text-slate-900">{rec.filename}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">{language}</span>
              {rec.duration_seconds ? (
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
                  {formatDuration(rec.duration_seconds)}
                </span>
              ) : null}
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
                {new Date(rec.created_at).toLocaleString()}
              </span>
            </div>

            {(rec.status === "queued" || rec.status === "processing") && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium text-slate-900">
                    {rec.status === "queued"
                      ? "Waiting in the queue..."
                      : rec.progress_message ?? "Processing..."}
                  </p>
                  <span className="text-2xl font-bold text-indigo-600">{rec.progress}%</span>
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-3 animate-pulse rounded-full bg-indigo-600 transition-all duration-500"
                    style={{ width: `${Math.max(rec.progress, 3)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  This runs on the server, so you can leave this page and come back later.
                </p>
              </section>
            )}

            {rec.status === "failed" && (
              <section role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
                <p className="font-semibold text-red-800">This recording could not be processed.</p>
                <p className="mt-1 text-sm text-red-700">{rec.error_message}</p>
                <button
                  onClick={onRetry}
                  disabled={retrying}
                  className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {retrying ? "Retrying..." : "Try again"}
                </button>
              </section>
            )}

            {rec.status === "completed" && (
              <>
                {rec.error_message && (
                  <section role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <p className="text-sm text-amber-800">{rec.error_message}</p>
                    <button
                      onClick={onRetry}
                      disabled={retrying}
                      className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {retrying ? "Retrying..." : "Retry summary"}
                    </button>
                  </section>
                )}

                {rec.summary && (
                  <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-700">
                      Summary
                    </h2>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {rec.summary}
                    </p>
                  </section>
                )}

                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                      Transcript
                    </h2>
                    <button
                      onClick={copyTranscript}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {rec.transcript}
                  </p>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
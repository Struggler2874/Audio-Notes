"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import {
  ALLOWED_EXT, LANGUAGES, MAX_MB, listRecordings, uploadRecording, type Recording,
} from "@/lib/api";

const STATUS_STYLE: Record<string, { pill: string; dot: string; label: string }> = {
  queued: { pill: "bg-slate-100 text-slate-700", dot: "bg-slate-400", label: "Queued" },
  processing: { pill: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500 animate-pulse", label: "Processing" },
  completed: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", label: "Completed" },
  failed: { pill: "bg-red-100 text-red-700", dot: "bg-red-500", label: "Failed" },
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en-IN");
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const refresh = useCallback(async () => {
    try {
      setRecordings(await listRecordings());
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load your uploads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // If the list is still loading after a few seconds, explain why
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Keep the list fresh while anything is still being processed
  const active = recordings.some((r) => r.status === "queued" || r.status === "processing");
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  function retryList() {
    setListError(null);
    setLoading(true);
    refresh();
  }

  function onPick(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setError(`Unsupported file type. Use: ${ALLOWED_EXT.join(", ")}`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`This file is too large. The limit is ${MAX_MB} MB.`);
      return;
    }
    if (f.size === 0) {
      setError("This file is empty.");
      return;
    }
    setFile(f);
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setPercent(0);
    setError(null);
    try {
      const rec = await uploadRecording(file, language, setPercent);
      setUploading(false);
      router.push(`/recordings/${rec.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setUploading(false);
    }
  }

  // Search by file name and filter by status (done in the browser)
  const visible = recordings.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      r.filename.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Turn recordings into notes
        </h1>
        <p className="mt-2 text-slate-600">
          Upload an audio file and get a transcript and a short summary.
        </p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!uploading) onPick(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="file"
              accept={ALLOWED_EXT.join(",")}
              disabled={uploading}
              className="sr-only"
              onChange={(e) => {
                onPick(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <p className="mt-3 font-medium text-slate-800">
              Drop an audio file here, or <span className="text-indigo-600 underline">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ALLOWED_EXT.join(", ")} · up to {MAX_MB} MB
            </p>
          </label>

          {file && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
              </div>
              {!uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="ml-3 text-sm text-slate-500 hover:text-slate-800"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-700">
              Language spoken{" "}
              <select
                value={language}
                disabled={uploading}
                onChange={(e) => setLanguage(e.target.value)}
                className="ml-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
            <button
              onClick={onUpload}
              disabled={!file || uploading}
              className="ml-auto rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload and transcribe"}
            </button>
          </div>

          {uploading && (
            <div className="mt-4">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-2.5 rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {percent < 100
                  ? `Uploading... ${percent}%`
                  : "Upload complete. Checking and saving the file..."}
              </p>
              {percent >= 100 && (
                <p className="mt-1 text-xs text-slate-500">
                  If the server was asleep, this can take up to a minute.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Past uploads</h2>

          {recordings.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by file name"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
                <option value="queued">Queued</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          )}

          {loading && (
            <>
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
                ))}
              </div>
              {slow && (
                <p className="mt-3 text-sm text-slate-500">
                  Waking up the server. On the free plan this can take up to a minute...
                </p>
              )}
            </>
          )}

          {listError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {listError}{" "}
              <button onClick={retryList} className="font-medium underline">Try again</button>
            </p>
          )}

          {!loading && !listError && recordings.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
              No uploads yet. Upload your first recording above.
            </div>
          )}

          {!loading && !listError && recordings.length > 0 && visible.length === 0 && (
            <p className="text-sm text-slate-500">No recordings match your search.</p>
          )}

          <ul className="mt-2 flex flex-col gap-2">
            {visible.map((r) => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.queued;
              return (
                <li key={r.id}>
                  <Link
                    href={`/recordings/${r.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{r.filename}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleString()}
                        {r.duration_seconds ? ` · ${formatDuration(r.duration_seconds)}` : ""}
                      </p>
                      {r.status === "failed" && r.error_message && (
                        <p className="mt-1 truncate text-xs text-red-600">{r.error_message}</p>
                      )}
                    </div>
                    <span className={`ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${st.pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {r.status === "processing" ? `${st.label} ${r.progress}%` : st.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
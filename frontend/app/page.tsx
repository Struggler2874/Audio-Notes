"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ALLOWED_EXT, LANGUAGES, MAX_MB, listRecordings, uploadRecording, type Recording,
} from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en-IN");
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

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

  // Keep the list fresh while anything is still being processed
  const active = recordings.some((r) => r.status === "queued" || r.status === "processing");
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [active, refresh]);

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
      router.push(`/recordings/${rec.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audio Notes</h1>
        <Link href="/architecture" className="text-sm text-blue-600 underline">
          How it works
        </Link>
      </header>

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 font-semibold">Upload a recording</h2>
        <div className="flex flex-col gap-3">
          <input
            type="file"
            accept={ALLOWED_EXT.join(",")}
            disabled={uploading}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <label className="text-sm">
            Language spoken:{" "}
            <select
              value={language}
              disabled={uploading}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded border px-2 py-1"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-gray-500">
            Formats: {ALLOWED_EXT.join(", ")}. Maximum {MAX_MB} MB.
          </p>

          {uploading && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                <div className="h-2 bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {percent < 100 ? `Uploading... ${percent}%` : "Upload complete. Checking and saving the file..."}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          <button
            onClick={onUpload}
            disabled={!file || uploading}
            className="w-fit rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload and transcribe"}
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Past uploads</h2>
        {loading && <p className="text-sm text-gray-500">Loading...</p>}
        {listError && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
            {listError}{" "}
            <button onClick={refresh} className="underline">Try again</button>
          </p>
        )}
        {!loading && !listError && recordings.length === 0 && (
          <p className="text-sm text-gray-500">No uploads yet. Upload your first recording above.</p>
        )}
        <ul className="flex flex-col gap-2">
          {recordings.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recordings/${r.id}`}
                className="flex items-center justify-between rounded border p-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.filename}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
                    {r.duration_seconds ? ` · ${formatDuration(r.duration_seconds)}` : ""}
                  </p>
                </div>
                <span className={`ml-3 shrink-0 rounded px-2 py-1 text-xs ${STATUS_STYLE[r.status]}`}>
                  {r.status === "processing" ? `${r.progress}%` : r.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
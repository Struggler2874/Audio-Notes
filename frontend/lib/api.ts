export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export const MAX_MB = 50;
export const ALLOWED_EXT = [".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac"];
export const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
];

export type Status = "queued" | "processing" | "completed" | "failed";

export type Recording = {
  id: string;
  filename: string;
  language: string;
  status: Status;
  progress: number;
  progress_message: string | null;
  duration_seconds: number | null;
  transcript?: string | null;
  summary?: string | null;
  error_message: string | null;
  created_at: string;
};

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
  } catch {
    /* body was not JSON */
  }
  return `Request failed (${res.status}).`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export const listRecordings = () => request<Recording[]>("/recordings");
export const getRecording = (id: string) => request<Recording>(`/recordings/${id}`);
export const retryRecording = (id: string) =>
  request<Recording>(`/recordings/${id}/retry`, { method: "POST" });

// fetch() cannot report upload progress, so uploads use XMLHttpRequest.
export function uploadRecording(
  file: File,
  language: string,
  onProgress: (percent: number) => void
): Promise<Recording> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("language", language);

    xhr.open("POST", `${API_URL}/recordings`);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(typeof body?.detail === "string" ? body.detail : `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: could not reach the server."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Please try again."));
    xhr.send(form);
  });
}
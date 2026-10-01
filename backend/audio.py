import subprocess


def probe_duration(path: str) -> float:
    """Return audio duration in seconds, or raise ValueError if the file isn't valid audio."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True, text=True, timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("Checking the file took too long. It may be corrupted.")
    except FileNotFoundError:
        raise RuntimeError("ffprobe is not installed on the server.")

    output = result.stdout.strip()
    if result.returncode != 0 or not output or output == "N/A":
        raise ValueError("This file doesn't look like valid audio.")
    try:
        duration = float(output)
    except ValueError:
        raise ValueError("Could not read the audio duration.")
    if duration <= 0:
        raise ValueError("This audio file is empty.")
    return duration
import os
import sys
import httpx
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GNANI_API_KEY")
if not API_KEY:
    print("ERROR: GNANI_API_KEY not found. Check backend/.env")
    sys.exit(1)
URL = "https://api.vachana.ai/stt/v3"

def transcribe(path, language="en-IN"):
       with open(path, "rb") as f:
           response = httpx.post(
               URL,
               headers={"X-API-Key-ID": API_KEY},
               files={"audio_file": (os.path.basename(path), f)},
               data={"language_code": language, "format": "transcribe"},
               timeout=60,
           )
       print("Status:", response.status_code)
       print(response.text)
       return response
if __name__ == "__main__":
       transcribe(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "en-IN")

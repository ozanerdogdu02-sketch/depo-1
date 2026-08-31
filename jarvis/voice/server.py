#!/usr/bin/env python3
"""Ses servisi — konuşma→metin (faster-whisper) ve metin→konuşma (Piper).

Neden ayrı bir konteyner ve neden Python:
  - Whisper ve Piper'ın olgun, hazır paketleri Python tarafında. Node'dan binary
    derlemek (whisper.cpp için cmake/make) çok daha kırılgan bir yol olurdu.
  - Ayrı konteyner sayesinde ses TAMAMEN opsiyonel: `--profile voice` ile açılır,
    kapalıyken Jarvis'in çekirdeği hiç etkilenmez ve ~2 GB model inmez.

Web çatısı KULLANILMIYOR (Flask/FastAPI yok) — tek uçlu bir servis için standart
kütüphanenin http.server'ı yeterli, bağımlılık yüzeyi küçük kalıyor.

Uçlar:
  GET  /health -> {"stt": bool, "tts": bool, "detay": str}
  POST /stt    -> ham ses baytları (ogg/opus/mp3/wav) -> {"text": "..."}
  POST /tts    -> {"text": "..."} -> ogg/opus baytları
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("VOICE_PORT", "5002"))
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
# Türkçe ZORLANIR. Otomatik dil tespiti kısa sesli mesajlarda sık sık yanılıp
# metni İngilizce sanıyor ve tamamen alakasız bir çıktı üretiyor.
WHISPER_LANG = os.environ.get("WHISPER_LANG", "tr")
PIPER_MODEL = os.environ.get("PIPER_MODEL", "/models/piper/tr_TR-fahrettin-medium.onnx")
MAX_UPLOAD = 25 * 1024 * 1024  # Telegram sesli mesajı bundan çok küçüktür

_whisper = None
_whisper_error = None
_whisper_lock = threading.Lock()


def get_whisper():
    """Modeli TEMBEL yükler: servis anında ayağa kalkar, model ilk istekte iner."""
    global _whisper, _whisper_error
    if _whisper is not None or _whisper_error is not None:
        return _whisper
    with _whisper_lock:
        if _whisper is not None or _whisper_error is not None:
            return _whisper
        try:
            from faster_whisper import WhisperModel
            # int8 = CPU'da belirgin hız kazancı, Türkçe doğruluğunda kayıp ihmal edilebilir.
            _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
            print(f"[ses] whisper '{WHISPER_MODEL}' yüklendi", flush=True)
        except Exception as exc:  # noqa: BLE001
            _whisper_error = str(exc)
            print(f"[ses] whisper yüklenemedi: {exc}", file=sys.stderr, flush=True)
    return _whisper


def tts_ready() -> bool:
    return os.path.exists(PIPER_MODEL)


def transcribe(audio_bytes: bytes) -> str:
    model = get_whisper()
    if model is None:
        raise RuntimeError(f"Whisper hazır değil: {_whisper_error}")
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp.write(audio_bytes)
        path = tmp.name
    try:
        segments, _info = model.transcribe(path, language=WHISPER_LANG, vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        os.unlink(path)


def synthesize(text: str) -> bytes:
    """Piper WAV üretir; Telegram sesli mesajı OGG/Opus ister → ffmpeg ile çevrilir."""
    if not tts_ready():
        raise RuntimeError(f"Piper ses modeli bulunamadı: {PIPER_MODEL}")
    with tempfile.TemporaryDirectory() as tmpdir:
        wav_path = os.path.join(tmpdir, "out.wav")
        ogg_path = os.path.join(tmpdir, "out.ogg")

        piper = subprocess.run(
            ["piper", "--model", PIPER_MODEL, "--output_file", wav_path],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=120,
        )
        if piper.returncode != 0 or not os.path.exists(wav_path):
            raise RuntimeError(f"piper hata verdi: {piper.stderr.decode('utf-8', 'replace')[:300]}")

        ffmpeg = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
             "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", ogg_path],
            capture_output=True,
            timeout=120,
        )
        if ffmpeg.returncode != 0 or not os.path.exists(ogg_path):
            raise RuntimeError(f"ffmpeg hata verdi: {ffmpeg.stderr.decode('utf-8', 'replace')[:300]}")

        with open(ogg_path, "rb") as fh:
            return fh.read()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # noqa: A003
        print(f"[ses] {fmt % args}", flush=True)

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return b""
        if length > MAX_UPLOAD:
            raise ValueError(f"Gövde çok büyük ({length} bayt).")
        return self.rfile.read(length)

    def do_GET(self):  # noqa: N802
        if self.path != "/health":
            self._send_json(404, {"error": "bilinmeyen uç"})
            return
        # Whisper'ı health kontrolünde ZORLA yüklemiyoruz — ilk çağrı 1-2 dakika sürebilir
        # ve doctor'ın orada asılı kalması istenmez. Sadece hata var mı diye bakılır.
        stt_ok = _whisper is not None or _whisper_error is None
        detay = []
        if _whisper_error:
            detay.append(f"whisper: {_whisper_error}")
        if not tts_ready():
            detay.append(f"piper modeli yok: {PIPER_MODEL}")
        self._send_json(200, {
            "stt": stt_ok,
            "tts": tts_ready(),
            "whisper_yuklendi": _whisper is not None,
            "detay": " · ".join(detay) or "hazır",
        })

    def do_POST(self):  # noqa: N802
        try:
            if self.path == "/stt":
                audio = self._read_body()
                if not audio:
                    self._send_json(400, {"error": "ses verisi boş"})
                    return
                self._send_json(200, {"text": transcribe(audio)})
                return

            if self.path == "/tts":
                payload = json.loads(self._read_body() or b"{}")
                text = (payload.get("text") or "").strip()
                if not text:
                    self._send_json(400, {"error": "metin boş"})
                    return
                # Çok uzun metni seslendirmek dakikalar sürer ve kimse dinlemez.
                self._send(200, synthesize(text[:1500]), "audio/ogg")
                return

            self._send_json(404, {"error": "bilinmeyen uç"})
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self._send_json(500, {"error": str(exc)})


if __name__ == "__main__":
    print(f"[ses] http://0.0.0.0:{PORT} · whisper={WHISPER_MODEL} · piper={PIPER_MODEL}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

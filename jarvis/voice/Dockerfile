# Ses servisi — konuşma→metin (faster-whisper) ve metin→konuşma (Piper).
# Yalnızca `docker compose --profile voice` ile ayağa kalkar; kapalıyken indirilmez bile.
FROM python:3.12-slim

# ffmpeg: Piper WAV üretir, Telegram sesli mesajı OGG/Opus ister — dönüşüm için şart.
# curl: Piper ses modelini indirmek için.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir faster-whisper==1.1.0 piper-tts==1.2.0

# Türkçe Piper sesi. İmaja gömülür (~65 MB) — her açılışta yeniden indirmemek için.
# Başka bir ses istersen: https://huggingface.co/rhasspy/piper-voices/tree/main/tr/tr_TR
ARG PIPER_VOICE=tr_TR-fahrettin-medium
ARG PIPER_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/fahrettin/medium
RUN mkdir -p /models/piper \
 && curl -fsSL "${PIPER_BASE}/${PIPER_VOICE}.onnx"      -o "/models/piper/${PIPER_VOICE}.onnx" \
 && curl -fsSL "${PIPER_BASE}/${PIPER_VOICE}.onnx.json" -o "/models/piper/${PIPER_VOICE}.onnx.json"

# Whisper modeli ÇALIŞMA ANINDA iner ve volume'de kalır — imajı ~500 MB şişirmemek için.
ENV HF_HOME=/models/whisper \
    WHISPER_MODEL=small \
    WHISPER_LANG=tr \
    PIPER_MODEL=/models/piper/tr_TR-fahrettin-medium.onnx \
    VOICE_PORT=5002

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=4).status==200 else 1)"

CMD ["python3", "-u", "/app/server.py"]

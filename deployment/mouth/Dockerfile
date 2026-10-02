# Voice-mode mouth behind one HTTP door (server.py): the same Kokoro (English)
# and Piper (Russian) models the whisper pod's speaches serves, with our own
# thread pool. Measurements and the reason it is not inside speaches: server.py.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
# The versions speaches runs (checked in its pod 2026-10-02), so a voice
# sounds the same whichever door spoke it.
RUN pip install --no-cache-dir onnxruntime==1.22.0 kokoro-onnx==0.4.5 \
    piper-tts==1.3.0 huggingface-hub==0.35.3
# The models are baked into the image: a cold start must not wait on Hugging
# Face, and a redeploy must not fetch them again.
ENV HF_HOME=/models
RUN python -c "from huggingface_hub import snapshot_download as d; \
[d(r) for r in ['speaches-ai/Kokoro-82M-v1.0-ONNX'] + \
 ['speaches-ai/piper-ru_RU-%s-medium' % v for v in ('irina', 'dmitri', 'denis', 'ruslan')]]"
WORKDIR /app
COPY server.py /app/server.py
ENV PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=4
EXPOSE 8080
CMD ["python", "/app/server.py"]

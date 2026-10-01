# Russian ears for voice mode: GigaAM v3 behind one HTTP door (server.py).
# Measurements and the reason it is not inside the whisper pod: server.py.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "onnx-asr[cpu,hub]==0.12.0"
# The model is baked into the image: a cold start must not wait on Hugging
# Face, and a redeploy must not fetch ~1 GB again.
ENV HF_HOME=/models
RUN python -c "import onnx_asr; onnx_asr.load_model('gigaam-v3-e2e-ctc')"
WORKDIR /app
COPY server.py /app/server.py
ENV PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=4
EXPOSE 8080
CMD ["python", "/app/server.py"]

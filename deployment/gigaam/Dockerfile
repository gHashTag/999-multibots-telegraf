# Voice-mode ears behind one HTTP door (server.py). One image, two services:
#   gigaam    Russian, GigaAM v3 (the defaults below)
#   parakeet  English, GIGAAM_MODEL=nemo-parakeet-tdt-0.6b-v2 GIGAAM_QUANT=int8
# Railway hands a service's variables to the build as these ARGs, so the
# model a service bakes is the one it later loads.
# Measurements and the reason they are not inside the whisper pod: server.py.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "onnx-asr[cpu,hub]==0.12.0"
ARG GIGAAM_MODEL=gigaam-v3-e2e-ctc
ARG GIGAAM_QUANT=
# The model is baked into the image: a cold start must not wait on Hugging
# Face, and a redeploy must not fetch it again.
ENV HF_HOME=/models GIGAAM_MODEL=$GIGAAM_MODEL GIGAAM_QUANT=$GIGAAM_QUANT
RUN python -c "import os, onnx_asr; onnx_asr.load_model(os.environ['GIGAAM_MODEL'], quantization=os.environ['GIGAAM_QUANT'] or None)"
WORKDIR /app
COPY server.py /app/server.py
ENV PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=4
EXPOSE 8080
CMD ["python", "/app/server.py"]

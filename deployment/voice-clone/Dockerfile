# A person's own voice from a sample of it (server.py): Qwen3-TTS Base on
# CPU. Why our own service and why this model: server.py.
# The base is pinned by digest (python:3.11-slim, index digest of 2026-10-02):
# a tag moves, and a rebuild must not quietly change the system under torch.
FROM python:3.11-slim@sha256:bab1b7ef4b450c81002278d035eff85ebe394ae94df904f7a3ba14f7e16e487b
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg sox \
    && rm -rf /var/lib/apt/lists/*
# CPU torch first, from the CPU index: the default index would pull ~2 GB of
# CUDA libraries this pod never uses. qwen-tts does not pin torch.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    torch==2.8.0 torchaudio==2.8.0
# qwen-tts without its declared deps: they include gradio (its demo UI, which
# this pod never runs). The rest are installed here, pinned; transformers and
# accelerate at the exact versions qwen-tts 0.1.1 requires.
RUN pip install --no-cache-dir \
    transformers==4.57.3 accelerate==1.12.0 huggingface_hub==0.36.0 \
    librosa==0.11.0 soundfile==0.13.1 sox==1.5.0 onnxruntime==1.23.2 \
    einops==0.8.1 \
    && pip install --no-cache-dir --no-deps qwen-tts==0.1.1
# The weights are baked into the image at the revision pinned in server.py
# (MODELS, the one place it lives), and loading them here proves the model
# starts on CPU before a deploy is ever cut over to it. VOICE_CLONE_MODEL is
# a build argument as well as a run-time variable: Railway passes the
# service's variable to both, so the baked weights are the ones served.
ARG VOICE_CLONE_MODEL=1.7B
ENV HF_HOME=/models VOICE_CLONE_MODEL=${VOICE_CLONE_MODEL}
WORKDIR /app
COPY server.py /app/server.py
RUN python /app/server.py --fetch
ENV PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1
EXPOSE 8080
CMD ["python", "/app/server.py"]

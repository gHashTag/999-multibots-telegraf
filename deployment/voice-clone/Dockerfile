# A person's own voice from a sample of it (server.py): Chatterbox
# Multilingual on CPU. Why our own service and not a provider: server.py.
# The base is pinned by digest (python:3.11-slim, index digest of 2026-10-02):
# a tag moves, and a rebuild must not quietly change the system under torch.
FROM python:3.11-slim@sha256:bab1b7ef4b450c81002278d035eff85ebe394ae94df904f7a3ba14f7e16e487b
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git \
    && rm -rf /var/lib/apt/lists/*
# CPU torch first, from the CPU index: chatterbox pins torch 2.6.0, and the
# default index would pull ~2 GB of CUDA libraries this pod never uses.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    torch==2.6.0 torchaudio==2.6.0
RUN pip install --no-cache-dir chatterbox-tts==0.1.7
# The weights are baked into the image at the revision pinned in server.py
# (MODEL_REVISION, the one place it lives), and loading them here proves the
# model starts on CPU before a deploy is ever cut over to it. The price of one
# home for the revision: an edit to server.py re-downloads the weights.
ENV HF_HOME=/models
WORKDIR /app
COPY server.py /app/server.py
RUN python /app/server.py --fetch
ENV PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1
EXPOSE 8080
CMD ["python", "/app/server.py"]

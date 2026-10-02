# A person's own voice from a sample of it (server.py): Chatterbox
# Multilingual on CPU. Why our own service and not a provider: server.py.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git \
    && rm -rf /var/lib/apt/lists/*
# CPU torch first, from the CPU index: chatterbox pins torch 2.6.0, and the
# default index would pull ~2 GB of CUDA libraries this pod never uses.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    torch==2.6.0 torchaudio==2.6.0
RUN pip install --no-cache-dir chatterbox-tts==0.1.7
# The weights are baked into the image, and loading them here proves the
# model starts on CPU before a deploy is ever cut over to it.
ENV HF_HOME=/models
RUN python -c "from chatterbox.mtl_tts import ChatterboxMultilingualTTS as M; M.from_pretrained(device='cpu')"
WORKDIR /app
COPY server.py /app/server.py
ENV PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1
EXPOSE 8080
CMD ["python", "/app/server.py"]

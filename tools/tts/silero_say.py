#!/usr/bin/env python3
"""Silero TTS (русский, CPU) — замена молчащему ElevenLabs для локальных задач.

Зачем: ElevenLabs отвечает 400 (ключ ждёт перевыпуска, OWNER-DECISIONS §6),
а синтез нужен уже сейчас. Silero v4_ru работает на CPU без ключей и сети
(после первой загрузки модель кэшируется в ~/.cache/torch/hub).

Использование:
    ./.venv/bin/python silero_say.py "Текст по-русски" out.wav [speaker]

Голоса v4_ru: aidar (м), baya (ж), kseniya (ж), xenia (ж), eugene (м).
Частота 48 кГц. Ударения можно ставить знаком + перед гласной: "зам+ок".
"""
import sys
import torch
import soundfile as sf

def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    text, out = sys.argv[1], sys.argv[2]
    speaker = sys.argv[3] if len(sys.argv) > 3 else "baya"

    model, _ = torch.hub.load(
        repo_or_dir="snakers4/silero-models",
        model="silero_tts",
        language="ru",
        speaker="v4_ru",
        trust_repo=True,
    )
    model.to(torch.device("cpu"))

    audio = model.apply_tts(text=text, speaker=speaker, sample_rate=48000)
    sf.write(out, audio.numpy(), 48000)
    print(f"OK {out} ({len(audio) / 48000:.2f}s, speaker={speaker})")

if __name__ == "__main__":
    main()

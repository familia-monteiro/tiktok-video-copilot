"""
Worker Python — TikTok Video Copilot
Responsável por separação vocal com Demucs htdemucs_ft + FFmpeg.
Referência: Seção 9 do Master Plan v3.0
"""

import os
import uuid
import tempfile
import subprocess
import logging
import httpx
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Variáveis de ambiente
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BACKEND_URL = os.environ["RAILWAY_WORKER_URL"]  # URL do backend Next.js
WORKER_SECRET = os.environ["RAILWAY_WORKER_SECRET"]

# ---------------------------------------------------------------------------
# Clientes globais
# ---------------------------------------------------------------------------
supabase: Client = None  # type: ignore

@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("Worker inicializado. Supabase conectado.")
    yield
    logger.info("Worker encerrando.")

app = FastAPI(title="TikTok Video Copilot Worker", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Schema de requisição
# ---------------------------------------------------------------------------
class ProcessRequest(BaseModel):
    video_id: str
    storage_path: str  # Ex: "videos/{influencer_id}/{video_id}.mp4"

# ---------------------------------------------------------------------------
# Endpoint de saúde
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# Endpoint principal: processa separação vocal
# ---------------------------------------------------------------------------
@app.post("/process")
async def process_video(
    req: ProcessRequest,
    x_worker_secret: str = Header(...),
):
    """
    Pipeline completo conforme Seção 9 do Master Plan:
    1. Receber video_id e storage_path
    2. Baixar .mp4 do Supabase Storage
    3. FFmpeg extrai áudio WAV mono 16kHz
    4. Demucs htdemucs_ft separa vocais
    5. FFmpeg converte vocals.wav para MP3 64kbps
    6. Upload MP3 para Storage em audios/{influencer_id}/{video_id}.mp3
    7. Deletar .mp4 do Storage
    8. Cleanup de todos os arquivos locais
    9. Callback POST para /api/internal/audio-complete no backend
    """
    if x_worker_secret != WORKER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    video_id = req.video_id
    storage_path = req.storage_path

    # Extrair influencer_id do storage_path: "videos/{influencer_id}/{video_id}.mp4"
    parts = storage_path.split("/")
    if len(parts) < 3:
        raise HTTPException(status_code=400, detail="storage_path inválido")
    influencer_id = parts[1]
    audio_storage_path = f"audios/{influencer_id}/{video_id}.mp3"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        mp4_path = tmp / f"{video_id}.mp4"
        wav_path = tmp / f"{video_id}.wav"
        mp3_path = tmp / f"{video_id}.mp3"

        # ------------------------------------------------------------------
        # 1. Baixar .mp4 do Supabase Storage
        # ------------------------------------------------------------------
        logger.info(f"[{video_id}] Baixando vídeo do Storage: {storage_path}")
        try:
            response = supabase.storage.from_("videos").download(
                f"{influencer_id}/{video_id}.mp4"
            )
            mp4_path.write_bytes(response)
        except Exception as e:
            logger.error(f"[{video_id}] Falha ao baixar vídeo: {e}")
            await _callback(video_id, success=False, error=str(e))
            raise HTTPException(status_code=500, detail=f"Falha ao baixar vídeo: {e}")

        # ------------------------------------------------------------------
        # 2. FFmpeg extrai canal de áudio em WAV mono 16kHz
        # ------------------------------------------------------------------
        logger.info(f"[{video_id}] Extraindo áudio com FFmpeg")
        ffmpeg_extract = [
            "ffmpeg", "-y",
            "-i", str(mp4_path),
            "-ac", "1",           # Mono
            "-ar", "16000",       # 16kHz — otimizado para modelos de voz
            "-vn",                # Sem vídeo
            str(wav_path),
        ]
        result = subprocess.run(ffmpeg_extract, capture_output=True, text=True)
        if result.returncode != 0:
            error = f"FFmpeg falhou: {result.stderr}"
            logger.error(f"[{video_id}] {error}")
            await _callback(video_id, success=False, error=error)
            raise HTTPException(status_code=500, detail=error)

        # ------------------------------------------------------------------
        # 3. Demucs htdemucs_ft — separação vocal
        # ------------------------------------------------------------------
        logger.info(f"[{video_id}] Executando Demucs htdemucs_ft")
        demucs_out = tmp / "demucs_output"
        demucs_out.mkdir()
        demucs_cmd = [
            "python", "-m", "demucs",
            "--name", "htdemucs_ft",
            "--two-stems", "vocals",   # Produz apenas vocals e no_vocals
            "--out", str(demucs_out),
            str(wav_path),
        ]
        result = subprocess.run(demucs_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            error = f"Demucs falhou: {result.stderr}"
            logger.error(f"[{video_id}] {error}")
            await _callback(video_id, success=False, error=error)
            raise HTTPException(status_code=500, detail=error)

        # Localizar vocals.wav gerado pelo Demucs
        # Estrutura: demucs_output/htdemucs_ft/{nome_arquivo}/vocals.wav
        stem_name = wav_path.stem
        vocals_wav = demucs_out / "htdemucs_ft" / stem_name / "vocals.wav"
        no_vocals_wav = demucs_out / "htdemucs_ft" / stem_name / "no_vocals.wav"

        if not vocals_wav.exists():
            error = f"vocals.wav não encontrado em {demucs_out}"
            logger.error(f"[{video_id}] {error}")
            await _callback(video_id, success=False, error=error)
            raise HTTPException(status_code=500, detail=error)

        # Deletar no_vocals.wav imediatamente — nunca é usado (Seção 9)
        if no_vocals_wav.exists():
            no_vocals_wav.unlink()

        # ------------------------------------------------------------------
        # 4. FFmpeg converte vocals.wav para MP3 64kbps
        # ------------------------------------------------------------------
        logger.info(f"[{video_id}] Convertendo vocals para MP3 64kbps")
        ffmpeg_mp3 = [
            "ffmpeg", "-y",
            "-i", str(vocals_wav),
            "-b:a", "64k",
            str(mp3_path),
        ]
        result = subprocess.run(ffmpeg_mp3, capture_output=True, text=True)
        if result.returncode != 0:
            error = f"FFmpeg MP3 falhou: {result.stderr}"
            logger.error(f"[{video_id}] {error}")
            await _callback(video_id, success=False, error=error)
            raise HTTPException(status_code=500, detail=error)

        # ------------------------------------------------------------------
        # 5. Upload do MP3 para Supabase Storage
        # ------------------------------------------------------------------
        logger.info(f"[{video_id}] Fazendo upload do MP3 para Storage: {audio_storage_path}")
        mp3_bytes = mp3_path.read_bytes()
        try:
            supabase.storage.from_("audios").upload(
                path=f"{influencer_id}/{video_id}.mp3",
                file=mp3_bytes,
                file_options={"content-type": "audio/mpeg", "upsert": "true"},
            )
        except Exception as e:
            error = f"Falha ao fazer upload do MP3: {e}"
            logger.error(f"[{video_id}] {error}")
            await _callback(video_id, success=False, error=error)
            raise HTTPException(status_code=500, detail=error)

        # ------------------------------------------------------------------
        # 6. Deletar .mp4 do Storage — não é mais necessário (Seção 9)
        # ------------------------------------------------------------------
        logger.info(f"[{video_id}] Deletando .mp4 do Storage")
        try:
            supabase.storage.from_("videos").remove([f"{influencer_id}/{video_id}.mp4"])
        except Exception as e:
            logger.warning(f"[{video_id}] Falha ao deletar .mp4 do Storage (não crítico): {e}")

        # tmpdir é limpo automaticamente ao sair do bloco with

    # ------------------------------------------------------------------
    # 7. Callback para o backend Next.js
    # ------------------------------------------------------------------
    logger.info(f"[{video_id}] Processamento concluído. Enviando callback.")
    await _callback(video_id, success=True, audio_storage_path=audio_storage_path)

    return {"status": "ok", "video_id": video_id, "audio_path": audio_storage_path}


async def _callback(
    video_id: str,
    success: bool,
    audio_storage_path: str = "",
    error: str = "",
) -> None:
    """
    Chama POST /api/internal/audio-complete no backend Next.js.
    Referência: Seção 9 do Master Plan.
    """
    url = f"{BACKEND_URL}/api/internal/audio-complete"
    payload = {
        "video_id": video_id,
        "success": success,
        "audio_storage_path": audio_storage_path,
        "error": error,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"x-worker-secret": WORKER_SECRET},
            )
            resp.raise_for_status()
            logger.info(f"[{video_id}] Callback enviado com sucesso: {resp.status_code}")
    except Exception as e:
        logger.error(f"[{video_id}] Falha ao enviar callback: {e}")

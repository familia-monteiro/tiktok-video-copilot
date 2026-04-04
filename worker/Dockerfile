FROM python:3.11-slim

# Instalar dependências do sistema (FFmpeg obrigatório)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar PyTorch CPU antes do Demucs (evita baixar versão CUDA)
RUN pip install --no-cache-dir \
    torch==2.4.1+cpu \
    torchaudio==2.4.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Pré-baixar o modelo Demucs htdemucs_ft durante o build
# Isso evita download na primeira requisição (melhora cold start)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-carregar o modelo para incluir no cache da imagem
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs_ft')"

COPY main.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

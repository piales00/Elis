FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app
COPY requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home app

COPY api/ ./api/
COPY data/processed/ ./data/processed/

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/health', timeout=4)"
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]

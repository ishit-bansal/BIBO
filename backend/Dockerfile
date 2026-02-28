FROM python:3.12-slim

WORKDIR /app/backend

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

COPY historical_avengers_data.csv /app/historical_avengers_data.csv
COPY field_intel_reports.json /app/field_intel_reports.json

EXPOSE 8000

CMD ["sh", "-c", "python wait_for_db.py && python -m db.seed && uvicorn main:app --host 0.0.0.0 --port 8000"]

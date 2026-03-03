# ── Stage 1: Build the React frontend ──────────────────
FROM node:22-slim AS frontend-build

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# In production the frontend talks to the same origin (no separate API URL)
ENV VITE_API_URL=""
RUN npm run build


# ── Stage 2: Python backend + static frontend ─────────
FROM python:3.12-slim

WORKDIR /app/backend

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Data files needed by the backend
COPY historical_avengers_data.csv /app/historical_avengers_data.csv
COPY field_intel_reports.json /app/field_intel_reports.json
COPY supply_chain_shipments.csv /app/supply_chain_shipments.csv

# Copy the built frontend into backend/static/
COPY --from=frontend-build /build/dist ./static

EXPOSE 8000

CMD ["sh", "-c", "python wait_for_db.py && python -m db.seed && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

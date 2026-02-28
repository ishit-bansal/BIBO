# Project Sentinel - Command & Control Dashboard

A full-stack crisis management system that ingests historical resource data, processes unstructured field intelligence using AI, predicts resource depletion via ML, and enforces PII redaction as a security middleware.

## Architecture

```
Frontend (React + Vite)  ──HTTP/JSON──>  Backend (FastAPI)  ──>  PostgreSQL
                                              │
                                              ├── PII Redaction Middleware
                                              ├── Gemini LLM Integration
                                              └── ML Forecasting (scikit-learn)
```

The backend is a **standalone REST API** with auto-generated Swagger docs at `/docs`. Any frontend can plug into it.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 20+ (use `nvm use 22` if available)
- PostgreSQL running locally

### 1. Database Setup
```bash
createdb sentinel
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt

# Edit .env with your database credentials and Gemini API key
# DATABASE_URL=postgresql://youruser@localhost:5432/sentinel
# GEMINI_API_KEY=your-key-here

# Seed the database
python db/seed.py

# Start the server
python -m uvicorn main:app --reload --port 8000
```

Backend API docs available at: **http://localhost:8000/docs**

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Dashboard available at: **http://localhost:5173**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/resources` | Historical resource data (filterable) |
| GET | `/api/resources/sectors` | List all sectors |
| GET | `/api/resources/types` | List all resource types |
| GET | `/api/resources/latest` | Current stock per sector/resource |
| POST | `/api/resources/upload` | Upload new CSV data |
| GET | `/api/reports` | All intelligence reports |
| POST | `/api/reports` | Submit and process a new report |
| POST | `/api/reports/batch` | Batch process all unprocessed reports |
| GET | `/api/reports/{id}/redaction-log` | PII redaction audit trail |
| GET | `/api/predictions` | ML predictions for all combos |
| GET | `/api/predictions/{sector}/{resource}` | Prediction for specific combo |
| POST | `/api/test/redact` | Test PII redaction |
| POST | `/api/test/llm` | Test full redact+LLM pipeline |

## Key Features

1. **Interactive Dashboard** - Time-series charts, sector status heatmap, KPI stat cards
2. **PII Redaction Middleware** - Strips hero names and contact numbers before any external AI processing, with full audit logging
3. **LLM Entity Extraction** - Processes unstructured field reports into structured intelligence (location, resource, status, urgency)
4. **ML Forecasting** - Linear regression on post-snap data predicts resource exhaustion dates with confidence scores
5. **Data Upload** - CSV upload endpoint for adding new resource data
6. **Snap Anomaly Handling** - ML model uses only post-snap data to avoid the Thanos Snap event skewing predictions

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Recharts, Tailwind CSS
- **Backend**: Python, FastAPI, SQLAlchemy, Pydantic
- **Database**: PostgreSQL
- **AI/ML**: Google Gemini (LLM), scikit-learn (Linear Regression)
- **Security**: Regex-based PII redaction with audit logging

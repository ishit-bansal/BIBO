# BIBO — Command & Control Dashboard

A full-stack real-time crisis management system that combines interactive data visualization, live WebSocket simulation, AI-powered intelligence processing, ML-based resource forecasting, face-recognition authentication, and supply chain logistics — all wrapped in a custom pixel-art UI themed around the Avengers Initiative.

**[Live Site](https://bibo.ishitbansal.com/)**

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Screenshots & Tabs](#screenshots--tabs)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Option 1: Docker Compose (Recommended)](#option-1-docker-compose-recommended)
  - [Option 2: Local Development](#option-2-local-development)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Datasets](#datasets)
- [Resume Descriptions](#resume-descriptions)

---

## Overview

BIBO (Project Sentinel) is a centralized Command & Control (C2) dashboard built to manage global resource distribution during a simulated multi-sector crisis. The system ingests 10,000+ historical time-series resource observations, 200 unstructured field intelligence reports, and 78 supply chain shipment records across 5 global sectors (Wakanda, New Asgard, Sokovia, Sanctum Sanctorum, Avengers Compound).

The backend replays historical data through a real-time WebSocket simulator (2-second ticks), runs PII redaction before sending reports to Google Gemini for entity extraction, and uses linear regression to forecast resource depletion timelines. The frontend renders everything through a custom pixel-art retro UI with interactive Leaflet maps, Recharts visualizations, and a face-api.js-powered biometric login.

---

## Features

### Real-Time Live Simulation

- WebSocket-driven replay of 10,000 CSV records at 2-second intervals
- Live ticker with per-resource sparklines, hourly change rates, rolling 6h/24h usage comparisons, and trend indicators
- Simulator controls: seek to any tick or timestamp, restart from any point
- Snap event broadcast — triggers a visual snap animation (Bo mascot walks to center, snaps, white flash, siren) and halves data in the analysis view
- `sim_complete` event auto-restarts the timeline after a 3-second delay

### Dashboard & Visualization

- **Stat Cards**: 6 real-time KPIs — sim time, total stock, average usage rate, rising/declining resource counts, below-24h-average alerts
- **Sector Heatmap**: Per sector-resource grid with stock bars (0–3000 scale), 6h/24h usage markers, hourly change, and trend arrows
- **Resource Charts**: AreaChart with raw stock levels, 24h moving average overlay, and ML forecast extension
- **ML Prediction Badges**: Depletion status, predicted exhaustion date, depletion rate, and confidence score per resource
- **Time Range Filters**: 6h, 1d, 3d, 1w, 2w, All — applied across ticker and charts

### Operations — Tactical Hero Map

- Interactive Leaflet map with CARTO tiles rendering all 5 sectors
- Sector markers with threat-level color coding (stable/medium/high/critical) and emoji identifiers
- Individual hero markers with avatar sprites and status-colored borders
- Hero popups: health/energy/shield vitals, current mission, duration, comms status, recent activity
- Sector popups: threat level, weather conditions, average health, active events
- **Hero Detail Panel**: Click any hero for a summary bar and full mission history modal
- **Mission History Modal**: Tabulated history with date, sector, type, duration, outcome, threat level, lives saved, and aggregate totals
- **Event Feed**: Sidebar listing active events sorted by severity with fly-to-coordinates interaction
- Time-travel: Sectors and heroes update based on simulation time, filtering mission history and computing dynamic health/status

### Operations — Supply Chain Map

- Interactive map rendering factory locations with custom icons (vibranium mine, Stark factory, hospital depot, Nidavellir forge)
- Animated **Bezier curve shipment arcs** with solid (completed) and dashed (remaining) segments, plus a moving dot showing transit progress
- Factory popups: resource stock bars, production rate, fill percentage, warning/critical thresholds
- Sidebar with shipment filtering (in-transit, pending, all), progress bars, ETA countdown
- Factory stock panel computing real-time inventory based on production rate, hours elapsed since epoch, and shipped quantities
- Shipment state machine: `pending` → `in_transit` → `delivered` with computed `progress_pct` and `eta_hours`

### Intelligence Processing

- Batch-processes 200 unstructured field reports through a 3-stage pipeline:
  1. **PII Redaction**: Regex-based stripping of hero names (longest-first matching) and phone patterns (`555-XXX`) → replaced with `[REDACTED_NAME]` / `[REDACTED_CONTACT]`, with full audit log
  2. **LLM Entity Extraction**: Sends redacted text to Google Gemini 2.5 Flash in batches of 20, extracting structured fields: `location`, `resource_mentioned`, `status`, `action_required`, `urgency`
  3. **Database Persistence**: Stores original text, redacted text, structured JSON, and processing state
- **Redaction Audit Modal**: Side-by-side original vs. redacted text with highlighted replacements, pipeline flow visualization, and proof stamp
- Priority filtering (Routine / High / Avengers Level Threat)
- Fallback rule-based extraction when LLM is unavailable (keyword matching for locations, resources, status, urgency)
- Reset endpoint to re-seed reports as unprocessed

### Data Lab — CSV Analysis & AI Chat

- Drag-and-drop or file picker CSV upload
- 4-stage analysis pipeline: Parse CSV → Compute Moving Averages → Model Trends → Generate Forecasts
- Per-resource analysis:
  - 24-point moving average smoothing
  - Linear regression over full post-snap period and last 72 hours
  - AR(1)-style 168-hour (7-day) forecast with noise modeling (residual std, autocorrelation 0.85)
  - Risk score (0–100) derived from hours-to-zero and remaining stock percentage
  - Crash-recovery detection: stock drops below 15% of initial then recovers > 50 units
  - Weekly day-by-day forecast
  - Trend acceleration: compares recent slope vs. overall slope
- **Risk Gauge**: Visual 0–100 gauge per resource with GUARDED / ELEVATED / CRITICAL labels
- **ComposedChart**: Raw data, 24h MA, and forecast on one chart with configurable time ranges
- **Demo Mode**: One-click load of the built-in Avengers historical dataset
- **AI Chatbot** (Bo): Powered by Gemini 2.5 Flash with full CSV context injection
  - Detects resource focus from user message using alias matching
  - Builds context with stats, sampled data points, weekly forecasts, trend labels, fit quality from R²
  - Maintains 6-message conversation history
  - Retry with 3-second backoff on rate limits (429 / RESOURCE_EXHAUSTED)

### Biometric Face Authentication

- **face-api.js** integration with TinyFaceDetector, 68-point facial landmark, and face recognition models
- First-time bootstrap: auto-enrolls the first user as admin with camera capture
- CAPTCHA gate before face scan (custom canvas-rendered 6-character code)
- Face matching with configurable threshold (Euclidean distance < 0.5)
- Role-based access: `admin` sees all tabs including Personnel; `user` sees everything except Personnel
- Admin-only face enrollment and removal via Personnel tab
- Face descriptors stored as 128-dimensional vectors in `faces.json` on the server and `sessionStorage` on the client

### Bo — Animated Mascot

- Multi-phase sprite animation: idle → walk-to-center → snapping → flash → siren → returning
- 3 sprite sheets: idle, snap, wave (hover state)
- Pixel-art canvas rendering with `imageSmoothingEnabled = false`
- Siren emergency overlay with red flash animation
- Dust particle effect during snap
- Click interaction: toggles AI chatbot panel

### Custom Pixel-Art UI

- Fully custom retro/pixel-art aesthetic using sprite-based 9-slice CSS borders
- Custom pixel cursor
- Tiled background
- Handjet font family (Regular, Medium, Bold)
- Themed panels for each tab: resource HUD, tactical map, supply chain, field reports, intel grid
- Background ambient sound (looped, low volume, starts on first interaction)
- Animations: siren flash, bounce, shake

---

## Architecture

```
┌──────────────────────────┐         ┌──────────────────────────────────┐
│   Frontend (React+Vite)  │◄──HTTP──►  Backend (FastAPI + Uvicorn)    │
│                          │         │                                  │
│  - Recharts              │◄──WS───►  - Real-time CSV Simulator       │
│  - Leaflet Maps          │         │  - PII Redaction Middleware      │
│  - face-api.js           │         │  - Gemini 2.5 Flash (LLM)       │
│  - Tailwind CSS          │         │  - scikit-learn (ML Forecasting) │
│  - Pixel-Art Sprites     │         │  - SQLAlchemy ORM                │
└──────────────────────────┘         └───────────────┬──────────────────┘
                                                     │
                                              ┌──────▼──────┐
                                              │ PostgreSQL 16│
                                              └─────────────┘
```

The backend serves as a **standalone REST + WebSocket API** with auto-generated Swagger docs at `/docs`. The frontend can be replaced independently. In production, the multi-stage Dockerfile builds the React app and serves it as static files from the FastAPI backend on a single port.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Recharts, Leaflet + react-leaflet, face-api.js, Axios |
| **Backend** | Python 3.12, FastAPI, Uvicorn, SQLAlchemy, Pydantic, pandas |
| **Database** | PostgreSQL 16 |
| **AI / ML** | Google Gemini 2.5 Flash (entity extraction + chat), scikit-learn (Linear Regression forecasting) |
| **Security** | Regex-based PII redaction with audit logging, face-recognition authentication, role-based access control |
| **Infrastructure** | Docker, Docker Compose, multi-stage builds, WebSocket live feed |

---

## Screenshots & Tabs

| Tab | Description |
|-----|-------------|
| **Resources** (Dashboard) | Live ticker with sparklines, stat cards, sector heatmap — all updating in real-time via WebSocket |
| **Operations** | Split view: Hero tactical map (Leaflet) + Supply chain logistics map with animated shipment arcs |
| **Intelligence** | Intel reports table with batch PII redaction, LLM processing, audit modals, and priority filtering |
| **Data Lab** | CSV upload/analysis with risk gauges, forecasts, charts, and AI chatbot |
| **Personnel** | Admin-only face enrollment and user management |

---

## Getting Started

### Prerequisites

- **Docker & Docker Compose** (for containerized setup), OR
- **Python 3.10+**, **Node.js 20+**, and a running **PostgreSQL** instance (for local setup)
- A **Google Gemini API Key** (for AI features — free tier works). Get one at [aistudio.google.com](https://aistudio.google.com/)

### Option 1: Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/BIBO.git
cd BIBO

# 2. Create .env from the example
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 3. Start everything (PostgreSQL + Backend + Frontend)
docker compose up --build

# 4. Open the app
#    Frontend: http://localhost:5173
#    Backend API docs: http://localhost:8000/docs
```

This spins up three containers:
- **db**: PostgreSQL 16 Alpine with health checks
- **backend**: FastAPI server (waits for DB, seeds data, starts Uvicorn on port 8000)
- **frontend**: Vite dev server on port 5173

### Option 2: Local Development

**1. Database**

```bash
# Create a PostgreSQL database
createdb sentinel
```

**2. Backend**

```bash
cd backend
pip install -r requirements.txt

# Create a .env file in the project root
# DATABASE_URL=postgresql://youruser@localhost:5432/sentinel
# GEMINI_API_KEY=your-key-here

# Seed the database with historical data
python -m db.seed

# Start the API server
python -m uvicorn main:app --reload --port 8000
```

The backend seeds:
- 10,000 resource log records from `historical_avengers_data.csv`
- 200 intel reports from `field_intel_reports.json`

API docs: **http://localhost:8000/docs**

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

Dashboard: **http://localhost:5173**

### Production Build (Single Container)

```bash
# Builds frontend, copies into backend static dir, serves everything on one port
docker build -t bibo .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/sentinel \
  -e GEMINI_API_KEY=your-key \
  bibo
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (default in Docker: `postgresql://sentinel:sentinel@db:5432/sentinel`) |
| `GEMINI_API_KEY` | For AI features | Google Gemini API key for entity extraction and chatbot |

---

## API Reference

### Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resources` | Historical resource data with filters (sector, type, date range, snap_only, limit, offset) |
| GET | `/api/resources/sectors` | List all sector IDs |
| GET | `/api/resources/types` | List all resource types |
| GET | `/api/resources/latest` | Current stock level per sector/resource |
| GET | `/api/resources/timeline` | Full timeline with per-tick analytics (avg stock, usage, trends) |
| POST | `/api/resources/upload` | Upload new CSV data (validates columns, parses timestamps, bulk inserts) |
| POST | `/api/resources/analyze` | Analyze uploaded CSV — returns MA, regression, forecast, risk scores |
| GET | `/api/resources/analyze-demo` | Analyze the built-in demo CSV |
| GET | `/api/resources/demo-csv` | Download the demo CSV file |

### Intelligence Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports` | List reports (filter: processed, priority, limit, offset) |
| GET | `/api/reports/{report_id}` | Single report by ID |
| POST | `/api/reports` | Submit and process one report (redact → LLM → store) |
| POST | `/api/reports/batch` | Batch-process all unprocessed reports (chunks of 20, parallel async LLM) |
| POST | `/api/reports/reset` | Re-seed reports from JSON as unprocessed |
| GET | `/api/reports/{report_id}/redaction-log` | PII redaction audit trail (original vs. redacted, log entries) |

### ML Predictions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/predictions` | Depletion forecasts for all sector/resource combinations |
| GET | `/api/predictions/{sector}/{resource_type}` | Single prediction (current stock, rate, hours to zero, confidence, status) |
| GET | `/api/predictions/{sector}/{resource_type}/trend` | Trend line data (MA series + forecast extension) |

### Heroes & Sectors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/heroes` | Hero roster with optional time-travel (filters mission history, computes dynamic status/health) |
| GET | `/api/heroes/events` | Active sector events (dimensional rifts, incursions, breaches, etc.) |
| GET | `/api/heroes/sectors` | Sector summaries (hero count, avg health, weather, threat level, events) |

### Supply Chain

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/supply/shipments` | Shipment states at given time (pending/in_transit/delivered, progress, ETA) |
| GET | `/api/supply/factories` | Factory states (stock from production rate - shipped, fill %, warnings) |
| GET | `/api/supply/overview` | Combined: factories + shipments + warnings |

### Simulation Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| WebSocket | `/ws/live` | Live simulation feed (resource ticks with analytics every 2s) |
| GET | `/api/sim/status` | Current tick index, total ticks, timestamps, interval |
| POST | `/api/sim/seek` | Jump to specific tick or timestamp |
| POST | `/api/sim/restart` | Restart simulation from beginning |
| POST | `/api/sim/snap` | Broadcast snap event to all WebSocket clients |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/faces` | List all enrolled faces |
| POST | `/api/auth/faces` | Enroll a new face (admin-only after first enrollment) |
| DELETE | `/api/auth/faces/{face_id}` | Remove enrolled face (admin-only) |

### AI Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message with CSV context, returns AI analysis (Gemini 2.5 Flash) |

### Testing & Utilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/test/redact` | Test PII redaction on arbitrary text |
| POST | `/api/test/llm` | Test full redact + LLM extraction pipeline |
| GET | `/` | Health check (`{"status": "online", "project": "bibo"}`) |

---

## Project Structure

```
BIBO/
├── docker-compose.yml                  # 3-service compose (db + backend + frontend)
├── Dockerfile                          # Multi-stage production build
├── .env.example                        # Environment variable template
├── historical_avengers_data.csv        # 10,000 time-series resource observations
├── field_intel_reports.json            # 200 unstructured intelligence reports
├── supply_chain_shipments.csv          # 78 supply chain shipment records
│
├── backend/
│   ├── main.py                         # FastAPI app: CORS, routers, SPA serving, lifespan
│   ├── requirements.txt                # Python dependencies
│   ├── wait_for_db.py                  # Docker startup: polls DB readiness (30 retries)
│   ├── Dockerfile                      # Dev backend image
│   ├── db/
│   │   ├── database.py                 # SQLAlchemy engine, session, Base
│   │   ├── models.py                   # ResourceLog, IntelReport ORM models
│   │   └── seed.py                     # CSV + JSON → PostgreSQL seeder
│   ├── routes/
│   │   ├── resources.py                # Resource CRUD, timeline, upload, analyze (MA, regression, AR(1) forecast)
│   │   ├── reports.py                  # Intel reports: submit, batch process, reset, redaction audit
│   │   ├── predictions.py              # ML depletion predictions, trend lines
│   │   ├── heroes.py                   # Hero roster, events, sector summaries with time-travel
│   │   ├── supply.py                   # Factory states, shipment tracking, supply overview
│   │   ├── auth.py                     # Face enrollment/removal with role enforcement
│   │   ├── chat.py                     # AI chat with CSV context injection, Gemini integration
│   │   ├── ws.py                       # WebSocket live feed, sim control (seek, restart, snap)
│   │   └── test_utils.py              # PII redaction and LLM pipeline testing endpoints
│   ├── services/
│   │   ├── simulator.py                # Real-time CSV replay engine (2s ticks, analytics, queues)
│   │   ├── llm_service.py              # Gemini 2.5 Flash: single + batch extraction, fallback rules
│   │   ├── ml_service.py               # Post-snap linear regression, MA, depletion forecasting
│   │   └── pii_redaction.py            # Hero name + phone number redaction with audit logs
│   ├── schemas/
│   │   └── schemas.py                  # Pydantic request/response models
│   └── data/
│       ├── heroes.json                 # 5 heroes: Thor, Captain America, Hulk, Doctor Strange, Shuri
│       ├── events.json                 # 6 sector events (rifts, incursions, breaches, storms)
│       └── factories.json              # 4 factories: Vibranium Refinery, Stark Hub, Sokovian Depot, Nidavellir Forge
│
└── frontend/
    ├── Dockerfile                      # Dev frontend image (Vite)
    ├── package.json                    # React 19, Vite 7, TypeScript 5.9, Tailwind 4
    ├── vite.config.ts                  # Vite + React + Tailwind
    ├── index.html                      # SPA entry point
    ├── public/models/                  # face-api.js pre-trained model weights
    └── src/
        ├── App.tsx                     # Root: auth gate, tab routing, live data, Bo sprite, music
        ├── index.css                   # Pixel-art sprites, 9-slice borders, animations, themed panels
        ├── services/api.ts             # Axios client: all API calls + TypeScript types
        ├── hooks/useLiveData.ts        # WebSocket hook: live ticks, snap events, timeline fetch
        └── components/
            ├── LoginPage.tsx           # Face recognition login with CAPTCHA
            ├── LiveTicker.tsx          # Real-time resource ticker with sparklines and ML badges
            ├── StatCards.tsx            # 6-column KPI grid
            ├── SectorHeatmap.tsx       # Sector-resource matrix with stock bars and trend arrows
            ├── HeroMap.tsx             # Leaflet tactical map with hero/sector markers and event feed
            ├── SupplyChainMap.tsx       # Supply chain map with animated Bezier shipment arcs
            ├── IntelTable.tsx          # Intel reports table with batch processing and audit modals
            ├── CSVUpload.tsx           # Data Lab: upload, analyze, risk gauges, charts
            ├── ChatBot.tsx             # AI chatbot panel with conversation history
            ├── BoSprite.tsx            # Animated pixel-art mascot (idle, walk, snap, siren)
            ├── UserManagement.tsx      # Admin face enrollment/removal
            ├── ReportForm.tsx          # Single report submission with PII preview
            └── ResourceChart.tsx       # Overview/single resource chart with ML forecast overlay
```

---

## Datasets

| File | Records | Description |
|------|---------|-------------|
| `historical_avengers_data.csv` | ~10,000 | Time-series stock levels and usage rates across 5 sectors and 5 resource types, with snap event flags |
| `field_intel_reports.json` | 200 | Unstructured field reports with hero identities (PII), contact numbers, and freeform situation text |
| `supply_chain_shipments.csv` | 78 | Shipment records with source/destination coords, departure/arrival times, quantities, and priorities |

**Sectors**: Wakanda, New Asgard, Sokovia, Sanctum Sanctorum, Avengers Compound

**Resources**: Vibranium (kg), Arc Reactor Cores, Pym Particles, Clean Water (L), Medical Kits

**Heroes**: Thor Odinson, Captain Sam Wilson, Hulk, Doctor Strange, Shuri

---

## Resume Descriptions

### Option 1 — Full-Stack Emphasis

**BIBO — Real-Time Crisis Management Dashboard** | React, FastAPI, PostgreSQL, WebSocket, Gemini AI

- Engineered a full-stack Command & Control dashboard with a React 19 / TypeScript frontend and FastAPI backend, serving 10,000+ time-series data points through a real-time WebSocket simulation engine with 2-second tick intervals
- Built an AI-powered intelligence pipeline that PII-redacts 200+ field reports (hero names, contacts) via regex middleware with audit logging, then batch-processes them through Google Gemini 2.5 Flash for structured entity extraction (location, resource, status, urgency)
- Implemented ML-based resource depletion forecasting using scikit-learn linear regression on post-anomaly data, with 24-point moving averages, AR(1)-style 7-day forecasts, risk scoring (0–100), and crash-recovery detection
- Developed interactive Leaflet-based tactical and supply chain maps with animated Bezier shipment arcs, factory inventory tracking, hero mission histories, and time-travel functionality that dynamically recomputes sector states
- Integrated biometric face-recognition authentication using face-api.js (TinyFaceDetector + 128-dim descriptors) with role-based access control, CAPTCHA verification, and admin-managed enrollment
- Designed a custom pixel-art UI with sprite-based 9-slice borders, animated mascot (multi-phase sprite animation), ambient sound, and themed panels — all containerized with Docker Compose (PostgreSQL + FastAPI + Vite)

---

### Option 2 — AI/ML Emphasis

**BIBO — AI-Driven Resource Intelligence Platform** | Gemini 2.5 Flash, scikit-learn, FastAPI, React, WebSocket

- Designed a privacy-first NLP pipeline that redacts PII (names, phone numbers) from 200 unstructured field reports before batch-processing them through Google Gemini 2.5 Flash, extracting structured intelligence (location, resource, status, urgency) with rule-based fallback extraction
- Built ML forecasting models using scikit-learn linear regression on post-anomaly time-series data (~10,000 records), generating 7-day resource depletion predictions with confidence scores, risk classification, and trend acceleration analysis
- Developed an AI chatbot that injects full CSV analysis context (sampled data points, weekly forecasts, regression stats, R² fit quality) into Gemini prompts, with resource-focus detection via alias matching and 6-message conversation history
- Engineered a real-time data analysis engine that computes 24-point moving averages, AR(1) forecasts (168-hour horizon, autocorrelation 0.85), crash-recovery detection, and per-resource risk scoring on uploaded CSV datasets
- Implemented PII redaction audit logging with side-by-side original vs. redacted text comparison, highlighted replacements, and pipeline flow visualization in a dedicated audit modal
- Served the full system through a WebSocket-driven live simulation that replays time-series data with computed analytics (rolling averages, trend indicators, usage comparisons) and supports seek, restart, and snap event broadcasting

---

### Option 3 — Systems & Infrastructure Emphasis

**BIBO — Distributed Real-Time Monitoring System** | Docker, WebSocket, FastAPI, PostgreSQL, React

- Architected a containerized 3-service system (PostgreSQL 16 + FastAPI + React/Vite) using Docker Compose with health-check-based orchestration, a DB readiness poller (30 retries, 2s intervals), and automated data seeding on startup
- Built a real-time WebSocket simulation engine that replays 10,000+ CSV records at configurable intervals, computing per-tick analytics (rolling averages, usage deltas, trend indicators) and broadcasting to multiple concurrent subscribers via async queues
- Designed a multi-stage Docker production build that compiles the React frontend and serves it as static files from the FastAPI backend on a single port, with catch-all SPA routing
- Implemented a supply chain state machine tracking 78 shipments across 4 factories with real-time inventory computation (production rate × elapsed hours − shipped quantities), fill percentage warnings, and animated transit visualization
- Engineered a secure intelligence processing pipeline with regex-based PII redaction middleware, parallel async LLM batch processing (chunks of 20), and structured data persistence with full audit trail
- Developed role-based biometric authentication using face-api.js with 128-dimensional face descriptors, admin-enforced enrollment, and CAPTCHA-gated login flow

---

### Option 4 — Data Visualization & UX Emphasis

**BIBO — Interactive Data Visualization & Analytics Dashboard** | React, Recharts, Leaflet, Tailwind, WebSocket

- Created a pixel-art themed crisis management dashboard with custom sprite-based 9-slice CSS borders, animated mascot character (5-phase animation: idle → walk → snap → flash → siren), ambient sound design, and themed panels per functional area
- Built real-time resource monitoring with live sparkline charts, a sector heatmap matrix (stock bars with 6h/24h usage markers and trend arrows), and 6 KPI stat cards updating via WebSocket every 2 seconds
- Developed dual interactive Leaflet maps: a tactical hero map with status-colored markers, mission history modals, event feeds, and time-travel state recomputation; and a supply chain map with animated Bezier curve shipment arcs and factory inventory popups
- Implemented a Data Lab featuring drag-and-drop CSV upload, a 4-stage analysis pipeline (parse → MA → regression → forecast), per-resource risk gauges (0–100), ComposedCharts with raw/MA/forecast layers, and configurable time range filters
- Integrated an AI chatbot panel with contextual CSV data injection, conversation history, loading states, and auto-scroll — styled as a pixel-art overlay with custom message bubbles
- Designed face-recognition login with live camera feed, detection overlay, identity/match confidence overlay, custom canvas CAPTCHA, and first-time admin bootstrap flow

---

### Option 5 — Concise & Impact-Focused

**BIBO — Crisis Command & Control Platform** | React, FastAPI, PostgreSQL, Gemini AI, scikit-learn, Docker

- Built a full-stack real-time crisis management dashboard processing 10,000+ time-series records via WebSocket simulation, with live resource monitoring, ML depletion forecasting, and interactive tactical/supply chain maps
- Engineered a privacy-first AI pipeline: PII redaction middleware strips sensitive data from 200+ field reports before batch-processing through Gemini 2.5 Flash for structured entity extraction, with full audit logging
- Implemented biometric face-recognition auth (face-api.js), role-based access control, linear regression forecasting with 7-day AR(1) predictions, and animated supply chain logistics tracking across 4 factories and 78 shipments
- Designed a custom pixel-art UI with sprite animations, Recharts visualizations, Leaflet maps with Bezier shipment arcs, and an AI chatbot with CSV context injection — all deployed via Docker Compose with multi-stage production builds

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from db.database import engine
from db.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from services.simulator import simulator
    await simulator.start()
    yield


app = FastAPI(
    title="Project Sentinel API",
    description="Command & Control backend for global resource management and intelligence processing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from routes.resources import router as resources_router
from routes.reports import router as reports_router
from routes.predictions import router as predictions_router
from routes.test_utils import router as test_router
from routes.heroes import router as heroes_router
from routes.supply import router as supply_router
from routes.ws import router as ws_router

app.include_router(resources_router)
app.include_router(reports_router)
app.include_router(predictions_router)
app.include_router(test_router)
app.include_router(heroes_router)
app.include_router(supply_router)
app.include_router(ws_router)


@app.get("/")
def health_check():
    return {"status": "online", "project": "sentinel"}

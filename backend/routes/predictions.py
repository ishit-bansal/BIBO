from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.schemas import PredictionOut
from services.ml_service import predict_depletion, predict_all

router = APIRouter(prefix="/api/predictions", tags=["ML Predictions"])


@router.get("", response_model=list[PredictionOut])
def get_all_predictions(db: Session = Depends(get_db)):
    """Forecast depletion dates for all sector + resource combinations."""
    return predict_all(db)


@router.get("/{sector}/{resource_type}", response_model=PredictionOut)
def get_prediction(sector: str, resource_type: str, db: Session = Depends(get_db)):
    """Forecast depletion date for a specific sector and resource."""
    return predict_depletion(db, sector, resource_type)

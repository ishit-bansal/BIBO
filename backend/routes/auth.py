"""Authentication endpoints — face descriptor storage and verification."""
import json
import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

FACES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "faces.json")


class FaceEnrollRequest(BaseModel):
    name: str
    role: str  # "admin" | "user"
    descriptor: list[float]


class FaceRecord(BaseModel):
    id: str
    name: str
    role: str
    descriptor: list[float]


def _load_faces() -> list[dict]:
    if not os.path.exists(FACES_PATH):
        return []
    try:
        with open(FACES_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def _save_faces(faces: list[dict]):
    os.makedirs(os.path.dirname(FACES_PATH), exist_ok=True)
    with open(FACES_PATH, "w") as f:
        json.dump(faces, f, indent=2)


@router.get("/faces")
def get_faces():
    """Return all enrolled faces (with descriptors for client-side matching)."""
    return _load_faces()


@router.post("/faces")
def enroll_face(
    req: FaceEnrollRequest,
    x_auth_role: Optional[str] = Header(None),
    x_auth_name: Optional[str] = Header(None),
):
    """Enroll a new face. First enrollment is open; subsequent ones require admin."""
    faces = _load_faces()

    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if len(req.descriptor) != 128:
        raise HTTPException(status_code=400, detail="Face descriptor must have 128 dimensions")

    # First enrollment is unrestricted (bootstrap the first admin).
    # Subsequent self-enrollment as "user" is always allowed so every
    # device / person can access the app independently.
    if faces and req.role == "admin" and x_auth_role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only administrators can enroll new admins",
        )

    # Reject duplicate names
    if any(f["name"].lower() == req.name.strip().lower() for f in faces):
        raise HTTPException(status_code=409, detail=f"'{req.name}' is already enrolled")

    record = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "role": req.role,
        "descriptor": req.descriptor,
    }
    faces.append(record)
    _save_faces(faces)

    return {"status": "enrolled", "id": record["id"], "name": record["name"], "role": record["role"]}


@router.delete("/faces/{face_id}")
def remove_face(
    face_id: str,
    x_auth_role: Optional[str] = Header(None),
):
    """Remove an enrolled face. Requires admin."""
    if x_auth_role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can remove personnel")

    faces = _load_faces()
    original_len = len(faces)
    faces = [f for f in faces if f["id"] != face_id]

    if len(faces) == original_len:
        raise HTTPException(status_code=404, detail="Face not found")

    _save_faces(faces)
    return {"status": "removed", "id": face_id}

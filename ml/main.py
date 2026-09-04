"""
Veritas ML Microservice — FastAPI Entry Point
Routes:
  GET  /health              → hello-world / status
  POST /score               → score a batch of identities (Model A + B fusion)
  POST /demo/inject         → generate + score a live fraud ring for demo
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np
import os

# Local model modules (imported after training)
try:
    from model_a import score_batch_a
    from model_b import score_batch_b
    from demo_inject import generate_fraud_ring
    MODELS_LOADED = True
except ImportError as e:
    MODELS_LOADED = False
    _import_error = str(e)

app = FastAPI(title="Veritas ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ───────────────────────────────────────────────────────────────

class IdentityInput(BaseModel):
    id: str
    name: Optional[str] = None
    age: Optional[float] = 0
    address: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    pan_prefix: Optional[str] = None
    account_age_months: Optional[float] = 0
    address_history_count: Optional[float] = 0
    shared_phone_count: Optional[float] = 0
    shared_email_count: Optional[float] = 0
    payment_smoothness: Optional[float] = 0
    age_address_mismatch: Optional[float] = 0
    ring_id: Optional[int] = 0
    is_fraud: Optional[int] = 0

class ScoreRequest(BaseModel):
    identities: List[IdentityInput]

class DemoInjectRequest(BaseModel):
    ring_size: Optional[int] = 18

# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "veritas-ml",
        "models_loaded": MODELS_LOADED,
        "message": "Hello from FastAPI!" if MODELS_LOADED else f"Models not loaded: {_import_error if not MODELS_LOADED else ''}",
    }

@app.post("/score")
def score(request: ScoreRequest):
    if not MODELS_LOADED:
        raise HTTPException(status_code=503, detail="Models not loaded. Run model_a.py and model_b.py first.")

    identities = [
        i.model_dump() if hasattr(i, 'model_dump') else i.dict() if hasattr(i, 'dict') else vars(i)
        for i in request.identities
    ]

    try:
        # Model A — individual tabular scoring
        a_results = score_batch_a(identities)

        # Model B — ring/cluster scoring
        b_results = score_batch_b(identities)

        # Fusion
        fused = []
        for i, identity in enumerate(identities):
            a_score = float(a_results[i].get("model_a_score", 0))
            b_score = float(b_results[i].get("model_b_score", 0))
            fused_score = round(0.6 * a_score + 0.4 * b_score, 4)

            if fused_score < 0.3:
                risk_label = "LOW"
            elif fused_score < 0.6:
                risk_label = "MEDIUM"
            else:
                risk_label = "HIGH"

            fused.append({
                **identity,
                "model_a_score": round(a_score, 4),
                "model_b_score": round(b_score, 4),
                "fused_score": fused_score,
                "risk_label": risk_label,
                "shap_values": a_results[i].get("shap_values", {}),
                "cluster_id": b_results[i].get("cluster_id", -1),
                "ring_flag": b_results[i].get("ring_flag", False),
            })

        return fused

    except Exception as e:
        print(f"[score] Error: {e}")
        raise HTTPException(status_code=500, detail="Processing failed.")

@app.post("/demo/inject")
def demo_inject(request: DemoInjectRequest):
    if not MODELS_LOADED:
        raise HTTPException(status_code=503, detail="Models not loaded.")

    try:
        identities = generate_fraud_ring(ring_size=request.ring_size)
        score_req = ScoreRequest(identities=[IdentityInput(**i) for i in identities])
        scored = score(score_req)
        return {"identities": scored}
    except Exception as e:
        print(f"[demo/inject] Error: {e}")
        raise HTTPException(status_code=500, detail="Processing failed.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

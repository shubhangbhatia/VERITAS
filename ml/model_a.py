"""
Veritas — Model A: Tabular XGBoost Consistency Classifier + SHAP
Features: 6 engineered signals of synthetic identity inconsistency.
Run: python model_a.py
"""

import os
import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler

DATA_PATH   = os.path.join(os.path.dirname(__file__), 'data', 'identities.csv')
MODEL_PATH  = os.path.join(os.path.dirname(__file__), 'models', 'model_a.pkl')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'models', 'scaler_a.pkl')

# The 6 core features — carefully chosen for explainability
FEATURES = [
    'age_address_mismatch',   # internal inconsistency signal
    'shared_phone_count',     # coordination signal
    'shared_email_count',     # coordination signal
    'payment_smoothness',     # bust-out signature (lower = more suspicious)
    'address_history_count',  # rapid address changes
    'account_age_months',     # very new = more suspicious
]

LABEL = 'is_fraud'


# ── Training ──────────────────────────────────────────────────────────────

def train():
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} rows. Fraud: {df[LABEL].sum()} ({df[LABEL].mean():.1%})")

    X = df[FEATURES].fillna(0)
    y = df[LABEL]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale for consistency (XGBoost doesn't strictly need it, but helps SHAP values)
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    # Calculate class weight to handle imbalance (~6% fraud)
    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
    print(f"Class weight (scale_pos_weight): {scale_pos_weight:.2f}")

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        eval_metric='auc',
        random_state=42,
    )
    model.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

    # ── Evaluate ──────────────────────────────────────────────────────────
    y_prob  = model.predict_proba(X_test_s)[:, 1]
    y_pred  = (y_prob >= 0.5).astype(int)
    auc     = roc_auc_score(y_test, y_prob)

    print(f"\n[INFO] Model A Evaluation:")
    print(f"   AUC-ROC:  {auc:.4f}")
    print(f"   {classification_report(y_test, y_pred, target_names=['Clean', 'Fraud'])}")
    print(f"   Confusion Matrix:\n{confusion_matrix(y_test, y_pred)}")

    # ── SHAP ─────────────────────────────────────────────────────────────
    explainer = shap.TreeExplainer(model)
    shap_values_train = explainer.shap_values(X_train_s)

    print(f"\n[SHAP] Feature Importance (mean |SHAP|):")
    mean_shap = np.abs(shap_values_train).mean(axis=0)
    for feat, val in sorted(zip(FEATURES, mean_shap), key=lambda x: -x[1]):
        print(f"   {feat:30s}: {val:.4f}")

    # Save
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump({'model': model, 'explainer': explainer, 'features': FEATURES}, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    print(f"\n[SAVE] Model saved: {MODEL_PATH}")
    print(f"[SAVE] Scaler saved: {SCALER_PATH}")

    return model, scaler, explainer


# ── Inference (called from main.py) ──────────────────────────────────────

_model_cache = None

def _load_model():
    global _model_cache
    if _model_cache is None:
        payload = joblib.load(MODEL_PATH)
        scaler  = joblib.load(SCALER_PATH)
        _model_cache = {
            'model':     payload['model'],
            'explainer': payload['explainer'],
            'features':  payload['features'],
            'scaler':    scaler,
        }
    return _model_cache


def score_batch_a(identities: list[dict]) -> list[dict]:
    """
    Score a list of identity dicts.
    Returns list of dicts with model_a_score + shap_values.
    """
    m = _load_model()
    df = pd.DataFrame(identities)

    # Fill missing features with 0
    for feat in FEATURES:
        if feat not in df.columns:
            df[feat] = 0.0

    X = df[FEATURES].fillna(0).astype(float)
    X_scaled = m['scaler'].transform(X)

    probs = m['model'].predict_proba(X_scaled)[:, 1]
    shap_vals = m['explainer'].shap_values(X_scaled)

    results = []
    for i, identity in enumerate(identities):
        shap_dict = {feat: round(float(shap_vals[i][j]), 5) for j, feat in enumerate(FEATURES)}
        results.append({
            'id': identity.get('id', ''),
            'model_a_score': round(float(probs[i]), 4),
            'shap_values': shap_dict,
        })

    return results


if __name__ == '__main__':
    train()

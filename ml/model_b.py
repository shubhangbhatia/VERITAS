"""
Veritas — Model B: Embedding-Based Ring Detector (HDBSCAN)
Encodes identity structural signatures into feature vectors,
clusters them with HDBSCAN, and flags dense clusters as fraud rings.
Run: python model_b.py
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
import hdbscan

DATA_PATH   = os.path.join(os.path.dirname(__file__), 'data', 'identities.csv')
MODEL_PATH  = os.path.join(os.path.dirname(__file__), 'models', 'model_b.pkl')

# Categorical features (structural signatures) — one-hot encoded
CAT_FEATURES = [
    'zip_prefix',      # first 3 chars of zip — geographic clustering
    'email_domain',    # email domain — shared template signal
    'phone_prefix',    # first 5 digits of phone — carrier/template signal
    'pan_prefix',      # PAN prefix — issuer pattern signal
]

# Numeric features included in the vector
NUM_FEATURES = [
    'payment_smoothness',
    'account_age_months',
    'shared_phone_count',
    'age_address_mismatch',
]


def build_feature_matrix(df: pd.DataFrame):
    """
    Extract structural signatures and build combined feature matrix.
    """
    df = df.copy()

    # Derive categorical signals
    df['zip_prefix']   = df['zip_code'].astype(str).str[:3]
    df['email_domain'] = df['email'].astype(str).str.split('@').str[-1].str.lower()
    df['phone_prefix'] = df['phone'].astype(str).str[:5]
    df['pan_prefix']   = df['pan_prefix'].astype(str).str[:5].str.upper()

    return df


# ── Training / fitting ────────────────────────────────────────────────────

def fit_and_cluster(df: pd.DataFrame):
    df = build_feature_matrix(df)

    # One-hot encode categorical structural signatures
    ohe = OneHotEncoder(sparse_output=False, handle_unknown='ignore', min_frequency=2)
    cat_matrix = ohe.fit_transform(df[CAT_FEATURES])

    # Scale numeric features
    scaler = StandardScaler()
    num_matrix = scaler.fit_transform(df[NUM_FEATURES].fillna(0))

    # Combine into one feature vector per identity
    X = np.hstack([cat_matrix, num_matrix])
    print(f"Feature matrix shape: {X.shape}")

    # HDBSCAN clustering
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=5,      # minimum fraud ring size
        min_samples=3,
        metric='euclidean',
        cluster_selection_epsilon=0.0,
        prediction_data=True,
    )
    labels = clusterer.fit_predict(X)
    probabilities = clusterer.probabilities_   # soft membership score

    # ── Evaluate alignment with ground truth ─────────────────────────────
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    print(f"\n[INFO] HDBSCAN Results:")
    print(f"   Clusters found: {n_clusters}")
    print(f"   Noise points:   {(labels == -1).sum()}")

    if 'ring_id' in df.columns:
        for ring_id in [1, 2, 3]:
            ring_mask = df['ring_id'] == ring_id
            ring_labels = labels[ring_mask]
            dominant = pd.Series(ring_labels[ring_labels >= 0]).mode()
            dominant_val = dominant.iloc[0] if len(dominant) > 0 else -1
            captured = (ring_labels == dominant_val).sum()
            total = ring_mask.sum()
            print(f"   Ring {ring_id}: {captured}/{total} members in cluster {dominant_val}")

    # Save
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    payload = {
        'clusterer': clusterer,
        'ohe': ohe,
        'scaler': scaler,
        'cat_features': CAT_FEATURES,
        'num_features': NUM_FEATURES,
        'labels': labels,
        'probabilities': probabilities,
    }
    joblib.dump(payload, MODEL_PATH)
    print(f"\n[SAVE] Model B saved: {MODEL_PATH}")

    return labels, probabilities


# ── Inference (called from main.py) ──────────────────────────────────────

_model_cache_b = None

def _load_model_b():
    global _model_cache_b
    if _model_cache_b is None:
        _model_cache_b = joblib.load(MODEL_PATH)
    return _model_cache_b


def score_batch_b(identities: list[dict]) -> list[dict]:
    """
    Score a list of identity dicts using HDBSCAN approximate prediction.
    Returns: list of {id, cluster_id, model_b_score, ring_flag}
    """
    m = _load_model_b()
    df = pd.DataFrame(identities)
    df = build_feature_matrix(df)

    # Transform features
    cat_matrix = m['ohe'].transform(df[m['cat_features']].fillna('unknown'))
    num_matrix = m['scaler'].transform(df[m['num_features']].fillna(0))
    X = np.hstack([cat_matrix, num_matrix])

    # Use HDBSCAN approximate prediction for new points
    try:
        labels, probs = hdbscan.approximate_predict(m['clusterer'], X)
    except Exception as err:
        # If approximate prediction cannot run on single or novel points, treat as unclustered noise safely
        print(f"[WARN] HDBSCAN approximate_predict note: {err}. Assigning unclustered default.")
        labels = np.full(len(identities), -1)
        probs = np.zeros(len(identities))

    results = []
    for i, identity in enumerate(identities):
        cluster_id = int(labels[i])
        cluster_prob = float(probs[i]) if i < len(probs) else 0.0

        # model_b_score: high if in a cluster (ring detected) + high probability
        if cluster_id >= 0:
            model_b_score = min(0.95, 0.5 + cluster_prob * 0.5)
            ring_flag = True
        else:
            model_b_score = max(0.05, cluster_prob * 0.3)
            ring_flag = False

        results.append({
            'id': identity.get('id', ''),
            'cluster_id': cluster_id,
            'model_b_score': round(model_b_score, 4),
            'ring_flag': ring_flag,
        })

    return results


if __name__ == '__main__':
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} rows")
    fit_and_cluster(df)

"""
Veritas — Synthetic Identity Dataset Generator
Generates ~900 clean identities + 3 distinct fraud ring templates
(15-20 identities each) sharing address/phone/email patterns.

Run: python generate_data.py
Output: data/identities.csv
"""

import os
import uuid
import random
import numpy as np
import pandas as pd
from faker import Faker

fake = Faker('en_IN')
random.seed(42)
np.random.seed(42)

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'data', 'identities.csv')

# ── Phone + shared-count helpers ──────────────────────────────────────────

def gen_phone(prefix=None):
    """Generate a 10-digit phone number, optionally with a fixed prefix."""
    p = prefix or str(random.randint(6, 9)) + ''.join([str(random.randint(0, 9)) for _ in range(4)])
    suffix = ''.join([str(random.randint(0, 9)) for _ in range(5)])
    return p + suffix

def gen_email(domain=None, name_seed=None):
    """Generate email, optionally from a fixed domain."""
    name = (name_seed or fake.first_name()).lower().replace(' ', '') + str(random.randint(10, 999))
    dom = domain or random.choice(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'rediffmail.com'])
    return f"{name}@{dom}"

def gen_pan_prefix(prefix=None):
    """Generate a PAN-style 5-char prefix."""
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if prefix:
        return prefix
    return ''.join(random.choices(letters, k=5))

def gen_address(zip_prefix=None, city=None):
    """Generate an address. Optionally fix zip prefix and city for ring clustering."""
    street = f"{random.randint(1, 999)} {fake.street_name()}"
    c = city or fake.city()
    zip_suffix = ''.join([str(random.randint(0, 9)) for _ in range(3)])
    zip_code = (zip_prefix or str(random.randint(100, 900))) + zip_suffix
    return f"{street}, {c}, {zip_code}", zip_code

def compute_payment_smoothness(is_fraud_ring=False):
    """
    Real bust-out signature: fraudulent identities have very low std dev
    (too-perfect, smooth payment history before bust-out).
    """
    if is_fraud_ring:
        return round(random.uniform(0.01, 0.15), 4)   # suspiciously smooth
    else:
        return round(random.uniform(0.3, 2.5), 4)      # realistic variance

def compute_age_address_mismatch(age, account_age_months, address_history_count):
    """
    Mismatch score: very young account with many address changes OR
    old age but account opened very recently.
    """
    expected_history = max(1, age // 10)
    history_ratio = address_history_count / expected_history
    account_youth_penalty = max(0, 1 - account_age_months / 24)  # <2yr account = higher penalty
    return round(min(1.0, history_ratio * 0.5 + account_youth_penalty * 0.5), 4)

# ── Clean identity generator ───────────────────────────────────────────────

def gen_clean_identity():
    age = random.randint(22, 68)
    account_age_months = random.randint(12, 120)
    address_history_count = random.randint(1, max(1, age // 12))
    address, zip_code = gen_address()
    phone = gen_phone()
    email = gen_email()

    return {
        'id': str(uuid.uuid4()),
        'name': fake.name(),
        'age': age,
        'address': address,
        'zip_code': zip_code,
        'phone': phone,
        'email': email,
        'pan_prefix': gen_pan_prefix(),
        'account_age_months': account_age_months,
        'address_history_count': address_history_count,
        'shared_phone_count': 1,     # will be recomputed after deduplication
        'shared_email_count': 1,
        'payment_smoothness': compute_payment_smoothness(is_fraud_ring=False),
        'age_address_mismatch': compute_age_address_mismatch(age, account_age_months, address_history_count),
        'ring_id': 0,
        'is_fraud': 0,
    }

# ── Fraud ring template generator ─────────────────────────────────────────

RING_TEMPLATES = [
    # Ring 1: shared zip prefix + email domain + phone prefix — classic bust-out ring
    {
        'ring_id': 1,
        'zip_prefix': '110',      # Delhi-area zips
        'city': 'New Delhi',
        'email_domain': 'fraudmail.in',
        'phone_prefix': '98765',
        'pan_prefix': 'AAAPF',    # same PAN prefix pattern
        'age_range': (24, 32),    # young synthetic identities
        'account_age_range': (3, 12),  # very new accounts
        'size': 18,
    },
    # Ring 2: shared email domain + phone prefix — different geo, same template
    {
        'ring_id': 2,
        'zip_prefix': '400',      # Mumbai-area zips
        'city': 'Mumbai',
        'email_domain': 'syntheticid.net',
        'phone_prefix': '77321',
        'pan_prefix': 'BBBQX',
        'age_range': (28, 38),
        'account_age_range': (2, 8),
        'size': 16,
    },
    # Ring 3: shared address block + phone prefix — more subtle, older identities
    {
        'ring_id': 3,
        'zip_prefix': '560',      # Bangalore-area zips
        'city': 'Bangalore',
        'email_domain': 'mailbox99.co',
        'phone_prefix': '63411',
        'pan_prefix': 'CCCRY',
        'age_range': (35, 50),
        'account_age_range': (6, 18),
        'size': 17,
    },
]

def gen_ring_identity(template):
    age = random.randint(*template['age_range'])
    account_age_months = random.randint(*template['account_age_range'])
    address_history_count = random.randint(1, 3)  # low history = red flag
    address, zip_code = gen_address(zip_prefix=template['zip_prefix'], city=template['city'])
    phone = gen_phone(prefix=template['phone_prefix'])
    email = gen_email(domain=template['email_domain'])

    return {
        'id': str(uuid.uuid4()),
        'name': fake.name(),
        'age': age,
        'address': address,
        'zip_code': zip_code,
        'phone': phone,
        'email': email,
        'pan_prefix': template['pan_prefix'],
        'account_age_months': account_age_months,
        'address_history_count': address_history_count,
        'shared_phone_count': 1,   # recomputed below
        'shared_email_count': 1,
        'payment_smoothness': compute_payment_smoothness(is_fraud_ring=True),
        'age_address_mismatch': compute_age_address_mismatch(age, account_age_months, address_history_count),
        'ring_id': template['ring_id'],
        'is_fraud': 1,
    }

# ── Build dataset ─────────────────────────────────────────────────────────

def build_dataset(n_clean=849):
    rows = []

    # Clean identities
    print(f"Generating {n_clean} clean identities...")
    for _ in range(n_clean):
        rows.append(gen_clean_identity())

    # Fraud rings
    for template in RING_TEMPLATES:
        print(f"Generating fraud ring {template['ring_id']} ({template['size']} identities)...")
        for _ in range(template['size']):
            rows.append(gen_ring_identity(template))

    df = pd.DataFrame(rows)

    # ── Recompute shared_phone_count and shared_email_count ──────────────
    phone_counts = df['phone'].value_counts()
    email_counts = df['email'].value_counts()
    df['shared_phone_count'] = df['phone'].map(phone_counts).fillna(1).astype(int)
    df['shared_email_count'] = df['email'].map(email_counts).fillna(1).astype(int)

    # For ring identities, artificially boost sharing to reflect template (same prefix)
    # Group by phone prefix (first 5 chars) to simulate shared-prefix detection
    df['phone_prefix'] = df['phone'].str[:5]
    prefix_counts = df.groupby('phone_prefix')['id'].count()
    df['shared_phone_count'] = df.apply(
        lambda r: max(r['shared_phone_count'], int(prefix_counts.get(r['phone_prefix'], 1) * 0.7)),
        axis=1
    )

    df['email_domain'] = df['email'].str.split('@').str[-1]
    domain_counts = df.groupby('email_domain')['id'].count()
    df['shared_email_count'] = df.apply(
        lambda r: max(r['shared_email_count'], int(domain_counts.get(r['email_domain'], 1))),
        axis=1
    )

    # Drop helper columns
    df = df.drop(columns=['phone_prefix', 'email_domain'])

    # Shuffle
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)

    print(f"\nDataset built: {len(df)} total rows")
    print(f"   Clean: {(df['is_fraud'] == 0).sum()}")
    print(f"   Fraud: {(df['is_fraud'] == 1).sum()}")
    print(f"   Fraud ring breakdown:")
    for ring_id in [1, 2, 3]:
        print(f"     Ring {ring_id}: {(df['ring_id'] == ring_id).sum()} identities")

    return df

if __name__ == '__main__':
    os.makedirs(os.path.join(os.path.dirname(__file__), 'data'), exist_ok=True)
    df = build_dataset()
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSaved to: {OUTPUT_PATH}")
    print(f"\nSample fraud identity:")
    print(df[df['is_fraud'] == 1].head(1).T)

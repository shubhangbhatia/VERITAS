"""
Veritas — Demo Injection: Generate a fresh fraud ring on demand.
Called by FastAPI /demo/inject for live demo trigger.
"""

import uuid
import random
import numpy as np
from faker import Faker

fake = Faker('en_IN')

DEMO_TEMPLATE = {
    'zip_prefix': '700',           # Kolkata — distinct from training rings
    'city': 'Kolkata',
    'email_domain': 'demofraud.io',
    'phone_prefix': '91234',
    'pan_prefix': 'DDDKL',
    'age_range': (23, 35),
    'account_age_range': (1, 6),   # very new accounts
}


def generate_fraud_ring(ring_size: int = 18) -> list[dict]:
    """
    Generate ring_size synthetic fraud identities sharing structural patterns.
    Returns list of identity dicts ready for scoring.
    """
    random.seed()   # non-deterministic for live demo freshness
    np.random.seed()

    t = DEMO_TEMPLATE
    identities = []

    for _ in range(ring_size):
        age = random.randint(*t['age_range'])
        account_age_months = random.randint(*t['account_age_range'])
        address_history_count = random.randint(1, 2)

        # Shared structural signatures
        zip_suffix = ''.join([str(random.randint(0, 9)) for _ in range(3)])
        zip_code = t['zip_prefix'] + zip_suffix
        street = f"{random.randint(1, 999)} {fake.street_name()}"
        address = f"{street}, {t['city']}, {zip_code}"

        phone_suffix = ''.join([str(random.randint(0, 9)) for _ in range(5)])
        phone = t['phone_prefix'] + phone_suffix

        name_part = fake.first_name().lower() + str(random.randint(10, 999))
        email = f"{name_part}@{t['email_domain']}"

        # Bust-out payment pattern
        payment_smoothness = round(random.uniform(0.02, 0.12), 4)

        expected_history = max(1, age // 10)
        history_ratio = address_history_count / expected_history
        account_youth_penalty = max(0, 1 - account_age_months / 24)
        age_address_mismatch = round(min(1.0, history_ratio * 0.5 + account_youth_penalty * 0.5), 4)

        identities.append({
            'id': str(uuid.uuid4()),
            'name': fake.name(),
            'age': age,
            'address': address,
            'zip_code': zip_code,
            'phone': phone,
            'email': email,
            'pan_prefix': t['pan_prefix'],
            'account_age_months': account_age_months,
            'address_history_count': address_history_count,
            'shared_phone_count': ring_size,   # all share the same prefix
            'shared_email_count': ring_size,
            'payment_smoothness': payment_smoothness,
            'age_address_mismatch': age_address_mismatch,
            'ring_id': 99,    # demo ring marker
            'is_fraud': 1,
        })

    return identities

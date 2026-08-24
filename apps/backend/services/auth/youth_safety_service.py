"""Server-owned youth eligibility and account-safety policy.

The public age gate intentionally receives no registration identifiers.
Successful checks produce a short-lived signed token; account
creation consumes the token and stores only the small set of facts needed to
enforce junior protections.  Exact ages and birthdates are never accepted.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal

from jose import JWTError, jwt

from backend.services.auth import auth_service
from backend.utils.datetime_utils import utcnow

CountryCode = Literal["US", "CA"]
AgeGroup = Literal["junior", "adult"]

CANADIAN_PROVINCES = frozenset(
    {"AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"}
)
US_REGIONS = frozenset(
    {
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "DC",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "TX",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
    }
)
TOKEN_TYPE = "youth_eligibility"
TOKEN_LIFETIME_MINUTES = 30
POLICY = "global-14-v1"
MINIMUM_AGE = 14


class YouthEligibilityError(ValueError):
    """The submitted gate result cannot authorize account creation."""


@dataclass(frozen=True)
class EligibilityFacts:
    country_code: CountryCode | None
    region_code: str | None
    age_group: AgeGroup
    assurance_source: str
    declaration_source: str
    guardian_consent: bool

    @property
    def profile_is_private(self) -> bool:
        return self.age_group == "junior"


def _signing_secret() -> str:
    return os.getenv("YOUTH_SAFETY_SIGNING_SECRET") or auth_service.JWT_SECRET_KEY


def normalize_territory(country_code: str, region_code: str) -> tuple[CountryCode, str]:
    country = country_code.strip().upper()
    region = region_code.strip().upper()
    if country not in {"US", "CA"}:
        raise YouthEligibilityError(
            "Beach League is available only in the United States and Canada"
        )
    allowed_regions = US_REGIONS if country == "US" else CANADIAN_PROVINCES
    if region not in allowed_regions:
        label = "state" if country == "US" else "province or territory"
        raise YouthEligibilityError(f"Select a valid {label}")
    return country, region  # type: ignore[return-value]


def evaluate_gate(
    *,
    country_code: str | None = None,
    region_code: str | None = None,
    declared_band: str,
    assurance_source: str,
    declaration_source: str,
    guardian_consent: bool,
) -> EligibilityFacts:
    """Validate a neutral range response without accepting an exact age."""
    if declared_band == "under_minimum":
        raise YouthEligibilityError(f"You must be at least {MINIMUM_AGE} to create an account")
    if declared_band not in {"junior", "adult"}:
        raise YouthEligibilityError("Select an age range")
    if assurance_source not in {"apple_declared_age_range", "self_declared"}:
        raise YouthEligibilityError("Unsupported age assurance source")
    allowed_declarations = {
        "self_declared",
        "guardian_declared",
        "verified",
        "guardian_verified",
        "not_shared",
    }
    if declaration_source not in allowed_declarations:
        raise YouthEligibilityError("Unsupported age declaration source")
    if declared_band == "junior" and not guardian_consent:
        raise YouthEligibilityError("A parent or legal guardian must consent for a junior account")
    return EligibilityFacts(
        # Jurisdiction is intentionally discarded under the global policy.
        # The parameters remain accepted temporarily for client compatibility.
        country_code=None,
        region_code=None,
        age_group=declared_band,  # type: ignore[arg-type]
        assurance_source=assurance_source,
        declaration_source=declaration_source,
        guardian_consent=bool(guardian_consent),
    )


def create_eligibility_token(facts: EligibilityFacts) -> str:
    now = utcnow()
    payload = {
        "type": TOKEN_TYPE,
        "policy": POLICY,
        "age_group": facts.age_group,
        "assurance_source": facts.assurance_source,
        "declaration_source": facts.declaration_source,
        "guardian_consent": facts.guardian_consent,
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_LIFETIME_MINUTES),
    }
    return jwt.encode(payload, _signing_secret(), algorithm=auth_service.JWT_ALGORITHM)


def decode_eligibility_token(token: str | None) -> EligibilityFacts:
    if not token:
        raise YouthEligibilityError("Complete the age check before creating an account")
    try:
        payload = jwt.decode(token, _signing_secret(), algorithms=[auth_service.JWT_ALGORITHM])
    except JWTError as exc:
        raise YouthEligibilityError("The age check expired. Please complete it again") from exc
    if payload.get("type") != TOKEN_TYPE:
        raise YouthEligibilityError("Invalid age check")
    return evaluate_gate(
        declared_band=str(payload.get("age_group", "")),
        assurance_source=str(payload.get("assurance_source", "")),
        declaration_source=str(payload.get("declaration_source", "")),
        guardian_consent=payload.get("guardian_consent") is True,
    )


def account_values(facts: EligibilityFacts) -> dict[str, object]:
    """Return immutable account facts and privacy-protective defaults."""
    return {
        "age_group": facts.age_group,
        "eligibility_country": None,
        "eligibility_region": None,
        "age_assurance_source": facts.assurance_source,
        "age_declaration_source": facts.declaration_source,
        "guardian_consent": facts.guardian_consent,
        "age_assured_at": utcnow(),
        "profile_is_private": facts.profile_is_private,
        "show_game_history": not facts.profile_is_private,
    }

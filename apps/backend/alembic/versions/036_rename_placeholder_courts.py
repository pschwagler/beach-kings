"""rename_placeholder_courts

Revision ID: 036
Revises: 035
Create Date: 2026-03-04 00:00:00.000000

Rename placeholder courts from generic "Other / Private Court" to
location-specific names like "Other / Private Court (SD)".
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Manual abbreviation overrides for common/recognizable short forms.
# Locations not listed here derive their label by taking the part after
# " - " in the location name and trimming at the first " / " or " (".
ABBREVIATIONS = {
    "socal_la": "LA",
    "socal_sd": "SD",
    "socal_oc": "OC",
    "norcal_sf": "SF",
    "central_slo": "SLO",
    "central_sb": "Santa Barbara",
    "norcal_sc": "Santa Cruz",
    "norcal_sac": "Sacramento",
    "ny_nyc": "NYC",
    "ny_li": "Long Island",
    "ny_capital": "Albany",
    "ny_western": "Western NY",
    "dc_metro": "DC",
    "ga_atl": "ATL",
    "tx_dallas": "DFW",
    "tx_houston": "Houston",
    "tx_sat": "San Antonio",
    "nv_vegas": "Vegas",
    "in_indy": "Indy",
    "pa_philly": "Philly",
    "pa_pitt": "Pittsburgh",
    "mn_minn": "Minneapolis",
    "ne_bos": "Boston",
    "ne_ri": "Rhode Island",
    "nj_shore": "NJ Shore",
    "nm_abq": "ABQ",
    "mo_stlouis": "STL",
    "ok_okc": "OKC",
    "ut_slc": "SLC",
    "pnw_seattle": "Seattle",
    "pnw_pdx": "Portland",
    "fl_east": "South FL",
    "fl_west": "Tampa",
    "mi_gr": "Grand Rapids",
    "mi_detroit": "Detroit",
    "va_beach": "VA Beach",
    "ks_kc": "KC",
    "la_nola": "NOLA",
    "hi_maui": "Maui",
    "hi_oahu": "Oahu",
}


def _derive_short_label(location_id: str, location_name: str) -> str:
    """Derive a short label for a placeholder court from its location."""
    if location_id in ABBREVIATIONS:
        return ABBREVIATIONS[location_id]
    # Fallback: take part after " - ", trim at " / " or " ("
    parts = location_name.split(" - ", 1)
    label = parts[1] if len(parts) > 1 else parts[0]
    for sep in (" / ", " ("):
        idx = label.find(sep)
        if idx > 0:
            label = label[:idx]
    return label.strip()


def upgrade() -> None:
    """Rename placeholder courts with location-specific short names."""
    conn = op.get_bind()

    locations = sa.table(
        "locations",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
    )
    courts = sa.table(
        "courts",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("location_id", sa.String),
        sa.column("is_placeholder", sa.Boolean),
    )

    # Fetch all locations
    loc_rows = conn.execute(sa.select(locations.c.id, locations.c.name)).fetchall()
    loc_map = {row[0]: row[1] for row in loc_rows}

    # Fetch all placeholder courts
    placeholders = conn.execute(
        sa.select(courts.c.id, courts.c.location_id).where(
            courts.c.is_placeholder == True  # noqa: E712
        )
    ).fetchall()

    # Bulk update all placeholder courts in a single statement
    updates = []
    for court_id, loc_id in placeholders:
        loc_name = loc_map.get(loc_id, loc_id)
        short = _derive_short_label(loc_id, loc_name)
        new_name = f"Other / Private Court ({short})"
        updates.append({"_id": court_id, "name": new_name})

    if updates:
        stmt = (
            courts.update()
            .where(courts.c.id == sa.bindparam("_id"))
            .values(name=sa.bindparam("name"))
        )
        conn.execute(stmt, updates)


def downgrade() -> None:
    """Revert placeholder courts to generic name."""
    conn = op.get_bind()
    courts = sa.table(
        "courts",
        sa.column("name", sa.String),
        sa.column("is_placeholder", sa.Boolean),
    )
    conn.execute(
        courts.update()
        .where(courts.c.is_placeholder == True)  # noqa: E712
        .values(name="Other / Private Court")
    )

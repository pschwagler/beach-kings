"""Unit coverage for court bounds predicates; no database required."""

from sqlalchemy.dialects import postgresql

from backend.services import court_service


def _sql(west: float, east: float) -> str:
    return str(
        court_service._longitude_bounds_filter(west, east).compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_ordinary_longitude_bounds_use_an_intersection():
    sql = _sql(-75, -73)

    assert "courts.longitude >= -75" in sql
    assert "courts.longitude <= -73" in sql
    assert " AND " in sql
    assert " OR " not in sql


def test_date_line_crossing_bounds_use_a_union():
    sql = _sql(179, -179)

    assert "courts.longitude >= 179" in sql
    assert "courts.longitude <= -179" in sql
    assert " OR " in sql

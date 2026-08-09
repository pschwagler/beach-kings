"""Architecture checks for the backend's domain-oriented module layout."""

from pathlib import Path

from backend.database import models
from backend.database.db import Base
from backend.models import schemas
from backend.services import auth_service, court_service, stats_queue


BACKEND_ROOT = Path(__file__).parents[1]


def test_orm_models_are_registered_from_domain_package():
    assert len(Base.metadata.tables) == 70
    assert models.Player.__tablename__ == "players"
    assert models.KobTournament.__tablename__ == "kob_tournaments"
    assert models.ModerationCase.__tablename__ == "moderation_cases"


def test_schema_package_preserves_public_import_surface():
    assert schemas.PlayerResponse.__module__ == "backend.models.schemas.players"
    assert schemas.CourtDetailResponse.__module__ == "backend.models.schemas.courts"
    assert schemas.KobTournamentResponse.__module__ == "backend.models.schemas.kob"


def test_service_compatibility_aliases_resolve_to_domain_modules():
    assert auth_service.__name__ == "backend.services.auth.auth_service"
    assert court_service.__name__ == "backend.services.courts.court_service"
    assert stats_queue.__name__ == "backend.services.stats.stats_queue"


def test_service_root_contains_only_compatibility_modules():
    service_files = {path.name for path in (BACKEND_ROOT / "services").glob("*.py")}
    assert service_files == {"__init__.py", "data_service.py"}

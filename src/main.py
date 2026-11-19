import os
import secrets
from pathlib import Path

from flask import Flask, Response, redirect, request
from werkzeug.exceptions import HTTPException

from src.config import DB_PATH, MAX_CSV_BYTES, SIMULATION_API_URL, STATE_DIR
from src.controllers import (
    admin_controller,
    assistant_controller,
    auth_controller,
    community_controller,
    forum_controller,
    simulation_controller,
)
from src.controllers.session_guard import get_current_auth
from src.models.community import communityModel
from src.models.user import SQLiteUserRepository
from src.services.auth_service import AuthService
from src.services.cloud_assistant_service import cloudAssistantService
from src.services.cloud_auth_service import CloudAuthService
from src.services.cloud_client import cloudClient
from src.services.cloud_community_service import cloudCommunityService
from src.services.cloud_reference_service import cloudReferenceService
from src.services.community_service import communityService
from src.services.simulation_service import simulationService


def createApp(testConfig: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder="views", static_folder="static")
    app.config["MAX_CONTENT_LENGTH"] = MAX_CSV_BYTES + 64_000
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE") == "1",
        AGRIDATA_DB_PATH=os.environ.get("AGRIDATA_DB_PATH", str(DB_PATH)),
        AGRIDATA_SECRET_KEY=os.environ.get("AGRIDATA_SECRET_KEY"),
        AGRIDATA_AUTH_DEMO=os.environ.get("AGRIDATA_AUTH_DEMO") == "1",
        COMMUNITY_DATABASE=os.environ.get(
            "COMMUNITY_DATABASE", str(STATE_DIR / "community.sqlite3")
        ),
        COMMUNITY_SEED_SAMPLES=True,
        COMMUNITY_SEED_EDITORIAL=os.environ.get("COMMUNITY_SEED_EDITORIAL", "1") == "1",
        COMMUNITY_ALLOW_GUESTS=os.environ.get("COMMUNITY_ALLOW_GUESTS", "0") == "1",
        COMMUNITY_IDENTITY_PROVIDER=None,
        GEMINI_API_KEY=os.environ.get("GEMINI_API_KEY", "").strip(),
        SIMULATION_API_URL=os.environ.get("SIMULATION_API_URL", SIMULATION_API_URL),
        SIMULATION_TRANSPORT=None,
        AUTH_API_URL=os.environ.get("AUTH_API_URL", SIMULATION_API_URL).strip(),
        AUTH_API_TRANSPORT=None,
        COMMUNITY_API_URL=os.environ.get("COMMUNITY_API_URL", SIMULATION_API_URL).strip(),
        COMMUNITY_API_TRANSPORT=None,
        REFERENCE_API_URL=os.environ.get("REFERENCE_API_URL", SIMULATION_API_URL).strip(),
        REFERENCE_API_TRANSPORT=None,
        ASSISTANT_API_URL=os.environ.get("ASSISTANT_API_URL", SIMULATION_API_URL).strip(),
        ASSISTANT_API_TRANSPORT=None,
    )
    if testConfig:
        app.config.update(testConfig)
    if testConfig and app.testing and "AUTH_API_URL" not in testConfig:
        app.config["AUTH_API_URL"] = ""
    if testConfig and app.testing and "COMMUNITY_API_URL" not in testConfig:
        app.config["COMMUNITY_API_URL"] = ""
        app.config["COMMUNITY_ALLOW_GUESTS"] = testConfig.get("COMMUNITY_ALLOW_GUESTS", True)
    if testConfig and app.testing and "REFERENCE_API_URL" not in testConfig:
        app.config["REFERENCE_API_URL"] = ""
    if testConfig and app.testing and "ASSISTANT_API_URL" not in testConfig:
        app.config["ASSISTANT_API_URL"] = ""
    if not app.config["SECRET_KEY"]:
        secretPath = Path(app.config["COMMUNITY_DATABASE"]).parent / ".community-secret"
        secretPath.parent.mkdir(parents=True, exist_ok=True)
        try:
            with secretPath.open("x", encoding="utf-8") as secretFile:
                secretFile.write(secrets.token_hex(32))
        except FileExistsError:
            pass
        app.config["SECRET_KEY"] = secretPath.read_text(encoding="utf-8").strip()
        if not app.config["SECRET_KEY"]:
            raise RuntimeError(
                "Community session secret is empty; configure SECRET_KEY"
            )
    auth_db_path = app.config["AGRIDATA_DB_PATH"]
    if app.testing and "AGRIDATA_DB_PATH" not in (testConfig or {}):
        auth_db_path = Path(app.config["COMMUNITY_DATABASE"]).with_name("auth-test.sqlite3")
    if app.config["AUTH_API_URL"]:
        app.extensions["auth_service"] = CloudAuthService(
            app.config["AUTH_API_URL"], app.config["AUTH_API_TRANSPORT"]
        )
    elif app.testing:
        app.extensions["auth_service"] = AuthService(
            repo=SQLiteUserRepository(
                auth_db_path, app.config["AGRIDATA_SECRET_KEY"] or app.secret_key
            ),
            seed_defaults=app.config["AGRIDATA_AUTH_DEMO"],
            allow_dev_otp=app.config["AGRIDATA_AUTH_DEMO"],
        )
    else:
        raise RuntimeError("AUTH_API_URL is required; accounts must use the cloud service")

    @app.context_processor
    def inject_auth_context() -> dict:
        auth = get_current_auth()
        if auth is None:
            return {"auth_user": None, "auth_csrf_token": ""}
        user, auth_session = auth
        return {
            "auth_user": user.to_public_dict(),
            "auth_csrf_token": auth_session.csrf_token,
        }

    if app.config["COMMUNITY_API_URL"]:
        app.extensions["communityService"] = cloudCommunityService(
            app.config["COMMUNITY_API_URL"], app.config["COMMUNITY_API_TRANSPORT"]
        )
    elif app.testing:
        app.extensions["communityService"] = communityService(
            communityModel(app.config["COMMUNITY_DATABASE"]),
            app.config["COMMUNITY_SEED_SAMPLES"],
            app.config["COMMUNITY_SEED_EDITORIAL"],
        )
    else:
        raise RuntimeError("COMMUNITY_API_URL is required; forum posts must use cloud storage")
    if app.config["REFERENCE_API_URL"]:
        app.extensions["referenceService"] = cloudReferenceService(
            app.config["REFERENCE_API_URL"], app.config["REFERENCE_API_TRANSPORT"]
        )
    elif not app.testing:
        raise RuntimeError("REFERENCE_API_URL is required; references must use the cloud service")
    if app.config["ASSISTANT_API_URL"]:
        app.extensions["assistantService"] = cloudAssistantService(
            app.config["ASSISTANT_API_URL"], app.config["ASSISTANT_API_TRANSPORT"]
        )
    elif not app.testing:
        raise RuntimeError("ASSISTANT_API_URL is required; assistant AI must use the cloud service")
    app.extensions["simulationService"] = simulationService(
        cloudClient(app.config["SIMULATION_API_URL"], app.config["SIMULATION_TRANSPORT"])
    )
    for controller in (
        community_controller,
        forum_controller,
        simulation_controller,
        auth_controller,
        assistant_controller,
        admin_controller,
    ):
        app.register_blueprint(controller.blueprint)

    @app.get("/")
    def home() -> Response:
        if get_current_auth() is None:
            return redirect("/login")
        return redirect("/community")

    @app.errorhandler(HTTPException)
    def handleRoutingError(
        error: HTTPException,
    ) -> HTTPException | tuple[Response | str, int]:
        # Routing-level 404/405 errors happen before Flask selects a blueprint.
        if request.path.startswith("/api/community/"):
            return community_controller.controller.handleHttpError(error)
        return error

    return app


create_app = createApp  # Compatibility for the existing entry point and other modules.
app = createApp()

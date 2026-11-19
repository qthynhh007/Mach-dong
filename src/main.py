import os
import secrets
from pathlib import Path

from flask import Flask, Response, redirect, request, url_for
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
from src.services.cloud_client import cloudClient
from src.services.community_service import communityService
from src.services.simulation_service import simulationService


def createApp(testConfig: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder="views", static_folder="static")
    app.config["TEMPLATES_AUTO_RELOAD"] = True
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
        COMMUNITY_ALLOW_GUESTS=os.environ.get("COMMUNITY_ALLOW_GUESTS", "1") == "1",
        COMMUNITY_IDENTITY_PROVIDER=None,
        GEMINI_API_KEY=os.environ.get("GEMINI_API_KEY", "").strip(),
        SIMULATION_API_URL=os.environ.get("SIMULATION_API_URL", SIMULATION_API_URL),
        SIMULATION_LOCAL_MODE=os.environ.get("SIMULATION_LOCAL_MODE") == "1",
        SIMULATION_TRANSPORT=None,
    )
    if testConfig:
        app.config.update(testConfig)
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
    app.extensions["auth_service"] = AuthService(
        repo=SQLiteUserRepository(
            auth_db_path, app.config["AGRIDATA_SECRET_KEY"] or app.secret_key
        ),
        seed_defaults=app.config["AGRIDATA_AUTH_DEMO"],
        allow_dev_otp=app.config["AGRIDATA_AUTH_DEMO"],
    )

    @app.context_processor
    def inject_auth_context() -> dict:
        auth = get_current_auth()
        avatar_url = url_for("static", filename="assets/co-ma/avatar-co-ma.webp")
        if auth is None:
            return {"auth_user": None, "auth_csrf_token": "", "auth_avatar_url": avatar_url}
        user, auth_session = auth
        version = app.extensions["auth_service"].repo.get_avatar_version(user.user_id)
        return {
            "auth_user": user.to_public_dict(),
            "auth_csrf_token": auth_session.csrf_token,
            "auth_avatar_url": url_for("auth.avatar_image", version=version) if version else avatar_url,
        }

    app.extensions["communityService"] = communityService(
        communityModel(app.config["COMMUNITY_DATABASE"]),
        app.config["COMMUNITY_SEED_SAMPLES"],
        app.config["COMMUNITY_SEED_EDITORIAL"],
    )
    app.extensions["simulationService"] = simulationService(
        cloudClient(
            app.config["SIMULATION_API_URL"],
            app.config["SIMULATION_TRANSPORT"],
            allow_loopback=app.config["SIMULATION_LOCAL_MODE"],
        )
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

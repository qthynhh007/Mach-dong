import os
import secrets
from pathlib import Path

from flask import Flask, Response, redirect, request
from werkzeug.exceptions import HTTPException

from src.config import MAX_CSV_BYTES, ROOT
from src.controllers import (
    admin_controller,
    assistant_controller,
    auth_controller,
    community_controller,
    forum_controller,
    simulation_controller,
)
from src.models.community import communityModel
from src.services.community_service import communityService


def createApp(testConfig: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder="views", static_folder="static")
    app.config["MAX_CONTENT_LENGTH"] = MAX_CSV_BYTES + 64_000
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        COMMUNITY_DATABASE=os.environ.get(
            "COMMUNITY_DATABASE", str(ROOT / "data" / "community.sqlite3")
        ),
        COMMUNITY_SEED_SAMPLES=True,
        COMMUNITY_ALLOW_GUESTS=os.environ.get("COMMUNITY_ALLOW_GUESTS", "1") == "1",
        COMMUNITY_IDENTITY_PROVIDER=None,
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
    app.extensions["communityService"] = communityService(
        communityModel(app.config["COMMUNITY_DATABASE"]),
        app.config["COMMUNITY_SEED_SAMPLES"],
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
    app.add_url_rule("/", view_func=lambda: redirect("/community"))

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

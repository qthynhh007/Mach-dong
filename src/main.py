from flask import Flask, redirect

from src.config import MAX_CSV_BYTES
from src.controllers import (
    admin_controller,
    assistant_controller,
    auth_controller,
    community_controller,
    forum_controller,
    simulation_controller,
)
from src.controllers.session_guard import get_current_auth
from src.services.auth_service import default_auth_service


def create_app() -> Flask:
    app = Flask(__name__, template_folder="views", static_folder="static")
    app.config["MAX_CONTENT_LENGTH"] = MAX_CSV_BYTES + 64_000

    @app.context_processor
    def inject_auth_context() -> dict:
        auth = get_current_auth(default_auth_service, require_csrf=False)
        if auth is None:
            return {"auth_user": None, "auth_csrf_token": ""}
        user, session = auth
        return {
            "auth_user": user.to_public_dict(),
            "auth_csrf_token": session.csrf_token,
        }

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
    return app


app = create_app()

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


def create_app() -> Flask:
    app = Flask(__name__, template_folder="views", static_folder="static")
    app.config["MAX_CONTENT_LENGTH"] = MAX_CSV_BYTES + 64_000
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

from flask import Blueprint, render_template

blueprint = Blueprint("assistant", __name__)


@blueprint.get("/assistant")
def assistant() -> str:
    return render_template("assistant/index.html", current_page="assistant")

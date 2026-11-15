from flask import Blueprint, render_template

blueprint = Blueprint("auth", __name__)


@blueprint.get("/login")
def login() -> str:
    return render_template("auth/login.html", current_page="login")


@blueprint.get("/register")
def register() -> str:
    return render_template("auth/register.html", current_page="register")


@blueprint.get("/profile")
def profile() -> str:
    return render_template("auth/profile.html", current_page="profile")

from flask import Blueprint, abort, render_template

from src.services.forum_service import (
    CULTIVARS,
    SAMPLE_POSTS,
    SAMPLE_REPLIES,
    STAGES,
    TOPICS,
)

blueprint = Blueprint("forum", __name__)


@blueprint.get("/forum")
def index() -> str:
    return render_template(
        "forum/index.html", current_page="forum", topics=TOPICS, posts=SAMPLE_POSTS
    )


@blueprint.get("/forum/new")
def compose() -> str:
    return render_template(
        "forum/compose.html",
        current_page="forum",
        topics=TOPICS,
        cultivars=CULTIVARS,
        stages=STAGES,
    )


@blueprint.get("/forum/<post_id>")
def detail(post_id: str) -> str:
    post = next((post for post in SAMPLE_POSTS if post["id"] == post_id), None)
    if post is None and not post_id.startswith("local-"):
        abort(404)
    return render_template(
        "forum/detail.html",
        current_page="forum",
        topics=TOPICS,
        post=post,
        post_id=post_id,
        replies=SAMPLE_REPLIES.get(post_id, ()),
    )

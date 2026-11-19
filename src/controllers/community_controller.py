"""HTTP boundary for community views, the CSV library and the discussion API."""

import secrets
import sqlite3
from io import BytesIO
from uuid import uuid4

from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    g,
    jsonify,
    render_template,
    request,
    send_file,
    session,
)
from werkzeug.exceptions import HTTPException

from src.config import MAX_CSV_BYTES
from src.controllers.session_guard import get_current_auth
from src.models.community import communityMember
from src.services.cloud_reference_service import referenceUnavailable
from src.services.community_service import communityError, communityService
from src.services.csv_library import DATASET_BY_SLUG, DATASETS
from src.services.forum_service import (
    CULTIVARS,
    DISCUSSION_TOPICS,
    EDITORIAL_AUTHOR,
    STAGES,
    TOPICS,
)
from src.services.quality_service import preview_csv


class communityController:
    def __init__(self) -> None:
        self.blueprint = Blueprint("community", __name__)
        self.forumBlueprint = Blueprint("forum", __name__)
        self.blueprint.add_url_rule("/community", "community", self.library)
        self.blueprint.add_url_rule(
            "/community/samples/<name>", "download_sample", self.downloadSample
        )
        self.blueprint.add_url_rule(
            "/api/community/datasets/<name>", "dataset_preview", self.dataset_preview
        )
        self.blueprint.add_url_rule(
            "/api/community/preview", "preview", self.previewCsv, methods=["POST"]
        )
        self.forumBlueprint.add_url_rule("/forum", "index", self.index)
        self.forumBlueprint.add_url_rule("/forum/new", "compose", self.compose)
        self.forumBlueprint.add_url_rule("/forum/<postId>", "detail", self.detail)
        self.forumBlueprint.add_url_rule("/forum/<postId>/edit", "edit", self.edit)
        for path, handler, methods in (
            ("session", self.getSession, ["GET"]),
            ("members/<path:member_id>", self.member_profile, ["GET"]),
            ("posts", self.posts, ["GET", "POST"]),
            ("posts/<postId>", self.post, ["GET", "PATCH", "DELETE"]),
            ("posts/<postId>/vote", self.postVote, ["PUT"]),
            ("posts/<postId>/replies", self.replies, ["POST"]),
            ("posts/<postId>/replies/<replyId>", self.reply, ["PATCH", "DELETE"]),
            ("posts/<postId>/replies/<replyId>/vote", self.replyVote, ["PUT"]),
            ("posts/<postId>/accepted-reply", self.acceptReply, ["PUT"]),
            ("draft", self.draft, ["GET", "PUT", "DELETE"]),
        ):
            self.blueprint.add_url_rule(
                "/api/community/" + path, handler.__name__, handler, methods=methods
            )
        self.blueprint.before_request(self.protectRequest)
        for target in (self.blueprint, self.forumBlueprint):
            target.register_error_handler(communityError, self.handleError)
            target.register_error_handler(HTTPException, self.handleHttpError)
            target.register_error_handler(sqlite3.Error, self.handleDatabaseError)
            target.register_error_handler(referenceUnavailable, self.handleReferenceError)
            target.after_request(self.responseHeaders)

    def service(self) -> communityService:
        return current_app.extensions["communityService"]

    def currentMember(self) -> communityMember | None:
        if "communityMember" in g:
            return g.communityMember
        provider = current_app.config.get("COMMUNITY_IDENTITY_PROVIDER")
        member = provider() if provider else None
        if member is not None and not isinstance(member, communityMember):
            raise RuntimeError(
                "COMMUNITY_IDENTITY_PROVIDER must return communityMember or None"
            )
        if member is not None and member.id == EDITORIAL_AUTHOR:
            raise RuntimeError("Danh tính Admin hệ thống dành cho bài tham khảo.")
        if provider is None:
            auth = get_current_auth()
            if auth:
                user, _ = auth
                member = communityMember("user:" + user.user_id, user.name)
        if provider is None and member is None and not current_app.config["COMMUNITY_API_URL"] and session.get("userId"):
            member = communityMember(
                "user:" + str(session["userId"]),
                str(session.get("displayName", "Thành viên")),
                str(session.get("location", "")),
            )
        if member is None and current_app.config["COMMUNITY_ALLOW_GUESTS"]:
            guestId = session.setdefault("communityGuestId", str(uuid4()))
            member = communityMember(
                "guest:" + guestId, "Khách " + guestId[:6], isGuest=True
            )
        if member:
            self.service().registerMember(member)
        g.communityMember = member
        return member

    def memberId(self, required: bool = False) -> str:
        member = self.currentMember()
        if required and member is None:
            raise communityError("Hãy đăng nhập để tham gia thảo luận.", 401)
        return member.id if member else ""

    def csrfToken(self) -> str:
        if "communityCsrfToken" not in session:
            session["communityCsrfToken"] = secrets.token_urlsafe(32)
        return session["communityCsrfToken"]

    def protectRequest(self) -> None:
        if request.path == "/api/community/preview" or request.method in (
            "GET",
            "HEAD",
            "OPTIONS",
        ):
            return
        self.memberId(required=True)
        token = request.headers.get("X-CSRF-Token", "")
        if (
            not secrets.compare_digest(
                token.encode(), session.get("communityCsrfToken", "").encode()
            )
            or not token
        ):
            raise communityError(
                "Phiên gửi đã hết hạn. Hãy tải lại trang rồi thử lại.", 403
            )

    def jsonPayload(self) -> dict:
        if not request.is_json:
            raise communityError("Yêu cầu phải có nội dung JSON.", 415)
        payload = request.get_json()
        if not isinstance(payload, dict):
            raise communityError("Nội dung JSON phải là một đối tượng.")
        return payload

    def respond(self, data: object, statusCode: int = 200) -> tuple[Response, int]:
        return jsonify(data=data, error=None), statusCode

    def handleError(self, error: communityError) -> tuple[Response | str, int]:
        if request.path.startswith("/api/"):
            return jsonify(data=None, error=str(error)), error.statusCode
        return render_template(
            "forum/error.html", current_page="forum", message=str(error)
        ), error.statusCode

    def handleHttpError(self, error: HTTPException) -> tuple[Response | str, int]:
        messages = {
            400: "Nội dung yêu cầu không hợp lệ.",
            404: "Không tìm thấy tài nguyên.",
            405: "Phương thức gửi không được hỗ trợ.",
            413: "Nội dung vượt giới hạn dung lượng.",
            415: "Định dạng yêu cầu không được hỗ trợ.",
        }
        return self.handleError(
            communityError(
                messages.get(error.code, "Không thể xử lý yêu cầu."), error.code or 500
            )
        )

    def handleDatabaseError(self, error: sqlite3.Error) -> tuple[Response | str, int]:
        current_app.logger.exception("Community database error")
        return self.handleError(
            communityError("Chưa lưu được dữ liệu. Hãy thử lại sau.", 503)
        )

    def handleReferenceError(self, error: referenceUnavailable) -> tuple[Response | str, int]:
        return self.handleError(communityError(str(error), 503))

    def responseHeaders(self, response: Response) -> Response:
        if request.path.startswith("/api/community/") or request.path.startswith(
            "/forum"
        ):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def pageData(self) -> dict:
        member = self.currentMember()
        return {
            "member": member.toDict() if member else None,
            "csrfToken": self.csrfToken(),
            "topics": TOPICS,
        }

    def library(self) -> str:
        return render_template(
            "community/index.html", current_page="community",
            datasets=[(dataset, dataset.preview()["row_count"]) for dataset in DATASETS],
        )

    def downloadSample(self, name: str) -> Response:
        dataset = DATASET_BY_SLUG.get(name)
        if dataset is None:
            abort(404)
        return send_file(BytesIO(dataset.readBytes()), as_attachment=True, mimetype="text/csv", download_name=dataset.path.name)

    def dataset_preview(self, name: str) -> tuple[Response, int]:
        dataset = DATASET_BY_SLUG.get(name)
        if dataset is None:
            raise communityError("Không tìm thấy bộ dữ liệu.", 404)
        return self.respond(dataset.preview())

    def previewCsv(self) -> tuple[Response, int]:
        upload = request.files.get("file")
        if (
            not upload
            or not upload.filename
            or not upload.filename.lower().endswith(".csv")
        ):
            return jsonify(data=None, error="Hãy chọn tệp CSV."), 400
        try:
            data = preview_csv(upload.stream.read(MAX_CSV_BYTES + 1))
        except ValueError as error:
            return jsonify(data=None, error=str(error)), 400
        return self.respond(data)

    def index(self) -> str:
        forumData = self.pageData()
        featured = self.service().listPosts(
            self.memberId(), {"sort": "helpful", "pageSize": 3}
        )
        return render_template(
            "forum/index.html",
            current_page="forum",
            topics=TOPICS,
            posts=featured["items"],
            forumData=forumData,
        )

    def compose(self) -> str:
        forumData = self.pageData()
        forumData["draft"] = (
            self.service().getDraft(self.memberId())
            if forumData["member"]
            else {"payload": None, "version": 0}
        )
        return render_template(
            "forum/compose.html",
            current_page="forum",
            topics=DISCUSSION_TOPICS,
            cultivars=CULTIVARS,
            stages=STAGES,
            forumData=forumData,
        )

    def detail(self, postId: str) -> str:
        forumData = self.pageData()
        forumData.update(self.service().getPost(postId, self.memberId()))
        return render_template(
            "forum/detail.html", current_page="forum", forumData=forumData
        )

    def edit(self, postId: str) -> str:
        forumData = self.pageData()
        post = self.service().getPost(postId, self.memberId(required=True))["post"]
        self.service().requireOwner(post, self.memberId())
        forumData["post"] = post
        return render_template(
            "forum/compose.html",
            current_page="forum",
            topics=DISCUSSION_TOPICS,
            cultivars=CULTIVARS,
            stages=STAGES,
            forumData=forumData,
        )

    def getSession(self) -> tuple[Response, int]:
        return self.respond(self.pageData())

    def member_profile(self, member_id: str) -> tuple[Response, int]:
        return self.respond(self.service().member_profile(member_id))

    def posts(self) -> tuple[Response, int]:
        if request.method in ("GET", "HEAD"):
            return self.respond(self.service().listPosts(self.memberId(), request.args))
        return self.respond(
            self.service().createPost(self.memberId(True), self.jsonPayload()), 201
        )

    def post(self, postId: str) -> tuple[Response, int]:
        if request.method in ("GET", "HEAD"):
            return self.respond(self.service().getPost(postId, self.memberId()))
        action = (
            self.service().deletePost
            if request.method == "DELETE"
            else self.service().updatePost
        )
        return self.respond(action(postId, self.memberId(True), self.jsonPayload()))

    def postVote(self, postId: str) -> tuple[Response, int]:
        return self.respond(
            self.service().vote(postId, self.memberId(True), self.jsonPayload())
        )

    def replies(self, postId: str) -> tuple[Response, int]:
        return self.respond(
            self.service().createReply(postId, self.memberId(True), self.jsonPayload()),
            201,
        )

    def reply(self, postId: str, replyId: str) -> tuple[Response, int]:
        return self.respond(
            self.service().updateReply(
                postId,
                replyId,
                self.memberId(True),
                self.jsonPayload(),
                request.method == "DELETE",
            )
        )

    def replyVote(self, postId: str, replyId: str) -> tuple[Response, int]:
        return self.respond(
            self.service().vote(
                postId, self.memberId(True), self.jsonPayload(), replyId
            )
        )

    def acceptReply(self, postId: str) -> tuple[Response, int]:
        return self.respond(
            self.service().acceptReply(postId, self.memberId(True), self.jsonPayload())
        )

    def draft(self) -> tuple[Response, int]:
        memberId = self.memberId(True)
        if request.method in ("GET", "HEAD"):
            return self.respond(self.service().getDraft(memberId))
        action = (
            self.service().saveDraft
            if request.method == "PUT"
            else self.service().deleteDraft
        )
        return self.respond(action(memberId, self.jsonPayload()))


controller = communityController()
blueprint = controller.blueprint

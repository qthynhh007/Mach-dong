"""Forum client for the shared cloud database and photo store."""

import json
from urllib import error, parse, request

from flask import request as flask_request

from src.config import SESSION_COOKIE_NAME
from src.controllers.session_guard import get_current_auth
from src.services.community_service import communityError, communityService
from src.services.http_transport import default_urlopen


class cloudCommunityService(communityService):
    def __init__(self, api_url: str, transport=None) -> None:
        self.api_url = api_url.rstrip("/")
        if not self.api_url.startswith("https://"):
            raise ValueError("Cloud forum API must use HTTPS")
        self.transport = transport or default_urlopen

    def registerMember(self, member) -> None:
        # The cloud validates the account session and owns the member record.
        del member

    def call(self, route: str, method: str = "GET", payload: dict | None = None) -> dict:
        headers = {"Accept": "application/json", "User-Agent": "MachDongDesktop/2.0"}
        token = flask_request.cookies.get(SESSION_COOKIE_NAME)
        if token:
            headers["Authorization"] = "Bearer " + token
        if method != "GET":
            auth = get_current_auth()
            if auth is None:
                raise communityError("Hãy đăng nhập để tham gia thảo luận.", 401)
            headers["X-CSRF-Token"] = auth[1].csrf_token
            headers["Content-Type"] = "application/json"
        req = request.Request(
            self.api_url + "/api/community/" + route,
            data=json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
            if method != "GET" else None,
            headers=headers,
            method=method,
        )
        try:
            with self.transport(req, timeout=18) as response:
                body = json.load(response)
        except error.HTTPError as exc:
            try:
                body = json.load(exc)
                message = body.get("error") or "Máy chủ từ chối yêu cầu."
            except (ValueError, UnicodeError):
                message = "Máy chủ từ chối yêu cầu."
            raise communityError(message, exc.code) from exc
        except (error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise communityError(
                "Không kết nối được diễn đàn trên máy chủ. Vui lòng thử lại khi có Internet.",
                503,
            ) from exc
        if not isinstance(body, dict) or body.get("error"):
            raise communityError("Phản hồi diễn đàn trên máy chủ không hợp lệ.", 503)
        return body.get("data")

    @staticmethod
    def path(value: str) -> str:
        return parse.quote(value, safe="")

    def member_profile(self, member_id: str) -> dict:
        return self.call("members/" + self.path(member_id))

    def listPosts(self, memberId: str, options: dict) -> dict:
        del memberId
        query = parse.urlencode({key: str(options[key]) for key in ("q", "topic", "sort", "status", "mine", "page", "pageSize") if key in options})
        return self.call("posts" + ("?" + query if query else ""))

    def getPost(self, postId: str, memberId: str) -> dict:
        del memberId
        return self.call("posts/" + self.path(postId))

    def createPost(self, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("posts", "POST", payload)

    def updatePost(self, postId: str, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("posts/" + self.path(postId), "PATCH", payload)

    def deletePost(self, postId: str, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("posts/" + self.path(postId), "DELETE", payload)

    def createReply(self, postId: str, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("posts/" + self.path(postId) + "/replies", "POST", payload)

    def updateReply(self, postId: str, replyId: str, memberId: str, payload: dict, delete: bool = False) -> dict:
        del memberId
        return self.call("posts/" + self.path(postId) + "/replies/" + self.path(replyId), "DELETE" if delete else "PATCH", payload)

    def vote(self, postId: str, memberId: str, payload: dict, replyId: str | None = None) -> dict:
        del memberId
        route = "posts/" + self.path(postId)
        if replyId:
            route += "/replies/" + self.path(replyId)
        return self.call(route + "/vote", "PUT", payload)

    def acceptReply(self, postId: str, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("posts/" + self.path(postId) + "/accepted-reply", "PUT", payload)

    def getDraft(self, memberId: str) -> dict:
        del memberId
        return self.call("draft")

    def saveDraft(self, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("draft", "PUT", payload)

    def deleteDraft(self, memberId: str, payload: dict) -> dict:
        del memberId
        return self.call("draft", "DELETE", payload)

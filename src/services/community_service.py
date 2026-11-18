"""Community business rules, independent of Flask and HTTP."""

import base64
import binascii
import json
import re
from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from src.models.community import communityMember, communityModel, communityStore
from src.services.forum_service import (
    CULTIVARS,
    DISCUSSION_TOPICS,
    EDITORIAL_AUTHOR,
    EDITORIAL_POSTS,
    POST_PHOTOS,
    SAMPLE_POSTS,
    SAMPLE_REPLIES,
    STAGES,
    TOPICS,
)

class communityError(ValueError):
    def __init__(self, message: str, statusCode: int = 400) -> None:
        super().__init__(message)
        self.statusCode = statusCode


class communityService:
    def __init__(
        self, model: communityModel, seedSamples: bool = True, seedEditorial: bool = True
    ) -> None:
        self.model = model
        if seedSamples:
            self.seedSamples()
        if seedEditorial:
            self.seedEditorial()

    def now(self) -> str:
        return datetime.now(UTC).isoformat(timespec="microseconds")

    def seedSamples(self) -> None:
        with self.model.transaction() as store:
            if store.isSeeded():
                return
            createdAt = self.now()
            for index, post in enumerate(SAMPLE_POSTS):
                member = communityMember(
                    "sample-" + str(index), post["author"], post["location"]
                )
                store.saveMember(member)
                store.insertPost(
                    {
                        **post,
                        "authorId": member.id,
                        "isSample": True,
                        "photos": json.dumps(post["photos"]),
                        "baseScore": post["score"],
                        "createdAt": createdAt,
                        "updatedAt": createdAt,
                        "requestId": post["id"],
                    }
                )
                for replyIndex, reply in enumerate(SAMPLE_REPLIES.get(post["id"], ())):
                    replyId = f"sample-{post['id']}-{replyIndex}"
                    replyMember = communityMember(replyId, reply["author"])
                    store.saveMember(replyMember)
                    store.insertReply(
                        {
                            **reply,
                            "id": replyId,
                            "postId": post["id"],
                            "authorId": replyMember.id,
                            "parentId": None,
                            "createdAt": createdAt,
                            "updatedAt": createdAt,
                            "requestId": replyId,
                        }
                    )
            store.markSeeded()

    def seedEditorial(self) -> None:
        with self.model.transaction() as store:
            if store.isSeeded("editorial-v1"):
                return
            store.saveMember(communityMember(EDITORIAL_AUTHOR, "Admin"))
            createdAt = self.now()
            for postId, source in EDITORIAL_POSTS.items():
                store.insertPost(
                    {
                        "id": postId,
                        "requestId": postId,
                        "authorId": EDITORIAL_AUTHOR,
                        "topic": "references",
                        "title": source["title"],
                        "body": f"Tài liệu của {source['byline']}.\n{source['date']}.",
                        "cultivar": "",
                        "stage": "",
                        "photos": "[]",
                        "isSample": False,
                        "baseScore": 0,
                        "createdAt": createdAt,
                        "updatedAt": createdAt,
                    }
                )
            store.markSeeded("editorial-v1")

    def registerMember(self, member: communityMember) -> None:
        with self.model.transaction() as store:
            store.saveMember(member)

    def member_profile(self, member_id: str) -> dict:
        with self.model.transaction(write=False) as store:
            profile = store.member_profile(member_id)
        if profile is None:
            raise communityError("Chưa tìm thấy hồ sơ công khai của thành viên.", 404)
        if member_id == EDITORIAL_AUTHOR:
            role = "Admin diễn đàn"
        elif member_id.startswith("sample-"):
            role = "Hồ sơ minh họa"
        else:
            role = "Khách diễn đàn" if profile["isGuest"] else "Thành viên diễn đàn"
        profile.pop("isGuest")
        return {**profile, "role": role}

    def textField(
        self, payload: dict, field: str, label: str, limit: int, required: bool = True
    ) -> str:
        value = payload.get(field, "")
        if not isinstance(value, str):
            raise communityError(f"{label} phải là văn bản.")
        value = value.strip()
        if required and not value:
            raise communityError(f"Hãy nhập {label.lower()}.")
        if len(value) > limit or "\x00" in value:
            raise communityError(
                f"{label} tối đa {limit} ký tự và không chứa ký tự rỗng."
            )
        return value

    def validatePhotos(self, photos: object) -> list[str]:
        if not isinstance(photos, list) or len(photos) > 4:
            raise communityError("Mỗi bài có tối đa 4 ảnh.")
        validated = []
        for photo in photos:
            if photo in (
                "/static/assets/stitch-forum-field.jpg",
                "/static/assets/stitch-forum-roots.jpg",
            ):
                validated.append(photo)
                continue
            if (
                not isinstance(photo, str)
                or len(photo) > 240_000
                or not photo.startswith("data:image/jpeg;base64,")
            ):
                raise communityError(
                    "Ảnh không hợp lệ. Hãy chọn lại ảnh JPG, PNG hoặc WebP."
                )
            try:
                raw = base64.b64decode(photo.split(",", 1)[1], validate=True)
                with Image.open(BytesIO(raw)) as source:
                    if source.format != "JPEG" or max(source.size) > 800:
                        raise communityError(
                            "Ảnh tải lên phải được thu nhỏ tối đa 800 pixel."
                        )
                    source.load()
                    output = BytesIO()
                    source.convert("RGB").save(output, format="JPEG", quality=85)
                # Re-encode to remove metadata and trailing non-image content.
                encoded = "data:image/jpeg;base64," + base64.b64encode(
                    output.getvalue()
                ).decode("ascii")
                if len(encoded) > 240_000:
                    raise communityError("Ảnh quá lớn, hãy giảm kích thước ảnh.")
                validated.append(encoded)
            except (
                Image.DecompressionBombError,
                ValueError,
                OSError,
                binascii.Error,
                UnidentifiedImageError,
            ) as error:
                if isinstance(error, communityError):
                    raise
                raise communityError("Không đọc được ảnh đính kèm.") from error
        return validated

    def postFields(self, payload: dict, draft: bool = False) -> dict:
        fields = {
            "title": self.textField(payload, "title", "Tiêu đề", 120, not draft),
            "body": self.textField(payload, "body", "Nội dung", 5000, not draft),
            "photos": json.dumps(self.validatePhotos(payload.get("photos", []))),
        }
        for field, options, label in (
            ("topic", DISCUSSION_TOPICS, "Chủ đề"),
            ("cultivar", CULTIVARS, "Giống lúa"),
            ("stage", STAGES, "Giai đoạn"),
        ):
            value = payload.get(field)
            if not isinstance(value, str) or value not in options:
                raise communityError(label + " không hợp lệ.")
            fields[field] = value
        return fields

    def requestId(self, payload: dict) -> str:
        value = payload.get("requestId", str(uuid4()))
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9-]{8,80}", value):
            raise communityError("Mã yêu cầu không hợp lệ.")
        return value

    def requirePost(self, store: communityStore, postId: str, memberId: str) -> dict:
        post = store.getPost(postId, memberId)
        if post is None:
            raise communityError("Không tìm thấy bài viết hoặc bài đã bị xóa.", 404)
        return post

    def requireReply(
        self, store: communityStore, postId: str, replyId: str, memberId: str
    ) -> dict:
        reply = store.getReply(replyId, memberId)
        if reply is None or reply["postId"] != postId or reply["isDeleted"]:
            raise communityError(
                "Không tìm thấy câu trả lời hoặc câu trả lời đã bị xóa.", 404
            )
        return reply

    def requireOwner(self, item: dict, memberId: str) -> None:
        if item["authorId"] != memberId:
            raise communityError("Chỉ tác giả mới được thực hiện thao tác này.", 403)

    def requireVersion(self, item: dict, payload: dict) -> None:
        version = payload.get("version")
        if type(version) is not int or version < 0:
            raise communityError("Thiếu phiên bản dữ liệu hợp lệ.")
        if version != item["version"]:
            raise communityError(
                "Nội dung đã thay đổi ở phiên khác. Hãy tải lại trước khi sửa.", 409
            )

    def presentPost(self, post: dict, memberId: str, summary: bool = False) -> dict:
        post = dict(post)
        post["photos"] = json.loads(post["photos"])
        post["canEdit"] = post["authorId"] == memberId
        post["canVote"] = bool(memberId) and not post["canEdit"]
        post["voted"] = bool(post["voted"])
        post["isSample"] = bool(post["isSample"])
        if post["authorId"] == EDITORIAL_AUTHOR and post["id"] in EDITORIAL_POSTS:
            post["sourceUrl"] = EDITORIAL_POSTS[post["id"]]["url"]
        if post["authorId"] == EDITORIAL_AUTHOR or post["isSample"]:
            if photo := POST_PHOTOS.get(post["id"]):
                post["photos"] = [photo["src"]]
                post["photoCredits"] = {photo["src"]: photo}
        post.pop("requestId", None)
        if summary:
            post["body"] = post["body"][:300] + ("…" if len(post["body"]) > 300 else "")
            post["photos"] = post["photos"][:1]
        return post

    def listPosts(self, memberId: str, options: dict) -> dict:
        filters = {
            "q": options.get("q", "").strip(),
            "topic": options.get("topic", ""),
            "sort": options.get("sort", "newest"),
            "status": options.get("status", ""),
            "mine": options.get("mine", "0") == "1",
        }
        if len(filters["q"]) > 200 or (
            filters["topic"] and filters["topic"] not in TOPICS
        ):
            raise communityError("Từ khóa hoặc chủ đề không hợp lệ.")
        if filters["sort"] not in ("newest", "oldest", "helpful") or filters[
            "status"
        ] not in ("", "unanswered", "solved"):
            raise communityError("Bộ lọc không hợp lệ.")
        try:
            filters["page"] = int(options.get("page", 1))
            filters["pageSize"] = int(options.get("pageSize", 10))
        except (ValueError, TypeError) as error:
            raise communityError("Số trang không hợp lệ.") from error
        if not 1 <= filters["page"] <= 100_000 or not 1 <= filters["pageSize"] <= 30:
            raise communityError("Số trang phải dương, mỗi trang từ 1 đến 30 bài.")
        with self.model.transaction(write=False) as store:
            posts, total = store.listPosts(memberId, filters)
        return {
            "items": [self.presentPost(post, memberId, True) for post in posts],
            "total": total,
            "page": filters["page"],
            "pageSize": filters["pageSize"],
            "totalPages": (total + filters["pageSize"] - 1) // filters["pageSize"],
        }

    def getPost(self, postId: str, memberId: str) -> dict:
        with self.model.transaction(write=False) as store:
            post = self.requirePost(store, postId, memberId)
            replies = store.listReplies(postId, memberId)
        for reply in replies:
            reply.pop("requestId", None)
            reply["canEdit"] = reply["authorId"] == memberId and not reply["isDeleted"]
            reply["canVote"] = (
                bool(memberId)
                and reply["authorId"] != memberId
                and not reply["isDeleted"]
            )
            reply["isAccepted"] = post["acceptedReplyId"] == reply["id"]
            reply["canAccept"] = (
                post["authorId"] == memberId
                and reply["parentId"] is None
                and not reply["isDeleted"]
            )
        return {"post": self.presentPost(post, memberId), "replies": replies}

    def createPost(self, memberId: str, payload: dict) -> dict:
        fields = self.postFields(payload)
        requestId = self.requestId(payload)
        with self.model.transaction() as store:
            postId = store.findPostRequest(memberId, requestId)
            if postId is None:
                postId = str(uuid4())
                createdAt = self.now()
                store.insertPost(
                    {
                        **fields,
                        "id": postId,
                        "authorId": memberId,
                        "createdAt": createdAt,
                        "updatedAt": createdAt,
                        "isSample": False,
                        "baseScore": 0,
                        "requestId": requestId,
                    }
                )
                if type(payload.get("draftVersion")) is int:
                    store.deleteDraft(memberId, payload["draftVersion"])
            post = store.getPost(postId, memberId)
        return self.presentPost(post, memberId)

    def updatePost(self, postId: str, memberId: str, payload: dict) -> dict:
        fields = self.postFields(payload)
        with self.model.transaction() as store:
            post = self.requirePost(store, postId, memberId)
            self.requireOwner(post, memberId)
            self.requireVersion(post, payload)
            store.updatePost(postId, fields, self.now())
            post = store.getPost(postId, memberId)
        return self.presentPost(post, memberId)

    def deletePost(self, postId: str, memberId: str, payload: dict) -> dict:
        with self.model.transaction() as store:
            post = self.requirePost(store, postId, memberId)
            self.requireOwner(post, memberId)
            self.requireVersion(post, payload)
            store.deletePost(postId)
        return {"deleted": True}

    def createReply(self, postId: str, memberId: str, payload: dict) -> dict:
        body = self.textField(payload, "body", "Câu trả lời", 5000)
        requestId = self.requestId(payload)
        parentId = payload.get("parentId")
        if parentId is not None and (
            not isinstance(parentId, str) or len(parentId) > 100
        ):
            raise communityError("Câu trả lời gốc không hợp lệ.")
        with self.model.transaction() as store:
            self.requirePost(store, postId, memberId)
            existing = store.findReplyRequest(memberId, requestId)
            if existing:
                if existing["postId"] != postId:
                    raise communityError("Mã yêu cầu đã được sử dụng.", 409)
                return {"id": existing["id"]}
            if parentId:
                parent = self.requireReply(store, postId, parentId, memberId)
                depth = 1
                while parent["parentId"]:
                    depth += 1
                    parent = store.getReply(parent["parentId"])
                if depth > 5:
                    raise communityError(
                        "Chuỗi trao đổi tối đa 5 cấp. Hãy trả lời ở cấp trước."
                    )
            replyId = str(uuid4())
            createdAt = self.now()
            store.insertReply(
                {
                    "id": replyId,
                    "postId": postId,
                    "authorId": memberId,
                    "parentId": parentId or None,
                    "body": body,
                    "createdAt": createdAt,
                    "updatedAt": createdAt,
                    "requestId": requestId,
                }
            )
        return {"id": replyId}

    def updateReply(
        self,
        postId: str,
        replyId: str,
        memberId: str,
        payload: dict,
        delete: bool = False,
    ) -> dict:
        body = "" if delete else self.textField(payload, "body", "Câu trả lời", 5000)
        with self.model.transaction() as store:
            reply = self.requireReply(store, postId, replyId, memberId)
            self.requireOwner(reply, memberId)
            self.requireVersion(reply, payload)
            store.updateReply(replyId, body, self.now(), delete)
        return {"id": replyId, "deleted": delete}

    def vote(
        self, postId: str, memberId: str, payload: dict, replyId: str | None = None
    ) -> dict:
        active = payload.get("active")
        if type(active) is not bool:
            raise communityError("Trạng thái hữu ích phải là true hoặc false.")
        with self.model.transaction() as store:
            item = (
                self.requireReply(store, postId, replyId, memberId)
                if replyId
                else self.requirePost(store, postId, memberId)
            )
            if item["authorId"] == memberId:
                raise communityError(
                    "Bạn không thể tự đánh dấu nội dung của mình là hữu ích.", 403
                )
            store.setVote("reply" if replyId else "post", item["id"], memberId, active)
            item = (
                store.getReply(replyId, memberId)
                if replyId
                else store.getPost(postId, memberId)
            )
        return {"score": item["score"], "voted": bool(item["voted"])}

    def acceptReply(self, postId: str, memberId: str, payload: dict) -> dict:
        replyId = payload.get("replyId")
        if replyId is not None and not isinstance(replyId, str):
            raise communityError("Câu trả lời không hợp lệ.")
        with self.model.transaction() as store:
            post = self.requirePost(store, postId, memberId)
            self.requireOwner(post, memberId)
            self.requireVersion(post, payload)
            if replyId is not None:
                reply = self.requireReply(store, postId, replyId, memberId)
                if reply["parentId"] is not None:
                    raise communityError("Chỉ chọn câu trả lời trực tiếp cho bài viết.")
            store.setAcceptedReply(postId, replyId, self.now())
            post = store.getPost(postId, memberId)
        return self.presentPost(post, memberId)

    def getDraft(self, memberId: str) -> dict:
        with self.model.transaction(write=False) as store:
            draft = store.getDraft(memberId)
        return (
            {
                "payload": json.loads(draft["payload"]),
                "version": draft["version"],
                "updatedAt": draft["updatedAt"],
            }
            if draft
            else {"payload": None, "version": 0}
        )

    def saveDraft(self, memberId: str, payload: dict) -> dict:
        fields = self.postFields(payload, draft=True)
        fields["photos"] = json.loads(fields["photos"])
        with self.model.transaction() as store:
            current = store.getDraft(memberId) or {"version": 0}
            self.requireVersion(current, payload)
            version = current["version"] + 1
            updatedAt = self.now()
            store.saveDraft(memberId, json.dumps(fields), version, updatedAt)
        return {"payload": fields, "version": version, "updatedAt": updatedAt}

    def deleteDraft(self, memberId: str, payload: dict) -> dict:
        with self.model.transaction() as store:
            draft = store.getDraft(memberId) or {"version": 0}
            self.requireVersion(draft, payload)
            store.deleteDraft(memberId, draft["version"])
            remaining = store.getDraft(memberId)
        return {"deleted": True, "version": remaining["version"] if remaining else 0}

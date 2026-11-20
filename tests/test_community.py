"""Exercise real HTTP requests, independent sessions and persistent SQLite data."""

import base64
import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from PIL import Image

from src.main import createApp
from src.models.community import communityMember
from src.services.community_service import communityError
from workspace_helpers import sign_in


class communityTests(TestCase):
    def setUp(self) -> None:
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = {
            "TESTING": True,
            "SECRET_KEY": "community-tests-only",
            "COMMUNITY_DATABASE": str(Path(self.directory.name) / "community.sqlite3"),
            "COMMUNITY_SEED_SAMPLES": False,
            "COMMUNITY_SEED_EDITORIAL": False,
            "COMMUNITY_ALLOW_GUESTS": True,
        }
        self.app = createApp(self.config)
        self.owner = self.app.test_client()
        self.reader = self.app.test_client()
        sign_in(self.owner, "test_owner")
        sign_in(self.reader, "test_reader")
        self.ownerSession = self.owner.get("/api/community/session").json["data"]
        self.readerSession = self.reader.get("/api/community/session").json["data"]

    def send(self, client, path: str, method: str, payload: dict):
        token = client.get("/api/community/session").json["data"]["csrfToken"]
        return client.open(
            "/api/community/" + path,
            method=method,
            json=payload,
            headers={"X-CSRF-Token": token},
        )

    def payload(self, **changes) -> dict:
        return {
            "title": "Hỏi về nước ruộng ở Đồng Tháp",
            "body": "Đo độ mặn thế nào cho đúng?",
            "topic": "water",
            "cultivar": "OM5451",
            "stage": "Đẻ nhánh",
            "photos": [],
            **changes,
        }

    def createPost(self, client=None, **changes) -> dict:
        result = self.send(
            client or self.owner, "posts", "POST", self.payload(**changes)
        )
        self.assertEqual(result.status_code, 201, result.json)
        return result.json["data"]

    def createReply(self, postId: str, client=None, **changes) -> dict:
        response = self.send(
            client or self.reader,
            f"posts/{postId}/replies",
            "POST",
            {"body": "Nên ghi riêng giờ đo ở từng điểm.", **changes},
        )
        self.assertEqual(response.status_code, 201, response.json)
        return response.json["data"]

    def detail(self, postId: str, client=None) -> dict:
        response = (client or self.owner).get("/api/community/posts/" + postId)
        self.assertEqual(response.status_code, 200, response.json)
        return response.json["data"]

    def testPostPersistsAcrossClientsAndAppRestart(self) -> None:
        post = self.createPost(
            author="Impersonated author", authorId="sample-0", score=999
        )
        self.assertEqual(post["author"], self.ownerSession["member"]["displayName"])
        self.assertEqual(post["score"], 0)
        self.assertFalse(post["isSample"])
        self.assertTrue(post["canEdit"])
        other = self.detail(post["id"], self.reader)["post"]
        self.assertFalse(other["canEdit"])
        self.assertEqual(other["title"], post["title"])
        restarted = createApp(self.config).test_client()
        sign_in(restarted, "test_owner")
        self.assertEqual(
            restarted.get("/api/community/posts/" + post["id"]).json["data"]["post"][
                "body"
            ],
            post["body"],
        )
        self.assertEqual(restarted.get("/forum/" + post["id"]).status_code, 200)

    def testPostOwnershipAndStaleEdits(self) -> None:
        post = self.createPost()
        path = "posts/" + post["id"]
        for method, payload in (
            ("PATCH", self.payload(version=1)),
            ("DELETE", {"version": 1}),
        ):
            self.assertEqual(
                self.send(self.reader, path, method, payload).status_code, 403
            )
        self.assertEqual(
            self.reader.get("/forum/" + post["id"] + "/edit").status_code, 403
        )
        updated = self.send(
            self.owner, path, "PATCH", self.payload(title="Tiêu đề đã sửa", version=1)
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json["data"]["version"], 2)
        self.assertEqual(
            self.send(self.owner, path, "PATCH", self.payload(version=1)).status_code,
            409,
        )
        self.assertEqual(
            self.send(self.owner, path, "DELETE", {"version": 1}).status_code, 409
        )
        self.assertEqual(self.detail(post["id"])["post"]["title"], "Tiêu đề đã sửa")

    def testDeletePostCascadesRepliesAndVotes(self) -> None:
        post = self.createPost()
        reply = self.createReply(post["id"])
        self.createReply(post["id"], self.owner, parentId=reply["id"])
        self.send(self.reader, f"posts/{post['id']}/vote", "PUT", {"active": True})
        selected = self.send(
            self.owner,
            f"posts/{post['id']}/accepted-reply",
            "PUT",
            {"replyId": reply["id"], "version": 1},
        )
        response = self.send(
            self.owner,
            "posts/" + post["id"],
            "DELETE",
            {"version": selected.json["data"]["version"]},
        )
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(
            self.owner.get("/api/community/posts/" + post["id"]).status_code, 404
        )
        self.assertEqual(self.owner.get("/forum/" + post["id"]).status_code, 404)
        with self.app.extensions["communityService"].model.transaction(False) as store:
            self.assertEqual(store.listReplies(post["id"], ""), [])

    def testNestedRepliesAcceptanceAndSoftDelete(self) -> None:
        post = self.createPost()
        reply = self.createReply(post["id"])
        child = self.createReply(post["id"], self.owner, parentId=reply["id"])
        acceptPath = f"posts/{post['id']}/accepted-reply"
        self.assertEqual(
            self.send(
                self.reader, acceptPath, "PUT", {"replyId": reply["id"], "version": 1}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.send(
                self.owner, acceptPath, "PUT", {"replyId": child["id"], "version": 1}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.send(
                self.owner, acceptPath, "PUT", {"replyId": reply["id"], "version": 1}
            ).status_code,
            200,
        )
        detail = self.detail(post["id"])
        self.assertEqual(detail["post"]["answerCount"], 1)
        self.assertEqual(detail["post"]["acceptedReplyId"], reply["id"])
        self.assertTrue(
            next(item for item in detail["replies"] if item["id"] == reply["id"])[
                "isAccepted"
            ]
        )
        result = self.send(
            self.reader,
            f"posts/{post['id']}/replies/{reply['id']}",
            "DELETE",
            {"version": 1},
        )
        self.assertEqual(result.status_code, 200)
        detail = self.detail(post["id"])
        self.assertIsNone(detail["post"]["acceptedReplyId"])
        self.assertEqual(len(detail["replies"]), 2)
        self.assertEqual(detail["post"]["answerCount"], 0)
        self.assertEqual(
            next(item for item in detail["replies"] if item["id"] == reply["id"])[
                "body"
            ],
            "",
        )
        self.assertEqual(
            next(item for item in detail["replies"] if item["id"] == child["id"])[
                "parentId"
            ],
            reply["id"],
        )

    def testReplaceAndClearAcceptedAnswer(self) -> None:
        post = self.createPost()
        replies = [self.createReply(post["id"]) for _ in range(2)]
        for version, replyId in enumerate(
            [replies[0]["id"], replies[1]["id"], None], 1
        ):
            response = self.send(
                self.owner,
                f"posts/{post['id']}/accepted-reply",
                "PUT",
                {"replyId": replyId, "version": version},
            )
            self.assertEqual(response.status_code, 200)
            detail = self.detail(post["id"])
            self.assertEqual(
                sum(item["isAccepted"] for item in detail["replies"]),
                int(replyId is not None),
            )

    def testReplyOwnershipAndEditConflict(self) -> None:
        post = self.createPost()
        reply = self.createReply(post["id"])
        path = f"posts/{post['id']}/replies/{reply['id']}"
        self.assertEqual(
            self.send(
                self.owner, path, "PATCH", {"body": "Sửa trái phép", "version": 1}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.send(self.owner, path, "DELETE", {"version": 1}).status_code, 403
        )
        self.assertEqual(
            self.send(
                self.reader, path, "PATCH", {"body": "Nội dung đã sửa", "version": 1}
            ).status_code,
            200,
        )
        self.assertEqual(
            self.send(
                self.reader, path, "PATCH", {"body": "Ghi đè", "version": 1}
            ).status_code,
            409,
        )
        self.assertEqual(
            self.detail(post["id"])["replies"][0]["body"], "Nội dung đã sửa"
        )

    def testRepliesCannotCrossPostsAndDepthIsBounded(self) -> None:
        first = self.createPost()
        second = self.createPost()
        reply = self.createReply(first["id"])
        for path, payload in (
            (
                f"posts/{second['id']}/replies",
                {"body": "Sai bài", "parentId": reply["id"]},
            ),
            (
                f"posts/{second['id']}/accepted-reply",
                {"replyId": reply["id"], "version": 1},
            ),
        ):
            method = "POST" if path.endswith("/replies") else "PUT"
            self.assertEqual(
                self.send(self.owner, path, method, payload).status_code, 404
            )
        self.assertEqual(
            self.send(
                self.owner,
                f"posts/{second['id']}/replies/{reply['id']}/vote",
                "PUT",
                {"active": True},
            ).status_code,
            404,
        )
        for _ in range(5):
            reply = self.createReply(first["id"], parentId=reply["id"])
        self.assertEqual(
            self.send(
                self.reader,
                f"posts/{first['id']}/replies",
                "POST",
                {"body": "Quá sâu", "parentId": reply["id"]},
            ).status_code,
            400,
        )

    def testVotesAreUniqueReversibleAndNotSelfVotes(self) -> None:
        post = self.createPost()
        path = f"posts/{post['id']}/vote"
        self.assertEqual(
            self.send(self.owner, path, "PUT", {"active": True}).status_code, 403
        )
        for _ in range(3):
            result = self.send(self.reader, path, "PUT", {"active": True})
            self.assertEqual(result.json["data"]["score"], 1)
        self.assertEqual(
            self.send(self.reader, path, "PUT", {"active": False}).json["data"][
                "score"
            ],
            0,
        )
        reply = self.createReply(post["id"])
        path = f"posts/{post['id']}/replies/{reply['id']}/vote"
        self.assertEqual(
            self.send(self.reader, path, "PUT", {"active": True}).status_code, 403
        )
        for _ in range(2):
            self.assertEqual(
                self.send(self.owner, path, "PUT", {"active": True}).json["data"][
                    "score"
                ],
                1,
            )
        self.assertEqual(
            self.send(self.owner, path, "PUT", {"active": False}).json["data"]["score"],
            0,
        )

    def testSearchFilterSortAndPagination(self) -> None:
        first = self.createPost(title="Độ mặn tại Đồng Tháp")
        second = self.createPost(topic="crop-care", title="Quan sát rễ lúa")
        self.createPost(self.reader, title="Ghi chép ruộng")
        self.send(self.reader, f"posts/{first['id']}/vote", "PUT", {"active": True})
        reply = self.createReply(first["id"])
        self.send(
            self.owner,
            f"posts/{first['id']}/accepted-reply",
            "PUT",
            {"replyId": reply["id"], "version": 1},
        )
        for query, expected in (
            ("q=do+man+tai+dong+thap", 1),
            ("topic=crop-care", 1),
            ("mine=1", 2),
            ("status=solved", 1),
            ("status=unanswered", 2),
            ("q=%27+OR+1%3D1", 0),
        ):
            self.assertEqual(
                self.owner.get("/api/community/posts?" + query).json["data"]["total"],
                expected,
                query,
            )
        page = self.owner.get("/api/community/posts?sort=helpful&pageSize=1").json[
            "data"
        ]
        self.assertEqual(page["items"][0]["id"], first["id"])
        self.assertEqual(page["totalPages"], 3)
        pages = [
            self.owner.get(f"/api/community/posts?pageSize=1&page={index}").json[
                "data"
            ]["items"][0]["id"]
            for index in range(1, 4)
        ]
        self.assertEqual(len(set(pages)), 3)
        self.assertIn(second["id"], pages)
        for query in (
            "page=0",
            "page=foo",
            "pageSize=31",
            "topic=unknown",
            "sort=invalid",
            "status=invalid",
        ):
            self.assertEqual(
                self.owner.get("/api/community/posts?" + query).status_code, 400
            )

    def testDraftPrivacyConflictAndPublish(self) -> None:
        payload = self.payload(title="", body="", version=0)
        saved = self.send(self.owner, "draft", "PUT", payload)
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json["data"]["version"], 1)
        self.assertIsNone(
            self.reader.get("/api/community/draft").json["data"]["payload"]
        )
        self.assertEqual(
            self.send(self.owner, "draft", "PUT", payload).status_code, 409
        )
        self.assertEqual(
            self.send(self.owner, "draft", "DELETE", {"version": 0}).status_code, 409
        )
        # An old compose tab must not remove a newer saved draft when publishing.
        self.createPost(draftVersion=0)
        self.assertIsNotNone(
            self.owner.get("/api/community/draft").json["data"]["payload"]
        )
        self.createPost(draftVersion=1)
        self.assertIsNone(
            self.owner.get("/api/community/draft").json["data"]["payload"]
        )

    def testIdempotentCreationAndConcurrentWrites(self) -> None:
        post = self.createPost(requestId="post-retry-123")
        self.assertEqual(self.createPost(requestId="post-retry-123")["id"], post["id"])
        first = self.createReply(post["id"], requestId="reply-retry-123")
        self.assertEqual(
            self.createReply(post["id"], requestId="reply-retry-123")["id"], first["id"]
        )
        service = self.app.extensions["communityService"]
        memberId = self.readerSession["member"]["id"]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(
                pool.map(
                    lambda _: service.vote(post["id"], memberId, {"active": True}),
                    range(8),
                )
            )
        self.assertTrue(all(item["score"] == 1 for item in results))

        def editPost(title: str) -> int:
            try:
                service.updatePost(
                    post["id"],
                    self.ownerSession["member"]["id"],
                    self.payload(title=title, version=1),
                )
                return 200
            except communityError as error:
                return error.statusCode

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(editPost, ["Thay đổi A", "Thay đổi B"]))
        self.assertEqual(sorted(outcomes), [200, 409])

    def testValidationCsrfAndMalformedRequests(self) -> None:
        path = "/api/community/posts"
        self.assertEqual(self.owner.post(path, json=self.payload(), headers={"X-CSRF-Token":""}).status_code, 403)
        self.assertEqual(
            self.owner.post(
                path, json=self.payload(), headers={"X-CSRF-Token": "wrong"}
            ).status_code,
            403,
        )
        for changes in (
            {"title": " "},
            {"title": "x" * 121},
            {"body": "x" * 5001},
            {"topic": []},
            {"cultivar": "unknown"},
            {"photos": None},
            {"photos": ["javascript:alert(1)"]},
            {"photos": ["/static/assets/stitch-forum-field.jpg"] * 5},
        ):
            response = self.send(self.owner, "posts", "POST", self.payload(**changes))
            self.assertEqual(response.status_code, 400, response.json)
        headers = {"X-CSRF-Token": self.ownerSession["csrfToken"]}
        for raw in ("[]", "null", "{"):
            result = self.owner.post(
                path, data=raw, content_type="application/json", headers=headers
            )
            self.assertEqual(result.status_code, 400)
            self.assertIsNone(result.json["data"])
        self.assertEqual(
            self.owner.post(path, data="text", headers=headers).status_code, 415
        )
        large = self.owner.post(
            path,
            data=json.dumps({"body": "x" * 1_100_000}),
            content_type="application/json",
            headers=headers,
        )
        self.assertEqual(large.status_code, 413)
        self.assertIsNotNone(large.json["error"])

    def testPhotoValidationAndSafeRendering(self) -> None:
        output = BytesIO()
        Image.new("RGB", (20, 20), "green").save(output, format="JPEG")
        photo = "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()
        post = self.createPost(
            photos=[photo],
            title="</script><script>alert(1)</script>",
            body="<img src=x onerror=alert(2)>",
        )
        self.assertTrue(
            self.detail(post["id"])["post"]["photos"][0].startswith(
                "data:image/jpeg;base64,"
            )
        )
        html = self.owner.get("/forum/" + post["id"]).get_data(as_text=True)
        self.assertNotIn("</script><script>alert(1)</script>", html)
        self.assertIn("\\u003c", html)
        for photo in (
            "data:image/jpeg;base64,broken",
            "data:image/jpeg;base64," + base64.b64encode(b"not an image").decode(),
        ):
            self.assertEqual(
                self.send(
                    self.owner, "posts", "POST", self.payload(photos=[photo])
                ).status_code,
                400,
            )

    def testLoginAdapterAndReadOnlyAnonymousMode(self) -> None:
        self.app.config["COMMUNITY_ALLOW_GUESTS"] = False
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.get("/forum").status_code, 302)
        self.assertEqual(anonymous.get("/forum/new").status_code, 302)
        self.assertEqual(anonymous.get("/api/community/draft").status_code, 401)
        self.assertEqual(
            anonymous.post("/api/community/posts",json=self.payload()).status_code, 401
        )
        with anonymous.session_transaction() as loginSession:
            loginSession["userId"] = "tan-user-1"
            loginSession["displayName"] = "Nông hộ thật"
        self.assertEqual(anonymous.get("/forum").status_code, 302)
        identity = sign_in(anonymous, "test_adapter")
        post = self.createPost(anonymous)
        self.assertEqual(post["authorId"], "user:"+identity["user"]["user_id"])
        self.app.config["COMMUNITY_IDENTITY_PROVIDER"] = lambda: communityMember(
            "provider:1", "Tài khoản tích hợp"
        )
        self.assertEqual(self.createPost()["author"], "Tài khoản tích hợp")

    def testSamplesAreLabeledAndSeededOnlyOnce(self) -> None:
        config = {**self.config, "COMMUNITY_SEED_SAMPLES": True}
        app = createApp(config)
        client = app.test_client()
        sign_in(client)
        posts = client.get("/api/community/posts").json["data"]
        self.assertEqual(posts["total"], 13)
        self.assertTrue(all(post["isSample"] for post in posts["items"]))
        client = app.test_client()
        sign_in(client)
        diaries = [p for p in client.get("/api/community/posts?pageSize=30").json["data"]["items"]
                   if p["id"].startswith("nhat-ky-")]
        self.assertEqual(len(diaries), 10)
        for diary in diaries:
            photo, = diary["photos"]
            with client.get(photo) as response:
                self.assertEqual(response.status_code, 200)
            replies = client.get("/api/community/posts/" + diary["id"]).json["data"]["replies"]
            self.assertEqual(len({reply["authorId"] for reply in replies}), 3)
            root, = [reply for reply in replies if not reply["parentId"]]
            self.assertEqual(sum(reply["parentId"] == root["id"] for reply in replies), 2)
            self.assertIn(diary["authorId"], {reply["authorId"] for reply in replies})
        with app.extensions["communityService"].model.transaction() as store:
            store.deletePost("muong-lo")
        restarted = createApp(config).test_client()
        sign_in(restarted)
        self.assertEqual(restarted.get("/api/community/posts").json["data"]["total"],12)

    def testUnknownResourcesDoNotCreateLocalPlaceholderPages(self) -> None:
        for path in (
            "/forum/not-found",
            "/forum/local-fake",
            "/api/community/posts/missing",
        ):
            self.assertEqual(self.owner.get(path).status_code, 404)
        response = self.owner.get("/api/community/posts")
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_member_profile_only_lists_public_activity_for_that_member(self) -> None:
        post = self.createPost(title="Quan trắc ruộng")
        other = self.createPost(self.reader, title="Bài của thành viên khác")
        self.send(self.owner, "draft", "PUT", self.payload(title="Bản nháp riêng", version=0))
        self.send(self.owner, "posts/" + other["id"] + "/replies", "POST", {"body": "Đã xem số đo."})
        self.send(self.reader, "posts/" + post["id"] + "/vote", "PUT", {"active": True})
        response = self.reader.get("/api/community/members/" + post["authorId"])
        self.assertEqual(response.status_code, 200)
        profile = response.json["data"]
        self.assertEqual(profile["displayName"], post["author"])
        self.assertEqual((profile["postCount"], profile["replyCount"]), (1, 1))
        self.assertEqual([item["id"] for item in profile["posts"]], [post["id"]])
        self.assertEqual(profile["posts"][0]["score"], 1)
        self.assertNotIn("Bản nháp riêng", response.text)
        self.assertNotIn("requestId", response.text)
        unknown = self.reader.get("/api/community/members/unknown")
        self.assertEqual(unknown.status_code, 404)
        self.assertIsNone(unknown.json["data"])

    def testEditorialPostsAreSourcedAndSeededOnceOnAnExistingDatabase(self) -> None:
        config = {**self.config, "COMMUNITY_SEED_SAMPLES": True}
        createApp(config)
        config["COMMUNITY_SEED_EDITORIAL"] = True
        for _ in range(2):
            client = createApp(config).test_client()
            sign_in(client)
            listing = client.get("/api/community/posts?topic=references&pageSize=25").json["data"]
            self.assertEqual(listing["total"], 20)
            items = listing["items"]
            self.assertEqual(len({item["sourceUrl"] for item in items}), 20)
            self.assertTrue(all(item["author"] == "Admin" for item in items))
            self.assertTrue(all(not item["isSample"] and not item["canEdit"] for item in items))
            for item in items[:10]:
                self.assertEqual(len(item["photos"]), 1)
                src = item["photos"][0]
                credit = item["photoCredits"][src]
                self.assertTrue(credit["author"] and credit["license"] and credit["alt"])
                self.assertTrue(credit["sourceUrl"].startswith("https://commons.wikimedia.org/"))
                with client.get(src) as photo:
                    self.assertEqual(photo.status_code, 200)
                    self.assertEqual(photo.mimetype, "image/jpeg")
            first = client.get("/api/community/posts/bai-tham-khao-01").json["data"]["post"]
            self.assertIn("Trần Khắc Thi", first["body"])
            self.assertIn("19/12/2012", first["body"])
            self.assertIn("ky-thuat-trong-va-cham-soc-cay-ca-chua", first["sourceUrl"])

    def testDraftDeleteDoesNotResetVersion(self) -> None:
        self.send(self.owner, "draft", "PUT", self.payload(version=0))
        removed = self.send(self.owner, "draft", "DELETE", {"version": 1})
        self.assertEqual(removed.json["data"]["version"], 2)
        current = self.owner.get("/api/community/draft").json["data"]
        self.assertIsNone(current["payload"])
        self.assertEqual(current["version"], 2)
        self.assertEqual(
            self.send(self.owner, "draft", "PUT", self.payload(version=2)).status_code,
            200,
        )
        self.assertEqual(
            self.send(self.owner, "draft", "PUT", self.payload(version=1)).status_code,
            409,
        )

    def testHeadNeverWritesWithoutCsrf(self) -> None:
        post = self.createPost()
        self.send(self.owner, "draft", "PUT", self.payload(version=0))
        for path, payload in (
            ("posts", self.payload()),
            ("posts/" + post["id"], self.payload(title="Forged update", version=1)),
            ("draft", {"version": 1}),
        ):
            response = self.owner.open(
                "/api/community/" + path, method="HEAD", json=payload
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b"")
        self.assertEqual(
            self.owner.get("/api/community/posts").json["data"]["total"], 1
        )
        self.assertEqual(self.detail(post["id"])["post"]["version"], 1)
        self.assertIsNotNone(
            self.owner.get("/api/community/draft").json["data"]["payload"]
        )

    def testInvalidCsrfAndRoutingErrorsReturnJson(self) -> None:
        response = self.owner.post(
            "/api/community/posts",
            json=self.payload(),
            headers={"X-CSRF-Token": "không-hợp-lệ"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertIsNotNone(response.json["error"])
        for method, path, status in (
            ("GET", "/api/community/unknown", 404),
            ("DELETE", "/api/community/posts", 405),
        ):
            response = self.owner.open(path, method=method)
            self.assertEqual(response.status_code, status)
            self.assertIsNone(response.json["data"])

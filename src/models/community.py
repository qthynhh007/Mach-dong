"""SQLite models for community discussions; all SQL stays in this layer."""

import sqlite3
import unicodedata
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path


def normalizeText(value: str) -> str:
    value = unicodedata.normalize("NFD", value.casefold().replace("đ", "d"))
    return "".join(char for char in value if not unicodedata.combining(char))


@dataclass(frozen=True)
class communityMember:
    id: str
    displayName: str
    location: str = ""
    isGuest: bool = False

    def toDict(self) -> dict:
        return asdict(self)


class communityModel:
    def __init__(self, databasePath: str | Path) -> None:
        self.databasePath = str(databasePath)
        Path(self.databasePath).parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as store:
            store.connection.executescript("""
                CREATE TABLE IF NOT EXISTS communityMembers (
                    id TEXT PRIMARY KEY, displayName TEXT NOT NULL,
                    location TEXT NOT NULL, isGuest INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS communityPosts (
                    id TEXT PRIMARY KEY, authorId TEXT NOT NULL
                        REFERENCES communityMembers(id),
                    topic TEXT NOT NULL, cultivar TEXT NOT NULL, stage TEXT NOT NULL,
                    title TEXT NOT NULL, body TEXT NOT NULL, photos TEXT NOT NULL,
                    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    isSample INTEGER NOT NULL DEFAULT 0,
                    baseScore INTEGER NOT NULL DEFAULT 0,
                    acceptedReplyId TEXT REFERENCES communityReplies(id)
                        ON DELETE SET NULL,
                    requestId TEXT NOT NULL,
                    UNIQUE(authorId, requestId)
                );
                CREATE TABLE IF NOT EXISTS communityReplies (
                    id TEXT PRIMARY KEY,
                    postId TEXT NOT NULL REFERENCES communityPosts(id) ON DELETE CASCADE,
                    authorId TEXT NOT NULL REFERENCES communityMembers(id),
                    parentId TEXT REFERENCES communityReplies(id) ON DELETE CASCADE,
                    body TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    isDeleted INTEGER NOT NULL DEFAULT 0,
                    requestId TEXT NOT NULL, UNIQUE(authorId, requestId)
                );
                CREATE TABLE IF NOT EXISTS communityPostVotes (
                    postId TEXT NOT NULL REFERENCES communityPosts(id) ON DELETE CASCADE,
                    memberId TEXT NOT NULL REFERENCES communityMembers(id),
                    PRIMARY KEY(postId, memberId)
                );
                CREATE TABLE IF NOT EXISTS communityReplyVotes (
                    replyId TEXT NOT NULL REFERENCES communityReplies(id) ON DELETE CASCADE,
                    memberId TEXT NOT NULL REFERENCES communityMembers(id),
                    PRIMARY KEY(replyId, memberId)
                );
                CREATE TABLE IF NOT EXISTS communityDrafts (
                    memberId TEXT PRIMARY KEY REFERENCES communityMembers(id),
                    payload TEXT NOT NULL, version INTEGER NOT NULL,
                    updatedAt TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS communityMetadata (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS communityPostDate
                    ON communityPosts(createdAt DESC);
                CREATE INDEX IF NOT EXISTS communityReplyPost
                    ON communityReplies(postId, createdAt);
                CREATE INDEX IF NOT EXISTS communityReplyParent
                    ON communityReplies(parentId);
            """)

    @contextmanager
    def transaction(self, write: bool = True) -> Iterator["communityStore"]:
        connection = sqlite3.connect(self.databasePath, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.create_function(
            "normalizeText", 1, normalizeText, deterministic=True
        )
        try:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield communityStore(connection)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


class communityStore:
    """A short-lived data access object scoped to a single transaction."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def saveMember(self, member: communityMember) -> None:
        self.connection.execute(
            """
            INSERT INTO communityMembers VALUES (:id, :displayName, :location, :isGuest)
            ON CONFLICT(id) DO UPDATE SET displayName=excluded.displayName,
                location=excluded.location, isGuest=excluded.isGuest
        """,
            member.toDict(),
        )

    def isSeeded(self) -> bool:
        return (
            self.connection.execute(
                "SELECT 1 FROM communityMetadata WHERE key='seeded'"
            ).fetchone()
            is not None
        )

    def markSeeded(self) -> None:
        self.connection.execute("INSERT INTO communityMetadata VALUES ('seeded', '1')")

    def insertPost(self, post: dict) -> None:
        self.connection.execute(
            """
            INSERT INTO communityPosts (
                id, authorId, topic, cultivar, stage, title, body, photos,
                createdAt, updatedAt, isSample, baseScore, requestId
            ) VALUES (:id, :authorId, :topic, :cultivar, :stage, :title, :body,
                :photos, :createdAt, :updatedAt, :isSample, :baseScore, :requestId)
        """,
            post,
        )

    def postQuery(self) -> str:
        return """
            SELECT p.*, m.displayName AS author, m.location,
                p.baseScore + (SELECT count(*) FROM communityPostVotes v
                    WHERE v.postId=p.id) AS score,
                EXISTS(SELECT 1 FROM communityPostVotes v
                    WHERE v.postId=p.id AND v.memberId=:memberId) AS voted,
                (SELECT count(*) FROM communityReplies r
                    WHERE r.postId=p.id AND r.isDeleted=0 AND r.parentId IS NULL)
                    AS answerCount
            FROM communityPosts p JOIN communityMembers m ON m.id=p.authorId
        """

    def getPost(self, postId: str, memberId: str = "") -> dict | None:
        row = self.connection.execute(
            self.postQuery() + " WHERE p.id=:postId",
            {"postId": postId, "memberId": memberId},
        ).fetchone()
        return dict(row) if row else None

    def findPostRequest(self, memberId: str, requestId: str) -> str | None:
        row = self.connection.execute(
            "SELECT id FROM communityPosts WHERE authorId=? AND requestId=?",
            (memberId, requestId),
        ).fetchone()
        return row["id"] if row else None

    def listPosts(self, memberId: str, filters: dict) -> tuple[list[dict], int]:
        conditions = ["1=1"]
        params = {"memberId": memberId, **filters}
        if filters["topic"]:
            conditions.append("p.topic=:topic")
        if filters["q"]:
            conditions.append("""instr(normalizeText(p.title || ' ' || p.body || ' '
                || m.displayName || ' ' || m.location || ' ' || p.cultivar), :query)>0""")
            params["query"] = normalizeText(filters["q"])
        if filters["status"] == "unanswered":
            conditions.append(
                "NOT EXISTS(SELECT 1 FROM communityReplies r WHERE "
                "r.postId=p.id AND r.isDeleted=0 AND r.parentId IS NULL)"
            )
        elif filters["status"] == "solved":
            conditions.append("p.acceptedReplyId IS NOT NULL")
        if filters["mine"]:
            conditions.append("p.authorId=:memberId")
        where = " WHERE " + " AND ".join(conditions)
        total = self.connection.execute(
            "SELECT count(*) FROM communityPosts p JOIN communityMembers m "
            "ON m.id=p.authorId" + where,
            params,
        ).fetchone()[0]
        order = {
            "newest": "p.createdAt DESC, p.id DESC",
            "oldest": "p.createdAt, p.id",
            "helpful": "score DESC, p.createdAt DESC, p.id DESC",
        }
        params["offset"] = (filters["page"] - 1) * filters["pageSize"]
        rows = self.connection.execute(
            self.postQuery()
            + where
            + " ORDER BY "
            + order[filters["sort"]]
            + " LIMIT :pageSize OFFSET :offset",
            params,
        ).fetchall()
        return [dict(row) for row in rows], total

    def updatePost(self, postId: str, fields: dict, updatedAt: str) -> None:
        self.connection.execute(
            """
            UPDATE communityPosts SET topic=:topic, cultivar=:cultivar, stage=:stage,
                title=:title, body=:body, photos=:photos, updatedAt=:updatedAt,
                version=version+1 WHERE id=:postId
        """,
            {**fields, "postId": postId, "updatedAt": updatedAt},
        )

    def deletePost(self, postId: str) -> None:
        self.connection.execute("DELETE FROM communityPosts WHERE id=?", (postId,))

    def insertReply(self, reply: dict) -> None:
        self.connection.execute(
            """
            INSERT INTO communityReplies
                (id, postId, authorId, parentId, body, createdAt, updatedAt, requestId)
            VALUES (:id, :postId, :authorId, :parentId, :body, :createdAt, :updatedAt, :requestId)
        """,
            reply,
        )

    def replyQuery(self) -> str:
        return """
            SELECT r.*, m.displayName AS author,
                (SELECT count(*) FROM communityReplyVotes v WHERE v.replyId=r.id) AS score,
                EXISTS(SELECT 1 FROM communityReplyVotes v
                    WHERE v.replyId=r.id AND v.memberId=:memberId) AS voted
            FROM communityReplies r JOIN communityMembers m ON m.id=r.authorId
        """

    def getReply(self, replyId: str, memberId: str = "") -> dict | None:
        row = self.connection.execute(
            self.replyQuery() + " WHERE r.id=:replyId",
            {"replyId": replyId, "memberId": memberId},
        ).fetchone()
        return dict(row) if row else None

    def findReplyRequest(self, memberId: str, requestId: str) -> dict | None:
        row = self.connection.execute(
            "SELECT * FROM communityReplies WHERE authorId=? AND requestId=?",
            (memberId, requestId),
        ).fetchone()
        return dict(row) if row else None

    def listReplies(self, postId: str, memberId: str) -> list[dict]:
        rows = self.connection.execute(
            self.replyQuery() + " WHERE r.postId=:postId ORDER BY r.createdAt, r.id",
            {"postId": postId, "memberId": memberId},
        ).fetchall()
        return [dict(row) for row in rows]

    def updateReply(
        self, replyId: str, body: str, updatedAt: str, isDeleted: bool = False
    ) -> None:
        self.connection.execute(
            """
            UPDATE communityReplies SET body=?, updatedAt=?, isDeleted=?,
                version=version+1 WHERE id=?
        """,
            (body, updatedAt, isDeleted, replyId),
        )
        if isDeleted:
            self.connection.execute(
                "DELETE FROM communityReplyVotes WHERE replyId=?", (replyId,)
            )
            self.connection.execute(
                """
                UPDATE communityPosts SET acceptedReplyId=NULL, version=version+1,
                    updatedAt=? WHERE acceptedReplyId=?
            """,
                (updatedAt, replyId),
            )

    def setAcceptedReply(
        self, postId: str, replyId: str | None, updatedAt: str
    ) -> None:
        self.connection.execute(
            """
            UPDATE communityPosts SET acceptedReplyId=?, version=version+1,
                updatedAt=? WHERE id=?
        """,
            (replyId, updatedAt, postId),
        )

    def setVote(self, target: str, targetId: str, memberId: str, active: bool) -> None:
        # target comes only from the service, never from user-controlled SQL.
        table, column = {
            "post": ("communityPostVotes", "postId"),
            "reply": ("communityReplyVotes", "replyId"),
        }[target]
        if active:
            self.connection.execute(
                f"INSERT OR IGNORE INTO {table} ({column}, memberId) VALUES (?, ?)",
                (targetId, memberId),
            )
        else:
            self.connection.execute(
                f"DELETE FROM {table} WHERE {column}=? AND memberId=?",
                (targetId, memberId),
            )

    def getDraft(self, memberId: str) -> dict | None:
        row = self.connection.execute(
            "SELECT payload, version, updatedAt FROM communityDrafts WHERE memberId=?",
            (memberId,),
        ).fetchone()
        return dict(row) if row else None

    def saveDraft(
        self, memberId: str, payload: str, version: int, updatedAt: str
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO communityDrafts VALUES (?, ?, ?, ?)
            ON CONFLICT(memberId) DO UPDATE SET payload=excluded.payload,
                version=excluded.version, updatedAt=excluded.updatedAt
        """,
            (memberId, payload, version, updatedAt),
        )

    def deleteDraft(self, memberId: str, version: int) -> None:
        self.connection.execute(
            "UPDATE communityDrafts SET payload='null', version=version+1 "
            "WHERE memberId=? AND version=?",
            (memberId, version),
        )

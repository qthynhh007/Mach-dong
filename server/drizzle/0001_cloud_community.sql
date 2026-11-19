CREATE TABLE community_members (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  is_guest INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE community_posts (
  id TEXT PRIMARY KEY NOT NULL,
  author_id TEXT NOT NULL REFERENCES community_members(id),
  topic TEXT NOT NULL,
  cultivar TEXT NOT NULL,
  stage TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  base_score INTEGER NOT NULL DEFAULT 0,
  accepted_reply_id TEXT,
  request_id TEXT NOT NULL,
  UNIQUE(author_id,request_id)
);
--> statement-breakpoint
CREATE INDEX community_posts_date ON community_posts(created_at DESC);
--> statement-breakpoint
CREATE TABLE community_replies (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES community_members(id),
  parent_id TEXT REFERENCES community_replies(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  request_id TEXT NOT NULL,
  UNIQUE(author_id,request_id)
);
--> statement-breakpoint
CREATE INDEX community_replies_post ON community_replies(post_id,created_at);
--> statement-breakpoint
CREATE TABLE community_post_votes (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES community_members(id),
  PRIMARY KEY(post_id,member_id)
);
--> statement-breakpoint
CREATE TABLE community_reply_votes (
  reply_id TEXT NOT NULL REFERENCES community_replies(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES community_members(id),
  PRIMARY KEY(reply_id,member_id)
);
--> statement-breakpoint
CREATE TABLE community_drafts (
  member_id TEXT PRIMARY KEY REFERENCES community_members(id),
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE community_metadata (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE account_field_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
  address TEXT NOT NULL DEFAULT '',
  cultivar TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  hydrology_station TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

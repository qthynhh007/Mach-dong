CREATE TABLE accounts (
  user_id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'FARMER',
  wallet_address TEXT NOT NULL DEFAULT '',
  wallet_type TEXT NOT NULL DEFAULT 'UNLINKED',
  managed_wallet_address TEXT NOT NULL DEFAULT '',
  encrypted_wallet_key TEXT,
  simulation_credits INTEGER NOT NULL DEFAULT 3,
  avax_balance REAL NOT NULL DEFAULT 0.05,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX accounts_phone_idx ON accounts(phone);
--> statement-breakpoint
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX account_sessions_user_idx ON account_sessions(user_id);
--> statement-breakpoint
CREATE TABLE account_otps (
  email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE account_transactions (
  tx_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  avax_amount REAL NOT NULL,
  credit_delta INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX account_transactions_user_idx ON account_transactions(user_id,created_at);
--> statement-breakpoint
CREATE TABLE account_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_until INTEGER NOT NULL
);

export const ENABLE_PGVECTOR = `
  CREATE EXTENSION IF NOT EXISTS vector;
`;

export const CREATE_IDEA_SESSIONS = `
  CREATE TABLE IF NOT EXISTS idea_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status      TEXT NOT NULL DEFAULT 'clarifying',
    turn_count  INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const CREATE_SESSION_MESSAGES = `
  CREATE TABLE IF NOT EXISTS session_messages (
    id          SERIAL PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES idea_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    input_mode  TEXT NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const CREATE_MY_IDEAS = `
  CREATE TABLE IF NOT EXISTS my_ideas (
    id             SERIAL PRIMARY KEY,
    vector         vector(768),
    raw_text       TEXT NOT NULL,
    distilled_text TEXT NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

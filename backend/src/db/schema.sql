CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  casino VARCHAR(100) DEFAULT '',
  description TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  table_id INTEGER REFERENCES tables(id) ON DELETE CASCADE,
  name VARCHAR(100) DEFAULT '',
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS spins (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  table_id INTEGER REFERENCES tables(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 0 AND number <= 36),
  color VARCHAR(10) NOT NULL,
  parity VARCHAR(10),
  dozen INTEGER,
  col INTEGER,
  sector_a3 INTEGER,
  sector_a4 INTEGER,
  spin_order INTEGER NOT NULL,
  spun_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_results (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  spin_id INTEGER REFERENCES spins(id) ON DELETE CASCADE,
  spin_index INTEGER NOT NULL,
  system_type VARCHAR(5),
  bet_sectors INTEGER[],
  bet_chips INTEGER NOT NULL DEFAULT 0,
  multiplier INTEGER NOT NULL DEFAULT 1,
  result VARCHAR(10) NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spins_session ON spins(session_id);
CREATE INDEX IF NOT EXISTS idx_spins_table ON spins(table_id);
CREATE INDEX IF NOT EXISTS idx_spins_number ON spins(number);
CREATE INDEX IF NOT EXISTS idx_spins_order ON spins(session_id, spin_order);
CREATE INDEX IF NOT EXISTS idx_results_session ON session_results(session_id);
CREATE INDEX IF NOT EXISTS idx_results_spin ON session_results(spin_id);

-- ─── Table Memory — acumulado histórico por mesa ────────────────────────────
-- Una fila por número por mesa. Se actualiza con cada bloque de 36 spins.
CREATE TABLE IF NOT EXISTS table_memory (
  id         SERIAL PRIMARY KEY,
  table_id   INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  number     INTEGER NOT NULL CHECK (number >= 0 AND number <= 36),
  hits       INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(table_id, number)
);
CREATE INDEX IF NOT EXISTS idx_table_memory_table ON table_memory(table_id);

-- ─── Hot Windows ─────────────────────────────────────────────────────────────
-- Stores top-frequency numbers for every completed 36-spin block.
CREATE TABLE IF NOT EXISTS hot_windows (
  id           SERIAL PRIMARY KEY,
  table_id     INTEGER REFERENCES tables(id) ON DELETE CASCADE,
  session_id   INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  window_index INTEGER NOT NULL,        -- 1-based block number within the session
  numbers      JSONB   NOT NULL,        -- [{ num, count }, ...]
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hot_windows_table   ON hot_windows(table_id);
CREATE INDEX IF NOT EXISTS idx_hot_windows_session ON hot_windows(session_id);

-- ─── AXIS Memory — histórico acumulado por sector por mesa ──────────────────
-- Una fila por (table_id, sector_type, sector_id).
-- sector_type: 'H' (horizontal), 'V' (vertical), 'E' (eclipse/ace).
-- sector_id:   1-6 para H/V; número ace para E.
-- total_cycles = wins + aborts (upserted al terminar cada ciclo de apuesta).
CREATE TABLE IF NOT EXISTS axis_memory (
  id           SERIAL PRIMARY KEY,
  table_id     INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  sector_type  VARCHAR(1) NOT NULL CHECK (sector_type IN ('H','V','E')),
  sector_id    INTEGER NOT NULL,
  hits         INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  aborts       INTEGER NOT NULL DEFAULT 0,
  total_cycles INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(table_id, sector_type, sector_id)
);
CREATE INDEX IF NOT EXISTS idx_axis_memory_table ON axis_memory(table_id);

-- ─── Migrations (idempotent) ───────────────────────────────────────────────────

-- Fix: UNIQUE constraint on spin ordering within a session (prevents race conditions)
-- NOTE: If this fails due to existing duplicate data, it's skipped safely.
DO $$ BEGIN
  ALTER TABLE spins ADD CONSTRAINT uq_session_spin_order UNIQUE (session_id, spin_order);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL;
END $$;

-- Fix: UNIQUE on hot_windows so ON CONFLICT actually works
DO $$ BEGIN
  ALTER TABLE hot_windows
    ADD CONSTRAINT uq_hot_window UNIQUE (table_id, session_id, window_index);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL;
END $$;

-- Fix: NOT NULL on hot_windows foreign keys (orphaned rows can't accumulate)
DO $$ BEGIN
  ALTER TABLE hot_windows ALTER COLUMN table_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hot_windows ALTER COLUMN session_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Fix: UNIQUE on active session per table (prevents two active sessions)
-- Partial index: only one active=true row per table_id
DO $$ BEGIN
  CREATE UNIQUE INDEX uq_one_active_session
    ON sessions (table_id)
    WHERE is_active = true;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL;
END $$;

-- Fix: composite index for AXIS progression step queries (session_id + system_type)
CREATE INDEX IF NOT EXISTS idx_results_session_system
  ON session_results (session_id, system_type);

-- Fix: composite index for spin_index ordering in results
CREATE INDEX IF NOT EXISTS idx_results_spin_index
  ON session_results (session_id, spin_index);

-- Fix: index for efficient cross-session spin ordering per table
CREATE INDEX IF NOT EXISTS idx_spins_table_session_order
  ON spins (table_id, session_id, spin_order);

-- Fix: index for temporal ordering when joining with sessions
CREATE INDEX IF NOT EXISTS idx_sessions_table_started
  ON sessions (table_id, started_at);

DO $$ BEGIN
  ALTER TABLE session_results ALTER COLUMN system_type TYPE VARCHAR(20);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE session_results ADD COLUMN jacobo_active BOOLEAN;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE session_results ADD COLUMN jacobo_confidence INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE session_results ADD COLUMN jacobo_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

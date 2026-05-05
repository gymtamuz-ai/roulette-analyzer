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

-- ─── Migrations (idempotent) ───────────────────────────────────────────────────
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

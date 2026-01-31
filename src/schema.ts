// SecPipe SQL Schema for Durable Object Storage

export function initializeSchema(sql: SqlStorage): void {
  // Reviews table - main review records
  sql.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      language TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      workflow_instance_id TEXT,
      total_findings_raw INTEGER DEFAULT 0,
      total_findings_filtered INTEGER DEFAULT 0,
      noise_reduction_percent REAL DEFAULT 0,
      current_stage TEXT,
      error TEXT
    )
  `);

  // Index for user queries
  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status)
  `);

  // Stage results table - output from each pipeline stage
  sql.exec(`
    CREATE TABLE IF NOT EXISTS stage_results (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      completed_at INTEGER,
      output TEXT,
      error TEXT,
      FOREIGN KEY (review_id) REFERENCES reviews(id)
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_stage_results_review_id ON stage_results(review_id)
  `);

  // Findings table - individual vulnerabilities
  sql.exec(`
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location_start_line INTEGER NOT NULL,
      location_end_line INTEGER NOT NULL,
      location_snippet TEXT NOT NULL,
      cwe_id TEXT,
      owasp_category TEXT,
      is_reachable INTEGER NOT NULL DEFAULT 0,
      has_user_input_path INTEGER NOT NULL DEFAULT 0,
      data_flow_path TEXT,
      sanitizers_in_path TEXT,
      false_positive_reason TEXT,
      approved INTEGER DEFAULT 0,
      approved_at INTEGER,
      FOREIGN KEY (review_id) REFERENCES reviews(id)
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_findings_review_id ON findings(review_id)
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_findings_is_reachable ON findings(is_reachable)
  `);

  // Remediations table - generated code fixes
  sql.exec(`
    CREATE TABLE IF NOT EXISTS remediations (
      id TEXT PRIMARY KEY,
      finding_id TEXT NOT NULL,
      review_id TEXT NOT NULL,
      original_code TEXT NOT NULL,
      fixed_code TEXT NOT NULL,
      explanation TEXT NOT NULL,
      diff_hunks TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (finding_id) REFERENCES findings(id),
      FOREIGN KEY (review_id) REFERENCES reviews(id)
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_remediations_review_id ON remediations(review_id)
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_remediations_finding_id ON remediations(finding_id)
  `);
}

// Helper type for SQL storage
export interface SqlStorage {
  exec(query: string): SqlStorageResult;
}

export interface SqlStorageResult {
  changes: number;
  lastRowId: number;
}

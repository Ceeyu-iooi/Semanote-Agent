-- V1 bootstrap, additive and idempotent. Never drop or rewrite existing user data.
CREATE TABLE IF NOT EXISTS schemaVersion (
  versionNumber INT PRIMARY KEY,
  installedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS importBatch (
  id CHAR(36) PRIMARY KEY,
  fileName VARCHAR(255) NOT NULL,
  summaryJson JSON NOT NULL,
  createdAt VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS textDocument (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  rowVersion BIGINT NOT NULL DEFAULT 1,
  currentRevisionId CHAR(36) NOT NULL,
  currentSnapshotId CHAR(36) NULL,
  sourceJson JSON NOT NULL,
  createdAt VARCHAR(32) NOT NULL,
  updatedAt VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS textRevision (
  id CHAR(36) PRIMARY KEY,
  documentId CHAR(36) NOT NULL,
  revisionNumber INT NOT NULL,
  textBody MEDIUMTEXT NOT NULL,
  textHash CHAR(64) NOT NULL,
  createdAt VARCHAR(32) NOT NULL,
  CONSTRAINT revisionDocument FOREIGN KEY (documentId) REFERENCES textDocument(id),
  UNIQUE KEY documentRevision (documentId, revisionNumber)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS annotationJob (
  id CHAR(36) PRIMARY KEY,
  documentId CHAR(36) NOT NULL,
  revisionId CHAR(36) NOT NULL,
  previousJobId CHAR(36) NULL,
  provider VARCHAR(40) NOT NULL,
  state VARCHAR(32) NOT NULL,
  requestJson JSON NOT NULL,
  responseJson JSON NULL,
  errorMessage VARCHAR(300) NULL,
  createdAt VARCHAR(32) NOT NULL,
  updatedAt VARCHAR(32) NOT NULL,
  CONSTRAINT jobDocument FOREIGN KEY (documentId) REFERENCES textDocument(id),
  CONSTRAINT jobRevision FOREIGN KEY (revisionId) REFERENCES textRevision(id),
  KEY jobsByDocument (documentId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE IF NOT EXISTS annotationSnapshot (
  id CHAR(36) PRIMARY KEY,
  documentId CHAR(36) NOT NULL,
  revisionId CHAR(36) NOT NULL,
  producerKind VARCHAR(16) NOT NULL,
  baseSnapshotId CHAR(36) NULL,
  jobId CHAR(36) NULL,
  layersJson JSON NOT NULL,
  createdAt VARCHAR(32) NOT NULL,
  CONSTRAINT snapshotDocument FOREIGN KEY (documentId) REFERENCES textDocument(id),
  CONSTRAINT snapshotRevision FOREIGN KEY (revisionId) REFERENCES textRevision(id),
  CONSTRAINT snapshotBase FOREIGN KEY (baseSnapshotId) REFERENCES annotationSnapshot(id),
  CONSTRAINT snapshotJob FOREIGN KEY (jobId) REFERENCES annotationJob(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT IGNORE INTO schemaVersion(versionNumber) VALUES (1);

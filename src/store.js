/**
 * easycron Job Store (Phase 3 Enhanced)
 * Manages job persistence in ~/.easycron/jobs.json
 *
 * Phase 3 additions:
 *   - Advisory file locking to prevent concurrent corruption
 *   - Atomic writes (write to .tmp, then rename)
 *   - Advanced corruption recovery with backup rotation
 *   - Execution logging per job
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// ─── Paths ───────────────────────────────────────────────────────

const EASYCRON_DIR = path.join(os.homedir(), '.easycron');
const JOBS_FILE = path.join(EASYCRON_DIR, 'jobs.json');
const LOCK_FILE = path.join(EASYCRON_DIR, 'jobs.lock');
const LOGS_DIR = path.join(EASYCRON_DIR, 'logs');

// ─── Constants ───────────────────────────────────────────────────

const LOCK_STALE_MS = 10000;  // 10s — if lock is older, force release
const MAX_BACKUPS = 3;        // Keep 3 corruption backups max

// ─── Ensure Directory ────────────────────────────────────────────

function ensureDir() {
  try {
    if (!fs.existsSync(EASYCRON_DIR)) {
      fs.mkdirSync(EASYCRON_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  } catch (err) {
    throw new Error(
      `Cannot create easycron directory at ${EASYCRON_DIR}.\n` +
      `  Reason: ${err.message}\n` +
      `  Fix: Check directory permissions or run with appropriate access.`
    );
  }
}

// ─── Advisory File Lock (Phase 3) ────────────────────────────────

/**
 * Acquire an advisory lock on jobs.json.
 * Uses a .lock file with PID + timestamp for stale lock detection.
 * This is advisory — it prevents concurrent easycron processes from
 * corrupting the file, but doesn't enforce OS-level locks.
 *
 * @returns {boolean} Whether lock was acquired
 */
function acquireLock() {
  ensureDir();

  // Check for existing lock
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      const lockAge = Date.now() - lockData.timestamp;

      // Stale lock detection — if lock is older than threshold, force release
      if (lockAge < LOCK_STALE_MS) {
        return false; // Lock held by another process
      }
      // Lock is stale, we'll overwrite it
    } catch {
      // Corrupted lock file — safe to overwrite
    }
  }

  // Write our lock
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      timestamp: Date.now(),
    }), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the advisory lock.
 */
function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // Best effort — lock will expire via stale detection
  }
}

/**
 * Execute a function with the advisory lock held.
 * Retries briefly if lock is held by another process.
 *
 * @param {Function} fn - Function to execute while locked
 * @returns {*} Return value of fn
 */
function withLock(fn) {
  const maxRetries = 5;
  const retryDelay = 100; // ms

  for (let i = 0; i < maxRetries; i++) {
    if (acquireLock()) {
      try {
        return fn();
      } finally {
        releaseLock();
      }
    }
    // Busy wait (acceptable for advisory lock on tiny file)
    const start = Date.now();
    while (Date.now() - start < retryDelay) {
      // spin
    }
  }

  // Fallback: proceed without lock (better than deadlock)
  console.warn('⚠️  Could not acquire lock on jobs.json — proceeding without lock');
  return fn();
}

// ─── Read Jobs ───────────────────────────────────────────────────

function readJobs() {
  ensureDir();

  if (!fs.existsSync(JOBS_FILE)) {
    return { jobs: [] };
  }

  try {
    const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
    const data = JSON.parse(raw);

    // Validate structure
    if (!data || !Array.isArray(data.jobs)) {
      throw new Error('Invalid structure');
    }

    return data;
  } catch {
    // Corrupted file — backup with rotation and reset
    rotateBackup();
    console.warn(
      `\n⚠️  Warning: jobs.json was corrupted and has been reset.\n` +
      `   Backup saved to: ${EASYCRON_DIR}\n`
    );
    return { jobs: [] };
  }
}

// ─── Atomic Write (Phase 3) ─────────────────────────────────────

/**
 * Write jobs atomically: write to unique .tmp file, then rename.
 * Uses PID + timestamp for unique tmp names to prevent concurrent collisions.
 */
function writeJobs(data) {
  ensureDir();
  const tmpFile = JOBS_FILE + `.tmp.${process.pid}.${Date.now()}`;

  try {
    // Write to unique temporary file first
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');

    // Atomic rename (on most filesystems, rename is atomic)
    fs.renameSync(tmpFile, JOBS_FILE);
  } catch (err) {
    // Clean up tmp file on failure
    try { fs.unlinkSync(tmpFile); } catch { /* noop */ }

    // Fallback: direct write if rename fails (e.g., cross-device)
    try {
      fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (fallbackErr) {
      throw new Error(`Failed to write jobs: ${fallbackErr.message}`);
    }
  }
}

// ─── Backup Rotation (Phase 3) ──────────────────────────────────

/**
 * Rotate corruption backups, keeping MAX_BACKUPS most recent.
 */
function rotateBackup() {
  try {
    if (!fs.existsSync(JOBS_FILE)) return;

    // Shift existing backups
    for (let i = MAX_BACKUPS; i >= 1; i--) {
      const from = i === 1
        ? JOBS_FILE + '.corrupted'
        : JOBS_FILE + `.corrupted.${i - 1}`;
      const to = JOBS_FILE + `.corrupted.${i}`;

      if (fs.existsSync(from)) {
        if (i === MAX_BACKUPS) {
          fs.unlinkSync(from); // Delete oldest
        } else {
          fs.renameSync(from, to);
        }
      }
    }

    // Current corrupted file becomes .corrupted
    fs.copyFileSync(JOBS_FILE, JOBS_FILE + '.corrupted');
  } catch {
    // Best effort — proceed with reset even if backup fails
  }
}

// ─── Add Job ─────────────────────────────────────────────────────

/**
 * Add a new job to the store.
 * @param {{ phrase: string, cron: string, command: string, mode: string }} jobData
 * @returns {object} The created job with ID and timestamp
 */
function addJob(jobData) {
  return withLock(() => {
    const data = readJobs();

    const job = {
      id: uuidv4(),
      phrase: jobData.phrase,
      cron: jobData.cron,
      command: jobData.command,
      mode: jobData.mode || 'local',
      created: new Date().toISOString(),
    };

    data.jobs.push(job);
    writeJobs(data);

    return job;
  });
}

// ─── List Jobs ───────────────────────────────────────────────────

/**
 * Return all persisted jobs.
 * @returns {Array} Array of job objects
 */
function listJobs() {
  const data = readJobs();
  return data.jobs;
}

// ─── Remove Job ──────────────────────────────────────────────────

/**
 * Remove a job by ID or partial ID (first 8 chars).
 * @param {string} id - Full UUID or first 8 characters
 * @returns {object} The removed job
 * @throws {Error} If job not found
 */
function removeJob(id) {
  return withLock(() => {
    const data = readJobs();
    const cleanId = id.trim().toLowerCase();

    const index = data.jobs.findIndex(
      (j) => j.id === cleanId || j.id.startsWith(cleanId)
    );

    if (index === -1) {
      throw new Error(`Job not found: "${id}". Run \`easycron list\` to see valid IDs.`);
    }

    const [removed] = data.jobs.splice(index, 1);
    writeJobs(data);

    return removed;
  });
}

// ─── Execution Logging (Phase 3) ─────────────────────────────────

/**
 * Log an execution event for a job.
 * @param {string} jobId
 * @param {{ status: string, output: string, duration: number }} entry
 */
function logExecution(jobId, entry) {
  ensureDir();
  const logFile = path.join(LOGS_DIR, `${jobId}.log`);

  const logEntry = JSON.stringify({
    timestamp: new Date().toISOString(),
    status: entry.status,
    output: entry.output ? entry.output.substring(0, 1000) : '',
    duration: entry.duration || 0,
  }) + '\n';

  try {
    fs.appendFileSync(logFile, logEntry, 'utf-8');
  } catch {
    // Logging should never block execution
  }
}

/**
 * Returns execution log entries for a job.
 * @param {string} id - Job ID or partial ID
 * @param {number} limit - Max entries to return
 * @returns {Array}
 */
function getJobLogs(id, limit = 20) {
  ensureDir();
  const cleanId = id.trim().toLowerCase();

  // Find exact match or partial match in logs dir
  let logFile;
  if (fs.existsSync(path.join(LOGS_DIR, `${cleanId}.log`))) {
    logFile = path.join(LOGS_DIR, `${cleanId}.log`);
  } else {
    // Search by partial ID
    try {
      const files = fs.readdirSync(LOGS_DIR);
      const match = files.find(f => f.startsWith(cleanId));
      if (match) {
        logFile = path.join(LOGS_DIR, match);
      }
    } catch {
      return [];
    }
  }

  if (!logFile || !fs.existsSync(logFile)) {
    return [];
  }

  try {
    const lines = fs.readFileSync(logFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit);

    return lines.map(line => {
      try { return JSON.parse(line); }
      catch { return { raw: line }; }
    });
  } catch {
    return [];
  }
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  addJob,
  listJobs,
  removeJob,
  getJobLogs,
  logExecution,
  EASYCRON_DIR,
  JOBS_FILE,
  LOCK_FILE,
  LOGS_DIR,
};

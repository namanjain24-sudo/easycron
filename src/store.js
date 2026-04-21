/**
 * easycron Job Store
 * Manages job persistence in ~/.easycron/jobs.json
 *
 * MVP approach: Simple JSON file read/write.
 * File locking and corruption recovery are deferred to Phase 3.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// ─── Paths ───────────────────────────────────────────────────────

const EASYCRON_DIR = path.join(os.homedir(), '.easycron');
const JOBS_FILE = path.join(EASYCRON_DIR, 'jobs.json');

// ─── Ensure Directory ────────────────────────────────────────────

function ensureDir() {
  try {
    if (!fs.existsSync(EASYCRON_DIR)) {
      fs.mkdirSync(EASYCRON_DIR, { recursive: true });
    }
  } catch (err) {
    throw new Error(
      `Cannot create easycron directory at ${EASYCRON_DIR}.\n` +
      `  Reason: ${err.message}\n` +
      `  Fix: Check directory permissions or run with appropriate access.`
    );
  }
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
    // Corrupted file — backup and reset (basic recovery for MVP)
    const backupPath = JOBS_FILE + '.corrupted';
    try {
      fs.copyFileSync(JOBS_FILE, backupPath);
    } catch {
      // Backup failed — proceed anyway
    }
    console.warn(
      `\n⚠️  Warning: jobs.json was corrupted and has been reset.\n` +
      `   Backup saved to: ${backupPath}\n`
    );
    return { jobs: [] };
  }
}

// ─── Write Jobs ──────────────────────────────────────────────────

function writeJobs(data) {
  ensureDir();
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Add Job ─────────────────────────────────────────────────────

/**
 * Add a new job to the store.
 * @param {{ phrase: string, cron: string, command: string, mode: string }} jobData
 * @returns {object} The created job with ID and timestamp
 */
function addJob(jobData) {
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
}

// ─── Get Job Logs (Placeholder for MVP) ──────────────────────────

/**
 * Returns execution log entries for a job.
 * MVP: returns a placeholder message. Full logging deferred.
 * @param {string} id
 * @returns {Array}
 */
function getJobLogs(id) {
  // MVP: execution logging will be expanded in Phase 3
  return [];
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = { addJob, listJobs, removeJob, getJobLogs, EASYCRON_DIR, JOBS_FILE };

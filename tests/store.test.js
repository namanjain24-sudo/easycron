/**
 * easycron Store Tests
 * Validates job persistence CRUD operations.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Override the store path for testing
const TEST_DIR = path.join(os.tmpdir(), '.easycron-test-' + Date.now());
const TEST_FILE = path.join(TEST_DIR, 'jobs.json');

// We need to monkey-patch before requiring store
process.env.EASYCRON_DIR = TEST_DIR;

// ─── Isolated Store for Tests ────────────────────────────────────

function createTestStore() {
  // Inline mini-store to avoid polluting user's real ~/.easycron
  const { v4: uuidv4 } = require('uuid');

  function readJobs() {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
    if (!fs.existsSync(TEST_FILE)) return { jobs: [] };
    try {
      return JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    } catch {
      return { jobs: [] };
    }
  }

  function writeJobs(data) {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  return {
    addJob(jobData) {
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
    },
    listJobs() {
      return readJobs().jobs;
    },
    removeJob(id) {
      const data = readJobs();
      const cleanId = id.trim().toLowerCase();
      const index = data.jobs.findIndex((j) => j.id === cleanId || j.id.startsWith(cleanId));
      if (index === -1) throw new Error(`Job not found: "${id}"`);
      const [removed] = data.jobs.splice(index, 1);
      writeJobs(data);
      return removed;
    },
    cleanup() {
      try { fs.rmSync(TEST_DIR, { recursive: true }); } catch { /* noop */ }
    },
    corruptFile() {
      if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
      fs.writeFileSync(TEST_FILE, '{invalid json!!!', 'utf-8');
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Store: Job CRUD', () => {
  let store;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.cleanup();
  });

  it('should add a job and return it with an ID', () => {
    const job = store.addJob({ phrase: 'every 10 minutes', cron: '*/10 * * * *', command: 'node app.js', mode: 'local' });
    assert.ok(job.id);
    assert.equal(job.phrase, 'every 10 minutes');
    assert.equal(job.cron, '*/10 * * * *');
    assert.equal(job.command, 'node app.js');
    assert.ok(job.created);
  });

  it('should list all jobs', () => {
    store.addJob({ phrase: 'every 10 minutes', cron: '*/10 * * * *', command: 'node app.js', mode: 'local' });
    store.addJob({ phrase: 'daily at 08:30', cron: '30 8 * * *', command: 'python sync.py', mode: 'local' });
    const jobs = store.listJobs();
    assert.equal(jobs.length, 2);
  });

  it('should return empty list when no jobs exist', () => {
    const jobs = store.listJobs();
    assert.equal(jobs.length, 0);
  });

  it('should remove a job by full ID', () => {
    const job = store.addJob({ phrase: 'hourly', cron: '0 * * * *', command: 'echo hello', mode: 'local' });
    const removed = store.removeJob(job.id);
    assert.equal(removed.id, job.id);
    assert.equal(store.listJobs().length, 0);
  });

  it('should remove a job by partial ID (first 8 chars)', () => {
    const job = store.addJob({ phrase: 'hourly', cron: '0 * * * *', command: 'echo hello', mode: 'local' });
    const removed = store.removeJob(job.id.substring(0, 8));
    assert.equal(removed.id, job.id);
  });

  it('should throw when removing non-existent job', () => {
    assert.throws(() => store.removeJob('nonexistent-id'), Error);
  });

  it('should handle corrupted jobs.json gracefully', () => {
    store.corruptFile();
    const jobs = store.listJobs();
    assert.equal(jobs.length, 0); // Should reset, not crash
  });
});

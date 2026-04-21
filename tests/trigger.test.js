/**
 * easycron Trigger Generator Tests
 * Validates YAML generation and config outputs.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateGitHubAction, generateUptimeRobotConfig } = require('../src/trigger');

const TEST_DIR = path.join(os.tmpdir(), '.easycron-trigger-test-' + Date.now());

afterEach(() => {
  try { fs.rmSync(TEST_DIR, { recursive: true }); } catch { /* noop */ }
});

// ─── GitHub Action Tests ─────────────────────────────────────────

describe('Trigger: GitHub Actions', () => {
  it('should generate a valid YAML file', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
    });

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('*/10 * * * *'));
    assert.ok(content.includes('https://my-app.com/api/task'));
    assert.ok(content.includes('MAX_RETRIES=3'));
    assert.ok(content.includes('RETRY_DELAY=10'));
  });

  it('should include auth header when provided', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: 'Bearer my-secret-token',
      outputDir: TEST_DIR,
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('Authorization: Bearer my-secret-token'));
  });

  it('should avoid overwriting existing files', () => {
    const path1 = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
    });

    const path2 = generateGitHubAction({
      url: 'https://my-app.com/api/other',
      cron: '0 * * * *',
      auth: null,
      outputDir: TEST_DIR,
    });

    assert.notEqual(path1, path2);
    assert.ok(path2.includes('easycron-trigger-2.yml'));
  });

  it('should include smart retry with 5xx differentiation', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('500'));
    assert.ok(content.includes('not retrying')); // 5xx should not retry
  });
});

// ─── UptimeRobot Config Tests ────────────────────────────────────

describe('Trigger: UptimeRobot', () => {
  it('should generate config text with URL and interval', () => {
    const config = generateUptimeRobotConfig({
      url: 'https://my-app.com/api/task',
      intervalMinutes: 10,
      auth: null,
    });

    assert.ok(config.includes('https://my-app.com/api/task'));
    assert.ok(config.includes('10'));
    assert.ok(config.includes('UptimeRobot'));
  });

  it('should include auth header when provided', () => {
    const config = generateUptimeRobotConfig({
      url: 'https://my-app.com/api/task',
      intervalMinutes: 10,
      auth: 'Bearer secret',
    });

    assert.ok(config.includes('Bearer secret'));
  });

  it('should enforce minimum 5-minute interval', () => {
    const config = generateUptimeRobotConfig({
      url: 'https://my-app.com/api/task',
      intervalMinutes: 2,
      auth: null,
    });

    assert.ok(config.includes('5')); // Clamped to 5
  });
});

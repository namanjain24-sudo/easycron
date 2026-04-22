/**
 * easycron Trigger Generator Tests (Phase 1 + Phase 2)
 * Validates YAML generation, config outputs, and all Phase 2 features.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  generateGitHubAction,
  generateUptimeRobotConfig,
  generateCronJobOrgConfig,
  generateKeepAwake,
} = require('../src/trigger');

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

  it('should retry on 5xx (cold-start tolerance) and fail only on 4xx', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    // 5xx should trigger retry (server cold-starting), NOT immediate failure
    assert.ok(content.includes('Server not ready'));
    // 4xx should still fail immediately (bad config)
    assert.ok(content.includes('Client error'));
    assert.ok(content.includes('400'));
  });

  it('should include 4xx client error handling', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('400'));
    assert.ok(content.includes('Client error'));
  });

  it('should support custom retries and delay', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
      retries: 5,
      delay: 20,
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('MAX_RETRIES=5'));
    assert.ok(content.includes('RETRY_DELAY=20'));
  });

  it('should support POST method with body', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
      method: 'POST',
      body: '{"action":"sync"}',
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('-X POST'));
    assert.ok(content.includes('Content-Type: application/json'));
    assert.ok(content.includes('{"action":"sync"}'));
    assert.ok(content.includes('Method: POST'));
  });

  it('should document retry config in YAML comments', () => {
    const filePath = generateGitHubAction({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
      outputDir: TEST_DIR,
      retries: 6,
      delay: 15,
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('MAX_RETRIES=6, RETRY_DELAY=15s'));
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

    assert.ok(config.includes('5 min'));
  });

  it('should include setup steps', () => {
    const config = generateUptimeRobotConfig({
      url: 'https://my-app.com/api/task',
      intervalMinutes: 10,
      auth: null,
    });

    assert.ok(config.includes('Setup Steps'));
    assert.ok(config.includes('uptimerobot.com/dashboard'));
  });
});

// ─── cron-job.org Config Tests (Phase 2) ─────────────────────────

describe('Trigger: cron-job.org', () => {
  it('should generate config text with URL and cron', () => {
    const config = generateCronJobOrgConfig({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: null,
    });

    assert.ok(config.includes('https://my-app.com/api/task'));
    assert.ok(config.includes('*/10 * * * *'));
    assert.ok(config.includes('cron-job.org'));
  });

  it('should include auth header when provided', () => {
    const config = generateCronJobOrgConfig({
      url: 'https://my-app.com/api/task',
      cron: '*/10 * * * *',
      auth: 'Bearer my-token',
    });

    assert.ok(config.includes('Bearer my-token'));
    assert.ok(config.includes('Custom Headers'));
  });

  it('should set timezone to UTC', () => {
    const config = generateCronJobOrgConfig({
      url: 'https://my-app.com/api/task',
      cron: '0 9 * * 1',
      auth: null,
    });

    assert.ok(config.includes('UTC'));
  });

  it('should include setup steps', () => {
    const config = generateCronJobOrgConfig({
      url: 'https://my-app.com/api/task',
      cron: '0 9 * * 1',
      auth: null,
    });

    assert.ok(config.includes('Setup Steps'));
    assert.ok(config.includes('CREATE CRONJOB'));
  });
});

// ─── Keep-Awake Tests (Phase 2) ──────────────────────────────────

describe('Trigger: Keep-Awake', () => {
  it('should generate Express health snippet', () => {
    const { healthSnippet } = generateKeepAwake({
      url: 'https://my-app.onrender.com',
      outputDir: TEST_DIR,
      framework: 'express',
    });

    assert.ok(healthSnippet.includes('/health'));
    assert.ok(healthSnippet.includes('app.get'));
    assert.ok(healthSnippet.includes('200'));
  });

  it('should generate Fastify health snippet', () => {
    const { healthSnippet } = generateKeepAwake({
      url: 'https://my-app.onrender.com',
      outputDir: TEST_DIR,
      framework: 'fastify',
    });

    assert.ok(healthSnippet.includes('fastify.get'));
    assert.ok(healthSnippet.includes('/health'));
  });

  it('should generate GitHub Action with 14-min interval', () => {
    const { githubPath } = generateKeepAwake({
      url: 'https://my-app.onrender.com',
      outputDir: TEST_DIR,
    });

    assert.ok(fs.existsSync(githubPath));
    const content = fs.readFileSync(githubPath, 'utf-8');
    assert.ok(content.includes('*/14 * * * *'));
    assert.ok(content.includes('/health'));
  });

  it('should generate UptimeRobot config targeting /health', () => {
    const { uptimeConfig } = generateKeepAwake({
      url: 'https://my-app.onrender.com',
      outputDir: TEST_DIR,
    });

    assert.ok(uptimeConfig.includes('/health'));
    assert.ok(uptimeConfig.includes('UptimeRobot'));
  });

  it('should append /health to base URL correctly', () => {
    const { githubPath } = generateKeepAwake({
      url: 'https://my-app.onrender.com/',
      outputDir: TEST_DIR,
    });

    const content = fs.readFileSync(githubPath, 'utf-8');
    // Should not have double slash
    assert.ok(content.includes('my-app.onrender.com/health'));
    assert.ok(!content.includes('//health'));
  });
});

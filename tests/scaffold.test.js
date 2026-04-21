/**
 * easycron Scaffold Tests (Phase 3)
 * Validates Express/Fastify endpoint boilerplate generation.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeScaffold, generateExpressScaffold, generateFastifyScaffold } = require('../src/scaffold');

const TEST_DIR = path.join(os.tmpdir(), '.easycron-scaffold-test-' + Date.now());

afterEach(() => {
  try { fs.rmSync(TEST_DIR, { recursive: true }); } catch { /* noop */ }
});

describe('Scaffold: Express', () => {
  it('should generate Express boilerplate with /health endpoint', () => {
    const code = generateExpressScaffold();
    assert.ok(code.includes("app.get('/health'"));
    assert.ok(code.includes('200'));
    assert.ok(code.includes('express'));
  });

  it('should include idempotency lock', () => {
    const code = generateExpressScaffold();
    assert.ok(code.includes('isLocked'));
    assert.ok(code.includes('setLock'));
    assert.ok(code.includes('cooldown'));
  });

  it('should include async task pattern', () => {
    const code = generateExpressScaffold();
    assert.ok(code.includes('runTaskAsync'));
    assert.ok(code.includes('async'));
  });

  it('should include API contract comment', () => {
    const code = generateExpressScaffold();
    assert.ok(code.includes('Fast Endpoint'));
    assert.ok(code.includes('Respond with 200 OK immediately'));
  });

  it('should include POST variant', () => {
    const code = generateExpressScaffold();
    assert.ok(code.includes("app.post('/api/task'"));
    assert.ok(code.includes('express.json'));
  });
});

describe('Scaffold: Fastify', () => {
  it('should generate Fastify boilerplate', () => {
    const code = generateFastifyScaffold();
    assert.ok(code.includes('fastify'));
    assert.ok(code.includes("fastify.get('/health'"));
  });

  it('should include setImmediate for async execution', () => {
    const code = generateFastifyScaffold();
    assert.ok(code.includes('setImmediate'));
  });
});

describe('Scaffold: File Writer', () => {
  it('should write scaffold file to disk', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const { filePath, framework } = writeScaffold({
      framework: 'express',
      outputDir: TEST_DIR,
    });

    assert.ok(fs.existsSync(filePath));
    assert.equal(framework, 'express');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('express'));
  });

  it('should prevent overwriting existing files', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    writeScaffold({ framework: 'express', outputDir: TEST_DIR });

    assert.throws(() => {
      writeScaffold({ framework: 'express', outputDir: TEST_DIR });
    }, /already exists/);
  });

  it('should support custom filenames', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const { filePath } = writeScaffold({
      framework: 'express',
      outputDir: TEST_DIR,
      filename: 'my-server.js',
    });

    assert.ok(filePath.endsWith('my-server.js'));
    assert.ok(fs.existsSync(filePath));
  });

  it('should reject unsupported frameworks', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    assert.throws(() => {
      writeScaffold({ framework: 'django', outputDir: TEST_DIR });
    }, /Unsupported framework/);
  });
});

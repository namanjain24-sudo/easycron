/**
 * easycron Plugin System Tests (Phase 3)
 * Validates plugin registration, ReDoS protection, sandboxed execution.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  addPlugin,
  tryPluginParse,
  getRegisteredPlugins,
  clearPlugins,
  analyzeRegexSafety,
  executeSandboxed,
} = require('../src/plugins');

afterEach(() => {
  clearPlugins();
});

// ─── ReDoS Detection Tests ───────────────────────────────────────

describe('Plugins: ReDoS Protection', () => {
  it('should accept safe regex patterns', () => {
    const result = analyzeRegexSafety(/^every\s+(\d+)\s+seconds?$/);
    assert.equal(result.safe, true);
    assert.equal(result.reason, null);
  });

  it('should reject nested quantifiers', () => {
    const result = analyzeRegexSafety(/(a+)+/);
    assert.equal(result.safe, false);
    assert.ok(result.reason.includes('Nested quantifiers'));
  });

  it('should reject excessively long patterns', () => {
    const longPattern = 'a'.repeat(250);
    const result = analyzeRegexSafety(new RegExp(longPattern));
    assert.equal(result.safe, false);
    assert.ok(result.reason.includes('max length'));
  });

  it('should reject patterns with too many quantifiers', () => {
    // 12 quantifiers
    const result = analyzeRegexSafety(/a+b+c+d+e+f+g+h+i+j+k+l+/);
    assert.equal(result.safe, false);
    assert.ok(result.reason.includes('Too many quantifiers'));
  });
});

// ─── Plugin Registration Tests ───────────────────────────────────

describe('Plugins: Registration', () => {
  it('should register a valid plugin', () => {
    const plugin = {
      name: 'test-plugin',
      patterns: [{
        match: /^every\s+(\d+)\s+seconds?$/,
        handler: (match) => ({
          cron: `*/${match[1]} * * * * *`,
          fields: { second: `*/${match[1]}` },
        }),
        description: 'every N seconds',
      }],
    };

    const result = addPlugin(plugin);
    assert.equal(result, true);
  });

  it('should reject plugin without name', () => {
    assert.throws(() => {
      addPlugin({ patterns: [] });
    }, /must have/);
  });

  it('should reject plugin with unsafe regex', () => {
    assert.throws(() => {
      addPlugin({
        name: 'bad-plugin',
        patterns: [{
          match: /(a+)+$/,
          handler: () => ({ cron: '* * * * *' }),
          description: 'bad pattern',
        }],
      });
    }, /Unsafe regex/);
  });

  it('should reject plugin without handler function', () => {
    assert.throws(() => {
      addPlugin({
        name: 'no-handler',
        patterns: [{
          match: /^test$/,
          handler: 'not a function',
          description: 'bad',
        }],
      });
    }, /must have/);
  });

  it('should convert string patterns to RegExp', () => {
    addPlugin({
      name: 'string-pattern',
      patterns: [{
        match: '^every quarter hour$',
        handler: () => ({
          cron: '*/15 * * * *',
          fields: { minute: '*/15', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
        }),
        description: 'every quarter hour',
      }],
    });

    const result = tryPluginParse('every quarter hour', 'every quarter hour');
    assert.ok(result);
    assert.equal(result.cron, '*/15 * * * *');
  });
});

// ─── Plugin Parsing Tests ────────────────────────────────────────

describe('Plugins: Parsing', () => {
  it('should match and execute plugin pattern', () => {
    addPlugin({
      name: 'custom-intervals',
      patterns: [{
        match: /^twice daily$/i,
        handler: () => ({
          cron: '0 0,12 * * *',
          fields: { minute: '0', hour: '0,12', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
          intervalMinutes: null,
        }),
        description: 'twice daily → 0 0,12 * * *',
      }],
    });

    const result = tryPluginParse('twice daily', 'twice daily');
    assert.ok(result);
    assert.equal(result.cron, '0 0,12 * * *');
    assert.equal(result.pluginName, 'custom-intervals');
  });

  it('should return null when no plugin matches', () => {
    const result = tryPluginParse('nonexistent pattern', 'nonexistent pattern');
    assert.equal(result, null);
  });
});

// ─── Sandboxed Execution Tests ───────────────────────────────────

describe('Plugins: Sandboxed Execution', () => {
  it('should execute valid handler', () => {
    const handler = () => ({
      cron: '0 * * * *',
      fields: {},
    });

    const result = executeSandboxed(handler, [], 1000);
    assert.equal(result.cron, '0 * * * *');
  });

  it('should reject handler returning invalid result', () => {
    const handler = () => ({ invalid: true });

    assert.throws(() => {
      executeSandboxed(handler, [], 1000);
    }, /must return/);
  });

  it('should catch handler errors', () => {
    const handler = () => { throw new Error('broken'); };

    assert.throws(() => {
      executeSandboxed(handler, [], 1000);
    }, /Plugin handler error/);
  });
});

// ─── Plugin Registry Tests ───────────────────────────────────────

describe('Plugins: Registry', () => {
  it('should list registered plugins', () => {
    addPlugin({
      name: 'my-plugin',
      patterns: [{
        match: /^test$/,
        handler: () => ({ cron: '* * * * *', fields: {} }),
        description: 'test pattern',
      }],
    });

    const plugins = getRegisteredPlugins();
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].name, 'my-plugin');
    assert.equal(plugins[0].patternCount, 1);
  });

  it('should clear all plugins', () => {
    addPlugin({
      name: 'temp',
      patterns: [{
        match: /^temp$/,
        handler: () => ({ cron: '* * * * *', fields: {} }),
        description: 'temp',
      }],
    });

    clearPlugins();
    assert.equal(getRegisteredPlugins().length, 0);
  });
});

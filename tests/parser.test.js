/**
 * easycron Parser Tests
 * Covers all 20+ patterns and edge cases from the roadmap.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseSchedule, ParseError } = require('../src/parser');

// ─── Minute Intervals ───────────────────────────────────────────

describe('Parser: Minute Intervals', () => {
  it('should parse "every 10 minutes"', () => {
    const result = parseSchedule('every 10 minutes');
    assert.equal(result.cron, '*/10 * * * *');
    assert.equal(result.intervalMinutes, 10);
  });

  it('should parse "every 1 minute" (singular)', () => {
    const result = parseSchedule('every 1 minute');
    assert.equal(result.cron, '*/1 * * * *');
  });

  it('should parse "every 30 minutes"', () => {
    const result = parseSchedule('every 30 minutes');
    assert.equal(result.cron, '*/30 * * * *');
  });

  it('should reject unsupported minute intervals', () => {
    assert.throws(() => parseSchedule('every 7 minutes'), ParseError);
  });

  it('should reject floating-point minutes', () => {
    assert.throws(() => parseSchedule('every 1.5 minutes'), ParseError);
  });

  it('should reject out-of-range minutes', () => {
    assert.throws(() => parseSchedule('every 999 minutes'), ParseError);
  });
});

// ─── Hour Intervals ─────────────────────────────────────────────

describe('Parser: Hour Intervals', () => {
  it('should parse "every 2 hours"', () => {
    const result = parseSchedule('every 2 hours');
    assert.equal(result.cron, '0 */2 * * *');
    assert.equal(result.intervalMinutes, 120);
  });

  it('should parse "every 1 hour" (singular)', () => {
    const result = parseSchedule('every 1 hour');
    assert.equal(result.cron, '0 */1 * * *');
  });

  it('should reject unsupported hour intervals', () => {
    assert.throws(() => parseSchedule('every 5 hours'), ParseError);
  });

  it('should reject floating-point hours', () => {
    assert.throws(() => parseSchedule('every 1.5 hours'), ParseError);
  });
});

// ─── Daily Schedules ────────────────────────────────────────────

describe('Parser: Daily Schedules', () => {
  it('should parse "daily at 08:30"', () => {
    const result = parseSchedule('daily at 08:30');
    assert.equal(result.cron, '30 8 * * *');
  });

  it('should parse "daily at 2am"', () => {
    const result = parseSchedule('daily at 2am');
    assert.equal(result.cron, '0 2 * * *');
  });

  it('should parse "daily at 2pm"', () => {
    const result = parseSchedule('daily at 2pm');
    assert.equal(result.cron, '0 14 * * *');
  });

  it('should parse "daily at 2:30pm"', () => {
    const result = parseSchedule('daily at 2:30pm');
    assert.equal(result.cron, '30 14 * * *');
  });

  it('should parse "daily at 12am" (midnight)', () => {
    const result = parseSchedule('daily at 12am');
    assert.equal(result.cron, '0 0 * * *');
  });

  it('should parse "daily at 12pm" (noon)', () => {
    const result = parseSchedule('daily at 12pm');
    assert.equal(result.cron, '0 12 * * *');
  });

  it('should reject invalid hours', () => {
    assert.throws(() => parseSchedule('daily at 25:00'), ParseError);
  });

  it('should reject invalid minutes', () => {
    assert.throws(() => parseSchedule('daily at 08:60'), ParseError);
  });
});

// ─── Weekly Schedules ───────────────────────────────────────────

describe('Parser: Weekly Schedules', () => {
  it('should parse "every monday at 09:00"', () => {
    const result = parseSchedule('every monday at 09:00');
    assert.equal(result.cron, '0 9 * * 1');
  });

  it('should parse "every friday at 5pm"', () => {
    const result = parseSchedule('every friday at 5pm');
    assert.equal(result.cron, '0 17 * * 5');
  });

  it('should parse "every sunday at 10:30am"', () => {
    const result = parseSchedule('every sunday at 10:30am');
    assert.equal(result.cron, '30 10 * * 0');
  });

  it('should parse abbreviated day names', () => {
    const result = parseSchedule('every mon at 09:00');
    assert.equal(result.cron, '0 9 * * 1');
  });
});

// ─── Weekday / Weekend ──────────────────────────────────────────

describe('Parser: Weekday / Weekend', () => {
  it('should parse "every weekday at 14:00"', () => {
    const result = parseSchedule('every weekday at 14:00');
    assert.equal(result.cron, '0 14 * * 1-5');
  });

  it('should parse "every weekend at 10am"', () => {
    const result = parseSchedule('every weekend at 10am');
    assert.equal(result.cron, '0 10 * * 0,6');
  });
});

// ─── Shorthands ─────────────────────────────────────────────────

describe('Parser: Shorthands', () => {
  it('should parse "hourly"', () => {
    const result = parseSchedule('hourly');
    assert.equal(result.cron, '0 * * * *');
    assert.equal(result.intervalMinutes, 60);
  });

  it('should parse "midnight"', () => {
    const result = parseSchedule('midnight');
    assert.equal(result.cron, '0 0 * * *');
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────

describe('Parser: Edge Cases', () => {
  it('should handle extra whitespace', () => {
    const result = parseSchedule('every    10   minutes');
    assert.equal(result.cron, '*/10 * * * *');
  });

  it('should handle mixed case', () => {
    const result = parseSchedule('EVERY Monday AT 14:00');
    assert.equal(result.cron, '0 14 * * 1');
  });

  it('should handle leading/trailing whitespace', () => {
    const result = parseSchedule('  daily at 08:30  ');
    assert.equal(result.cron, '30 8 * * *');
  });

  it('should reject empty input', () => {
    assert.throws(() => parseSchedule(''), ParseError);
  });

  it('should reject null input', () => {
    assert.throws(() => parseSchedule(null), ParseError);
  });

  it('should reject completely random input', () => {
    assert.throws(() => parseSchedule('whenever you feel like it'), ParseError);
  });

  it('should return the raw phrase in the result', () => {
    const result = parseSchedule('every 10 minutes');
    assert.equal(result.raw, 'every 10 minutes');
  });

  it('should return fields object', () => {
    const result = parseSchedule('daily at 08:30');
    assert.equal(result.fields.minute, '30');
    assert.equal(result.fields.hour, '8');
    assert.equal(result.fields.dayOfMonth, '*');
    assert.equal(result.fields.month, '*');
    assert.equal(result.fields.dayOfWeek, '*');
  });
});

/**
 * easycron Parser Engine
 * Converts plain English schedule phrases into cron expressions.
 *
 * Deterministic, regex-based. No fuzzy matching. No ML.
 * Handles 20+ patterns as defined in the PRD.
 *
 * Edge cases handled:
 *   - Variable whitespace ("every    10   minutes")
 *   - Case insensitivity ("EVERY Monday AT 14:00")
 *   - Singular/plural ("every 1 minute" / "every 1 minutes")
 *   - Floating-point rejection ("every 1.5 hours")
 *   - Out-of-range values ("every 999 minutes")
 *   - 12h time formats ("daily at 2am", "daily at 2:30pm")
 */

'use strict';

const { loadPlugins, tryPluginParse } = require('./plugins');

// ─── Constants ───────────────────────────────────────────────────

const DAY_MAP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const VALID_MINUTE_INTERVALS = [1, 2, 3, 5, 10, 15, 20, 30];
const VALID_HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12];

// ─── Error Class ─────────────────────────────────────────────────

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

// ─── Time Parsing Helper ─────────────────────────────────────────

/**
 * Parses time strings like "08:30", "2am", "2:30pm", "14:00"
 * Returns { hour: number, minute: number }
 */
function parseTime(timeStr) {
  const cleaned = timeStr.trim().toLowerCase();

  // Match "2am", "2pm", "11am", "12pm"
  const ampmSimple = cleaned.match(/^(\d{1,2})(am|pm)$/);
  if (ampmSimple) {
    let hour = parseInt(ampmSimple[1], 10);
    const period = ampmSimple[2];
    if (hour < 1 || hour > 12) {
      throw new ParseError(`Invalid hour: ${hour}. Must be 1-12 for am/pm format.`);
    }
    if (period === 'am') {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
    return { hour, minute: 0 };
  }

  // Match "2:30am", "2:30pm"
  const ampmFull = cleaned.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (ampmFull) {
    let hour = parseInt(ampmFull[1], 10);
    const minute = parseInt(ampmFull[2], 10);
    const period = ampmFull[3];
    if (hour < 1 || hour > 12) {
      throw new ParseError(`Invalid hour: ${hour}. Must be 1-12 for am/pm format.`);
    }
    if (minute < 0 || minute > 59) {
      throw new ParseError(`Invalid minute: ${minute}. Must be 0-59.`);
    }
    if (period === 'am') {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
    return { hour, minute };
  }

  // Match "08:30", "14:00", "0:00"
  const hhmm = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hour = parseInt(hhmm[1], 10);
    const minute = parseInt(hhmm[2], 10);
    if (hour < 0 || hour > 23) {
      throw new ParseError(`Invalid hour: ${hour}. Must be 0-23 for 24h format.`);
    }
    if (minute < 0 || minute > 59) {
      throw new ParseError(`Invalid minute: ${minute}. Must be 0-59.`);
    }
    return { hour, minute };
  }

  throw new ParseError(
    `Cannot parse time "${timeStr}". Use formats like "08:30", "2am", "2:30pm", or "14:00".`
  );
}

// ─── Normalization ───────────────────────────────────────────────

/**
 * Normalize input: lowercase, collapse whitespace, trim
 */
function normalize(input) {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── Plugin Loading (Phase 3) ────────────────────────────────────

let pluginsLoaded = false;

function ensurePluginsLoaded() {
  if (!pluginsLoaded) {
    pluginsLoaded = true;
    const { loaded, errors } = loadPlugins();
    if (errors.length > 0) {
      for (const err of errors) {
        console.warn(`⚠️  Plugin load error: ${err}`);
      }
    }
  }
}

// ─── Main Parser ─────────────────────────────────────────────────

/**
 * Parse a plain English schedule phrase into a cron expression.
 * Tries built-in patterns first, then community plugins.
 *
 * @param {string} input - The schedule phrase
 * @returns {{ cron: string, fields: object, raw: string, intervalMinutes: number|null }}
 * @throws {ParseError}
 */
function parseSchedule(input) {
  ensurePluginsLoaded();
  if (!input || typeof input !== 'string') {
    throw new ParseError('Schedule input is required and must be a non-empty string.');
  }

  const raw = input;
  const text = normalize(input);

  // ── Shorthand: "hourly" ──
  if (text === 'hourly') {
    return buildResult('0 * * * *', { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' }, raw, 60);
  }

  // ── Shorthand: "midnight" ──
  if (text === 'midnight') {
    return buildResult('0 0 * * *', { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '*' }, raw, null);
  }

  // ── Pattern: "every X minutes" ──
  const minMatch = text.match(/^every\s+(\d+(?:\.\d+)?)\s+minutes?$/);
  if (minMatch) {
    const val = minMatch[1];
    validateInteger(val, 'minutes');
    const num = parseInt(val, 10);
    if (num < 1 || num > 59) {
      throw new ParseError(`Minute interval must be between 1 and 59. Got: ${num}`);
    }
    if (!VALID_MINUTE_INTERVALS.includes(num)) {
      throw new ParseError(
        `Minute interval ${num} is not supported. Supported: ${VALID_MINUTE_INTERVALS.join(', ')}`
      );
    }
    const cron = `*/${num} * * * *`;
    return buildResult(cron, { minute: `*/${num}`, hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' }, raw, num);
  }

  // ── Pattern: "every X hours" ──
  const hourMatch = text.match(/^every\s+(\d+(?:\.\d+)?)\s+hours?$/);
  if (hourMatch) {
    const val = hourMatch[1];
    validateInteger(val, 'hours');
    const num = parseInt(val, 10);
    if (num < 1 || num > 23) {
      throw new ParseError(`Hour interval must be between 1 and 23. Got: ${num}`);
    }
    if (!VALID_HOUR_INTERVALS.includes(num)) {
      throw new ParseError(
        `Hour interval ${num} is not supported. Supported: ${VALID_HOUR_INTERVALS.join(', ')}`
      );
    }
    const cron = `0 */${num} * * *`;
    return buildResult(cron, { minute: '0', hour: `*/${num}`, dayOfMonth: '*', month: '*', dayOfWeek: '*' }, raw, num * 60);
  }

  // ── Pattern: "daily at HH:MM" ──
  const dailyMatch = text.match(/^daily\s+at\s+(.+)$/);
  if (dailyMatch) {
    const { hour, minute } = parseTime(dailyMatch[1]);
    const cron = `${minute} ${hour} * * *`;
    return buildResult(cron, { minute: String(minute), hour: String(hour), dayOfMonth: '*', month: '*', dayOfWeek: '*' }, raw, null);
  }

  // ── Pattern: "every [weekday] at HH:MM" ──
  const dayMatch = text.match(/^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s+at\s+(.+)$/);
  if (dayMatch) {
    const dayNum = DAY_MAP[dayMatch[1]];
    const { hour, minute } = parseTime(dayMatch[2]);
    const cron = `${minute} ${hour} * * ${dayNum}`;
    return buildResult(cron, { minute: String(minute), hour: String(hour), dayOfMonth: '*', month: '*', dayOfWeek: String(dayNum) }, raw, null);
  }

  // ── Pattern: "every weekday at HH:MM" (Mon-Fri) ──
  const weekdayMatch = text.match(/^every\s+weekday\s+at\s+(.+)$/);
  if (weekdayMatch) {
    const { hour, minute } = parseTime(weekdayMatch[1]);
    const cron = `${minute} ${hour} * * 1-5`;
    return buildResult(cron, { minute: String(minute), hour: String(hour), dayOfMonth: '*', month: '*', dayOfWeek: '1-5' }, raw, null);
  }

  // ── Pattern: "every weekend at HH:MM" (Sat-Sun) ──
  const weekendMatch = text.match(/^every\s+weekend\s+at\s+(.+)$/);
  if (weekendMatch) {
    const { hour, minute } = parseTime(weekendMatch[1]);
    const cron = `${minute} ${hour} * * 0,6`;
    return buildResult(cron, { minute: String(minute), hour: String(hour), dayOfMonth: '*', month: '*', dayOfWeek: '0,6' }, raw, null);
  }

  // ── Try community plugins before failing ──
  const pluginResult = tryPluginParse(text, raw);
  if (pluginResult) {
    return pluginResult;
  }

  // ── Fallback: Unrecognized input ──
  throw new ParseError(
    `Unrecognized schedule: "${raw}"\n` +
    '\n  Supported patterns:\n' +
    '    • "every 10 minutes"        → */10 * * * *\n' +
    '    • "every 2 hours"           → 0 */2 * * *\n' +
    '    • "daily at 08:30"          → 30 8 * * *\n' +
    '    • "daily at 2pm"            → 0 14 * * *\n' +
    '    • "every monday at 09:00"   → 0 9 * * 1\n' +
    '    • "every weekday at 14:00"  → 0 14 * * 1-5\n' +
    '    • "every weekend at 10am"   → 0 10 * * 0,6\n' +
    '    • "hourly"                  → 0 * * * *\n' +
    '    • "midnight"                → 0 0 * * *'
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function validateInteger(value, unit) {
  if (value.includes('.')) {
    throw new ParseError(
      `Fractional ${unit} are not supported. Cron requires whole numbers. Got: ${value}`
    );
  }
}

function buildResult(cron, fields, raw, intervalMinutes) {
  return { cron, fields, raw, intervalMinutes };
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = { parseSchedule, ParseError };

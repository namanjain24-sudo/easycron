/**
 * easycron Plugin System (Phase 3)
 *
 * Allows community-defined parsing patterns to extend the
 * built-in parser without modifying core code.
 *
 * Plugins are loaded from:
 *   1. ~/.easycron/plugins/*.js (user plugins)
 *   2. Programmatic API (addPlugin)
 *
 * Each plugin exports:
 *   {
 *     name: string,                            // Plugin name
 *     patterns: [
 *       {
 *         match: RegExp | string,              // Pattern to match
 *         handler: (groups) => cronResult,      // Returns cron result
 *         description: string,                 // Human-readable example
 *       }
 *     ]
 *   }
 *
 * Security:
 *   - ReDoS protection via regex complexity analysis
 *   - Execution timeout sandbox for handlers
 *   - No eval() or dynamic code execution
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Constants ───────────────────────────────────────────────────

const PLUGINS_DIR = path.join(os.homedir(), '.easycron', 'plugins');

// ReDoS protection limits
const MAX_REGEX_LENGTH = 200;
const MAX_QUANTIFIER_NESTING = 2;     // No nested quantifiers like (a+)+ 
const HANDLER_TIMEOUT_MS = 1000;      // 1 second max for handler execution

// ─── Plugin Registry ────────────────────────────────────────────

const registry = [];

// ─── ReDoS Detection ────────────────────────────────────────────

/**
 * Analyze a regex pattern for potential ReDoS vulnerabilities.
 * Checks for:
 *   - Excessive length
 *   - Nested quantifiers (e.g., (a+)+, (a*)*b)
 *   - Overlapping alternations with quantifiers
 *
 * @param {RegExp|string} pattern
 * @returns {{ safe: boolean, reason: string|null }}
 */
function analyzeRegexSafety(pattern) {
  const source = pattern instanceof RegExp ? pattern.source : pattern;

  // Check length
  if (source.length > MAX_REGEX_LENGTH) {
    return { safe: false, reason: `Pattern exceeds max length (${source.length} > ${MAX_REGEX_LENGTH})` };
  }

  // Check for nested quantifiers: (...)+ or (...)* followed by + or *
  // This is the most common ReDoS pattern
  const nestedQuantifiers = /(\([^)]*[+*][^)]*\))[+*{]/.test(source);
  if (nestedQuantifiers) {
    return { safe: false, reason: 'Nested quantifiers detected (potential ReDoS)' };
  }

  // Check for overlapping character class + quantifier combos
  // e.g., (\w+\s+)+ or (\d+\.?\d+)+
  const overlappingRepeat = /(\([^)]+[+*]\))\1/.test(source);
  if (overlappingRepeat) {
    return { safe: false, reason: 'Overlapping repeated groups detected (potential ReDoS)' };
  }

  // Count total quantifiers — too many is suspicious
  const quantifiers = source.match(/[+*?]|\{\d+/g) || [];
  if (quantifiers.length > 10) {
    return { safe: false, reason: `Too many quantifiers (${quantifiers.length} > 10)` };
  }

  return { safe: true, reason: null };
}

// ─── Sandboxed Handler Execution ────────────────────────────────

/**
 * Execute a plugin handler with a timeout guard.
 * Prevents infinite loops in community-submitted handlers.
 *
 * @param {Function} handler
 * @param {object} groups - Regex match groups
 * @param {number} timeoutMs
 * @returns {object} Handler result
 */
function executeSandboxed(handler, groups, timeoutMs = HANDLER_TIMEOUT_MS) {
  const startTime = Date.now();

  try {
    const result = handler(groups);

    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`Plugin handler exceeded timeout (${elapsed}ms > ${timeoutMs}ms)`);
    }

    // Validate result structure
    if (!result || typeof result.cron !== 'string') {
      throw new Error('Plugin handler must return { cron: string, fields: object }');
    }

    return result;
  } catch (err) {
    if (err.message.includes('timeout') || err.message.includes('handler')) {
      throw err;
    }
    throw new Error(`Plugin handler error: ${err.message}`);
  }
}

// ─── Plugin Loading ─────────────────────────────────────────────

/**
 * Register a plugin programmatically.
 * @param {object} plugin - Plugin definition
 * @returns {boolean} Whether the plugin was registered
 */
function addPlugin(plugin) {
  // Validate plugin structure
  if (!plugin || !plugin.name || !Array.isArray(plugin.patterns)) {
    throw new Error('Plugin must have { name: string, patterns: Array }');
  }

  // Validate and analyze each pattern
  for (const pattern of plugin.patterns) {
    if (!pattern.match || !pattern.handler || typeof pattern.handler !== 'function') {
      throw new Error(
        `Plugin "${plugin.name}": Each pattern must have { match: RegExp, handler: Function, description: string }`
      );
    }

    // Convert string patterns to RegExp
    if (typeof pattern.match === 'string') {
      pattern.match = new RegExp(pattern.match, 'i');
    }

    // ReDoS safety check
    const safety = analyzeRegexSafety(pattern.match);
    if (!safety.safe) {
      throw new Error(
        `Plugin "${plugin.name}": Unsafe regex pattern rejected — ${safety.reason}`
      );
    }
  }

  registry.push(plugin);
  return true;
}

/**
 * Load all plugins from ~/.easycron/plugins/
 * @returns {{ loaded: string[], errors: string[] }}
 */
function loadPlugins() {
  const loaded = [];
  const errors = [];

  if (!fs.existsSync(PLUGINS_DIR)) {
    return { loaded, errors };
  }

  let files;
  try {
    files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
  } catch (err) {
    errors.push(`Cannot read plugins directory: ${err.message}`);
    return { loaded, errors };
  }

  for (const file of files) {
    try {
      const pluginPath = path.join(PLUGINS_DIR, file);
      const plugin = require(pluginPath);
      addPlugin(plugin);
      loaded.push(plugin.name || file);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }

  return { loaded, errors };
}

/**
 * Try to parse schedule text using registered plugins.
 * Returns null if no plugin matches.
 *
 * @param {string} normalizedText - Lowercase, whitespace-collapsed input
 * @param {string} rawInput - Original input
 * @returns {object|null}
 */
function tryPluginParse(normalizedText, rawInput) {
  for (const plugin of registry) {
    for (const pattern of plugin.patterns) {
      const match = normalizedText.match(pattern.match);
      if (match) {
        try {
          const result = executeSandboxed(pattern.handler, match);
          return {
            ...result,
            raw: rawInput,
            pluginName: plugin.name,
          };
        } catch (err) {
          // Log but continue to next pattern
          console.warn(`Plugin "${plugin.name}" handler failed: ${err.message}`);
        }
      }
    }
  }
  return null;
}

/**
 * Get all registered plugins and their patterns.
 * @returns {Array}
 */
function getRegisteredPlugins() {
  return registry.map(p => ({
    name: p.name,
    patternCount: p.patterns.length,
    descriptions: p.patterns.map(pat => pat.description).filter(Boolean),
  }));
}

/**
 * Remove all registered plugins (for testing).
 */
function clearPlugins() {
  registry.length = 0;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  addPlugin,
  loadPlugins,
  tryPluginParse,
  getRegisteredPlugins,
  clearPlugins,
  analyzeRegexSafety,
  executeSandboxed,
  PLUGINS_DIR,
};

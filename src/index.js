/**
 * easycron — Public API
 * Exports core modules for programmatic usage.
 */

'use strict';

const { parseSchedule, ParseError } = require('./parser');
const { addJob, listJobs, removeJob, getJobLogs, logExecution } = require('./store');
const { startScheduler, rehydrateAll, stopJob } = require('./scheduler');
const {
  generateGitHubAction,
  generateUptimeRobotConfig,
  generateCronJobOrgConfig,
  generateKeepAwake,
} = require('./trigger');
const { writeScaffold, generateExpressScaffold, generateFastifyScaffold } = require('./scaffold');
const { addPlugin, loadPlugins, getRegisteredPlugins, analyzeRegexSafety } = require('./plugins');

module.exports = {
  // Parser
  parseSchedule,
  ParseError,

  // Store
  addJob,
  listJobs,
  removeJob,
  getJobLogs,
  logExecution,

  // Scheduler
  startScheduler,
  rehydrateAll,
  stopJob,

  // Trigger generators
  generateGitHubAction,
  generateUptimeRobotConfig,
  generateCronJobOrgConfig,
  generateKeepAwake,

  // Scaffold (Phase 3)
  writeScaffold,
  generateExpressScaffold,
  generateFastifyScaffold,

  // Plugins (Phase 3)
  addPlugin,
  loadPlugins,
  getRegisteredPlugins,
  analyzeRegexSafety,
};

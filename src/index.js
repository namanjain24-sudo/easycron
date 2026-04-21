/**
 * easycron — Public API
 * Exports core modules for programmatic usage.
 */

'use strict';

const { parseSchedule, ParseError } = require('./parser');
const { addJob, listJobs, removeJob, getJobLogs } = require('./store');
const { startScheduler, rehydrateAll, stopJob } = require('./scheduler');
const {
  generateGitHubAction,
  generateUptimeRobotConfig,
  generateCronJobOrgConfig,
  generateKeepAwake,
} = require('./trigger');

module.exports = {
  // Parser
  parseSchedule,
  ParseError,

  // Store
  addJob,
  listJobs,
  removeJob,
  getJobLogs,

  // Scheduler
  startScheduler,
  rehydrateAll,
  stopJob,

  // Trigger generators
  generateGitHubAction,
  generateUptimeRobotConfig,
  generateCronJobOrgConfig,
  generateKeepAwake,
};

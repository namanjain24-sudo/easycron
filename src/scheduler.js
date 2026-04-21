/**
 * easycron Scheduler Engine
 * Wraps node-cron to execute user commands on a parsed schedule.
 *
 * Handles:
 *   - Starting a single job from CLI invocation
 *   - Rehydrating all persisted jobs from jobs.json
 *   - Graceful process shutdown (SIGINT/SIGTERM)
 */

'use strict';

const cron = require('node-cron');
const { exec } = require('child_process');
const chalk = require('chalk');

// Track active tasks for cleanup
const activeTasks = new Map();

// ─── Start Single Job ────────────────────────────────────────────

/**
 * Start scheduling a single job.
 * @param {{ id: string, cron: string, command: string, phrase: string }} job
 */
function startScheduler(job) {
  if (!cron.validate(job.cron)) {
    console.error(chalk.red(`\n✖ Invalid cron expression: ${job.cron}`));
    process.exit(1);
  }

  console.log(chalk.green('✔') + ' Scheduler started for: ' + chalk.cyan(job.phrase));
  console.log(chalk.gray('  Press Ctrl+C to stop.\n'));

  const task = cron.schedule(job.cron, () => {
    const timestamp = new Date().toISOString();
    console.log(chalk.gray(`[${timestamp}]`) + ' Running: ' + chalk.white(job.command));

    exec(job.command, { timeout: 60000 }, (error, stdout, stderr) => {
      if (stdout) {
        process.stdout.write(stdout);
      }
      if (stderr) {
        process.stderr.write(chalk.yellow(stderr));
      }
      if (error) {
        console.error(chalk.red(`\n✖ Command failed (exit code ${error.code}): `) + error.message);
      }
    });
  });

  activeTasks.set(job.id, task);

  // Graceful shutdown
  const shutdown = () => {
    console.log(chalk.yellow('\n\n⏹  Scheduler stopped. Jobs are still persisted in ~/.easycron/jobs.json'));
    console.log(chalk.gray('  Run `easycron list` to view them.\n'));
    task.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ─── Rehydrate All Jobs ──────────────────────────────────────────

/**
 * Start schedulers for all persisted local jobs.
 * Used when running easycron in daemon mode.
 * @param {Array} jobs - Array of job objects from store
 */
function rehydrateAll(jobs) {
  const localJobs = jobs.filter((j) => j.mode === 'local');

  if (localJobs.length === 0) {
    console.log(chalk.yellow('📭 No local jobs to rehydrate.\n'));
    return;
  }

  console.log(chalk.bold(`⏳ Rehydrating ${localJobs.length} job(s)...\n`));

  for (const job of localJobs) {
    if (!cron.validate(job.cron)) {
      console.warn(chalk.yellow(`⚠️  Skipping invalid cron for job ${job.id}: ${job.cron}`));
      continue;
    }

    const task = cron.schedule(job.cron, () => {
      const timestamp = new Date().toISOString();
      console.log(chalk.gray(`[${timestamp}]`) + ' Running: ' + chalk.white(job.command));

      exec(job.command, { timeout: 60000 }, (error, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(chalk.yellow(stderr));
        if (error) {
          console.error(chalk.red(`✖ Job ${job.id.substring(0, 8)} failed: `) + error.message);
        }
      });
    });

    activeTasks.set(job.id, task);
    console.log(chalk.green('  ✔') + ' ' + chalk.gray(job.id.substring(0, 8)) + ' → ' + chalk.cyan(job.phrase));
  }

  console.log(chalk.gray('\n  Press Ctrl+C to stop all.\n'));

  // Graceful shutdown for all
  const shutdown = () => {
    console.log(chalk.yellow('\n\n⏹  All schedulers stopped.'));
    for (const [, task] of activeTasks) {
      task.stop();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ─── Stop Job ────────────────────────────────────────────────────

/**
 * Stop a running scheduled task by job ID.
 * @param {string} jobId
 * @returns {boolean} Whether the task was found and stopped
 */
function stopJob(jobId) {
  const task = activeTasks.get(jobId);
  if (task) {
    task.stop();
    activeTasks.delete(jobId);
    return true;
  }
  return false;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = { startScheduler, rehydrateAll, stopJob };

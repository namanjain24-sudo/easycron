#!/usr/bin/env node

/**
 * easycron CLI Entry Point
 * Human-friendly cron scheduling + external triggers for free-tier servers.
 */

'use strict';

const { program } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

const { parseSchedule } = require('../src/parser');
const { addJob, listJobs, removeJob, getJobLogs } = require('../src/store');
const { startScheduler } = require('../src/scheduler');
const { generateGitHubAction, generateUptimeRobotConfig } = require('../src/trigger');

// ─── Program Setup ───────────────────────────────────────────────

program
  .name('easycron')
  .description(chalk.bold('⏳ easycron') + ' — Human-friendly cron scheduling for free-tier servers')
  .version(pkg.version, '-v, --version');

// ─── Default Command: Local Scheduling ───────────────────────────
// Usage: easycron "every 10 minutes" -- node app.js

program
  .argument('[schedule]', 'Plain English schedule (e.g. "every 10 minutes")')
  .option('--explain', 'Dry-run: show parsed cron expression without scheduling')
  .option('--', '')
  .action((schedule, options, command) => {
    if (!schedule) {
      program.help();
      return;
    }

    // Parse schedule
    let result;
    try {
      result = parseSchedule(schedule);
    } catch (err) {
      console.error(chalk.red('\n✖ Parse Error: ') + err.message);
      console.error(chalk.gray('\nSupported patterns:'));
      console.error(chalk.gray('  • "every 10 minutes"'));
      console.error(chalk.gray('  • "every 2 hours"'));
      console.error(chalk.gray('  • "daily at 08:30"'));
      console.error(chalk.gray('  • "every monday at 09:00"'));
      console.error(chalk.gray('  • "every weekday at 14:00"'));
      console.error(chalk.gray('  • "hourly"'));
      console.error(chalk.gray('  • "midnight"'));
      process.exit(1);
    }

    console.log(chalk.green('✔') + ' Schedule parsed: ' + chalk.cyan(schedule));
    console.log(chalk.green('✔') + ' Cron: ' + chalk.bold(result.cron));

    // Explain mode: print and exit
    if (options.explain) {
      console.log(chalk.yellow('\n⚠️  Note: GitHub Actions external triggers use UTC time.'));
      console.log(chalk.gray('   Local mode uses your system timezone.\n'));
      return;
    }

    // Extract the command after "--" from raw args
    const rawArgs = process.argv;
    const dashIndex = rawArgs.indexOf('--');
    if (dashIndex === -1 || dashIndex === rawArgs.length - 1) {
      console.error(chalk.red('\n✖ No command specified.'));
      console.error(chalk.gray('  Usage: easycron "every 10 minutes" -- node app.js\n'));
      process.exit(1);
    }

    const userCommand = rawArgs.slice(dashIndex + 1).join(' ');

    // Persist job
    const job = addJob({
      phrase: schedule,
      cron: result.cron,
      command: userCommand,
      mode: 'local',
    });

    console.log(chalk.green('✔') + ' Job registered: ' + chalk.gray(job.id));
    console.log(chalk.yellow('\n⚠️  Note: easycron runs in the foreground.'));
    console.log(chalk.yellow('   Closing this terminal will stop the scheduler.'));
    console.log(chalk.yellow('   For background execution, use: pm2 start easycron -- "' + schedule + '" -- ' + userCommand + '\n'));

    // Start the scheduler
    startScheduler(job);
  });

// ─── Explain Command ─────────────────────────────────────────────

program
  .command('explain <schedule>')
  .description('Show what a schedule phrase translates to in cron syntax')
  .action((schedule) => {
    let result;
    try {
      result = parseSchedule(schedule);
    } catch (err) {
      console.error(chalk.red('\n✖ Parse Error: ') + err.message);
      process.exit(1);
    }

    console.log(chalk.green('✔') + ' Schedule parsed: ' + chalk.cyan(schedule));
    console.log(chalk.green('✔') + ' Cron: ' + chalk.bold(result.cron));
    console.log(chalk.gray('\n  Fields: minute(' + result.fields.minute + ') hour(' + result.fields.hour + ') day(' + result.fields.dayOfMonth + ') month(' + result.fields.month + ') weekday(' + result.fields.dayOfWeek + ')'));
    console.log(chalk.yellow('\n⚠️  Note: GitHub Actions external triggers use UTC time.'));
    console.log(chalk.gray('   Local mode uses your system timezone.\n'));
  });

// ─── List Command ────────────────────────────────────────────────

program
  .command('list')
  .description('Show all registered jobs')
  .action(() => {
    const jobs = listJobs();

    if (jobs.length === 0) {
      console.log(chalk.yellow('\n📭 No jobs registered yet.\n'));
      console.log(chalk.gray('  Get started:'));
      console.log(chalk.gray('    easycron "every 10 minutes" -- node app.js'));
      console.log(chalk.gray('    easycron external https://api.my-app.com/task "every 10 minutes"\n'));
      return;
    }

    console.log(chalk.bold('\n⏳ Registered Jobs\n'));
    console.log(chalk.gray('─'.repeat(90)));
    console.log(
      chalk.bold('  ID'.padEnd(12)) +
      chalk.bold('Mode'.padEnd(10)) +
      chalk.bold('Cron'.padEnd(18)) +
      chalk.bold('Phrase'.padEnd(25)) +
      chalk.bold('Command')
    );
    console.log(chalk.gray('─'.repeat(90)));

    for (const job of jobs) {
      const cmd = job.command.length > 30 ? job.command.substring(0, 27) + '...' : job.command;
      const phrase = job.phrase.length > 22 ? job.phrase.substring(0, 19) + '...' : job.phrase;
      console.log(
        '  ' + chalk.cyan(job.id.substring(0, 8).padEnd(10)) +
        chalk.magenta(job.mode.padEnd(10)) +
        chalk.white(job.cron.padEnd(18)) +
        chalk.gray(phrase.padEnd(25)) +
        chalk.white(cmd)
      );
    }

    console.log(chalk.gray('─'.repeat(90)));
    console.log(chalk.gray('\n  Total: ' + jobs.length + ' job(s)\n'));
  });

// ─── Remove Command ──────────────────────────────────────────────

program
  .command('remove <id>')
  .description('Remove a job by its ID (or first 8 characters)')
  .action((id) => {
    try {
      const removed = removeJob(id);
      console.log(chalk.green('✔') + ' Job removed: ' + chalk.gray(removed.id));
      console.log(chalk.gray('  Was: "' + removed.phrase + '" → ' + removed.command + '\n'));
    } catch (err) {
      console.error(chalk.red('\n✖ ') + err.message);
      console.error(chalk.gray('  Run `easycron list` to see valid job IDs.\n'));
      process.exit(1);
    }
  });

// ─── External Trigger Command ────────────────────────────────────

program
  .command('external <url> <schedule>')
  .description('Generate external trigger configs (GitHub Actions, UptimeRobot)')
  .option('--auth <token>', 'Authorization header for the target endpoint (e.g. "Bearer TOKEN")')
  .option('--redundant', 'Generate configs for multiple trigger providers simultaneously')
  .option('--provider <name>', 'Trigger provider: github (default), uptimerobot, cronjob', 'github')
  .option('--output <path>', 'Output directory for generated files', '.')
  .action((url, schedule, options) => {
    // URL validation
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        console.error(chalk.red('\n✖ Invalid URL: ') + 'Cannot use localhost for external triggers.');
        console.error(chalk.gray('  External triggers run from GitHub/UptimeRobot servers — they cannot reach your local machine.'));
        console.error(chalk.gray('  Use a deployed URL like: https://your-app.onrender.com/api/task\n'));
        process.exit(1);
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        console.error(chalk.red('\n✖ Invalid URL protocol. Use https:// or http://\n'));
        process.exit(1);
      }
    } catch {
      console.error(chalk.red('\n✖ Invalid URL: ') + 'Please provide a fully qualified URL.');
      console.error(chalk.gray('  Example: https://your-app.onrender.com/api/task\n'));
      process.exit(1);
    }

    // Parse schedule
    let result;
    try {
      result = parseSchedule(schedule);
    } catch (err) {
      console.error(chalk.red('\n✖ Parse Error: ') + err.message);
      process.exit(1);
    }

    console.log(chalk.green('✔') + ' Schedule parsed: ' + chalk.cyan(schedule));
    console.log(chalk.green('✔') + ' Cron: ' + chalk.bold(result.cron));

    // Warn about aggressive intervals
    if (result.intervalMinutes && result.intervalMinutes < 5) {
      console.log(chalk.yellow('\n⚠️  Warning: Intervals under 5 minutes may rapidly exhaust GitHub Actions free tier limits.'));
      console.log(chalk.yellow('   Free tier = 2,000 min/month. At every ' + result.intervalMinutes + ' min, that\'s ~' + Math.round(43200 / (60 / result.intervalMinutes)) + ' runs/month.\n'));
    }

    // Generate configs
    const providers = options.redundant
      ? ['github', 'uptimerobot']
      : [options.provider];

    for (const provider of providers) {
      switch (provider) {
        case 'github': {
          const outputPath = generateGitHubAction({
            url,
            cron: result.cron,
            auth: options.auth || null,
            outputDir: options.output,
          });
          console.log(chalk.green('✔') + ' GitHub Action generated at:');
          console.log('  ' + chalk.cyan(outputPath));
          break;
        }
        case 'uptimerobot': {
          const config = generateUptimeRobotConfig({
            url,
            intervalMinutes: result.intervalMinutes || 5,
            auth: options.auth || null,
          });
          console.log(chalk.green('✔') + ' UptimeRobot config:');
          console.log(chalk.gray(config));
          break;
        }
        default:
          console.error(chalk.red('\n✖ Unknown provider: ') + provider);
          console.error(chalk.gray('  Supported: github, uptimerobot\n'));
          process.exit(1);
      }
    }

    // Persist as external job
    const job = addJob({
      phrase: schedule,
      cron: result.cron,
      command: url,
      mode: 'external',
    });

    console.log(chalk.green('✔') + ' Job tracked: ' + chalk.gray(job.id));
    console.log(chalk.yellow('\n⚠️  Reminder: GitHub Actions schedules use UTC time.'));
    console.log(chalk.gray('   Commit the generated YAML file to your repo to activate.\n'));
  });

// ─── Parse & Execute ─────────────────────────────────────────────

program.parse(process.argv);

#!/usr/bin/env node

/**
 * easycron CLI Entry Point
 * Human-friendly cron scheduling + external triggers for free-tier servers.
 *
 * Phase 1: Local scheduling, explain, list, remove
 * Phase 2: External triggers, cron-job.org, redundancy, keep-awake, configurable retries
 * Phase 3: Scaffold, plugins, file locking, execution logs
 */

'use strict';

const { program } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

const { parseSchedule } = require('../src/parser');
const { addJob, listJobs, removeJob, getJobLogs } = require('../src/store');
const { startScheduler } = require('../src/scheduler');
const {
  generateGitHubAction,
  generateUptimeRobotConfig,
  generateCronJobOrgConfig,
  generateKeepAwake,
} = require('../src/trigger');
const { writeScaffold } = require('../src/scaffold');
const { getRegisteredPlugins, loadPlugins } = require('../src/plugins');

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

// ─── External Trigger Command (Phase 2 Enhanced) ─────────────────

program
  .command('external <url> <schedule>')
  .description('Generate external trigger configs (GitHub Actions, UptimeRobot, cron-job.org)')
  .option('--auth <token>', 'Authorization header (e.g. "Bearer TOKEN")')
  .option('--redundant', 'Generate configs for ALL trigger providers simultaneously')
  .option('--provider <name>', 'Trigger provider: github, uptimerobot, cronjob (default: github)', 'github')
  .option('--output <path>', 'Output directory for generated files', '.')
  .option('--retries <n>', 'Number of retry attempts in generated trigger (default: 3)', '3')
  .option('--delay <seconds>', 'Delay between retries in seconds (default: 10)', '10')
  .option('--method <verb>', 'HTTP method: GET or POST (default: GET)', 'GET')
  .option('--body <json>', 'JSON body for POST requests')
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

    // Validate HTTP method
    const method = options.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      console.error(chalk.red('\n✖ Invalid HTTP method: ') + method);
      console.error(chalk.gray('  Supported: GET, POST\n'));
      process.exit(1);
    }

    // Validate body only with POST
    if (options.body && method !== 'POST') {
      console.error(chalk.red('\n✖ --body can only be used with --method POST\n'));
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

    const retries = parseInt(options.retries, 10);
    const delay = parseInt(options.delay, 10);

    if (isNaN(retries) || retries < 1 || retries > 10) {
      console.error(chalk.red('\n✖ --retries must be a number between 1 and 10\n'));
      process.exit(1);
    }
    if (isNaN(delay) || delay < 1 || delay > 60) {
      console.error(chalk.red('\n✖ --delay must be a number between 1 and 60\n'));
      process.exit(1);
    }

    console.log(chalk.green('✔') + ' Schedule parsed: ' + chalk.cyan(schedule));
    console.log(chalk.green('✔') + ' Cron: ' + chalk.bold(result.cron));

    if (method === 'POST') {
      console.log(chalk.green('✔') + ' Method: ' + chalk.bold('POST'));
    }

    // Warn about aggressive intervals
    if (result.intervalMinutes && result.intervalMinutes < 5) {
      console.log(chalk.yellow('\n⚠️  Warning: Intervals under 5 minutes may rapidly exhaust GitHub Actions free tier limits.'));
      console.log(chalk.yellow('   Free tier = 2,000 min/month. At every ' + result.intervalMinutes + ' min, that\'s ~' + Math.round(43200 / (60 / result.intervalMinutes)) + ' runs/month.\n'));
    }

    // Determine which providers to generate for
    const providers = options.redundant
      ? ['github', 'uptimerobot', 'cronjob']
      : [options.provider];

    for (const provider of providers) {
      switch (provider) {
        case 'github': {
          const outputPath = generateGitHubAction({
            url,
            cron: result.cron,
            auth: options.auth || null,
            outputDir: options.output,
            retries,
            delay,
            method,
            body: options.body || null,
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
        case 'cronjob': {
          const config = generateCronJobOrgConfig({
            url,
            cron: result.cron,
            auth: options.auth || null,
          });
          console.log(chalk.green('✔') + ' cron-job.org config:');
          console.log(chalk.gray(config));
          break;
        }
        default:
          console.error(chalk.red('\n✖ Unknown provider: ') + provider);
          console.error(chalk.gray('  Supported: github, uptimerobot, cronjob\n'));
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

    if (retries !== 3 || delay !== 10) {
      console.log(chalk.green('✔') + ' Custom retry: ' + chalk.white(retries + 'x with ' + delay + 's delay'));
    }

    console.log(chalk.yellow('\n⚠️  Reminder: GitHub Actions schedules use UTC time.'));
    console.log(chalk.gray('   Commit the generated YAML file to your repo to activate.\n'));
  });

// ─── Keep-Awake Command (Phase 2) ───────────────────────────────

program
  .command('keep-awake <url>')
  .description('Generate keep-awake configs to prevent free-tier server sleep (14-min ping)')
  .option('--output <path>', 'Output directory for generated files', '.')
  .option('--framework <name>', 'Server framework: express, fastify (default: express)', 'express')
  .action((url, options) => {
    // URL validation
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        console.error(chalk.red('\n✖ Invalid URL: ') + 'Cannot use localhost for keep-awake.');
        console.error(chalk.gray('  Use your deployed URL: https://your-app.onrender.com\n'));
        process.exit(1);
      }
    } catch {
      console.error(chalk.red('\n✖ Invalid URL: ') + 'Please provide a fully qualified URL.');
      console.error(chalk.gray('  Example: https://your-app.onrender.com\n'));
      process.exit(1);
    }

    console.log(chalk.bold('\n🏥 Keep-Awake Setup\n'));

    const { healthSnippet, githubPath, uptimeConfig } = generateKeepAwake({
      url,
      outputDir: options.output,
      framework: options.framework,
    });

    // Step 1: Health endpoint
    console.log(chalk.yellow('Step 1:') + ' Add this ' + chalk.cyan('/health') + ' endpoint to your server:\n');
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.green(healthSnippet));
    console.log(chalk.gray('─'.repeat(60)));

    // Step 2: GitHub Action
    console.log(chalk.yellow('\nStep 2:') + ' Commit the generated GitHub Action:\n');
    console.log(chalk.green('✔') + ' GitHub Action generated at:');
    console.log('  ' + chalk.cyan(githubPath));
    console.log(chalk.gray('  → Pings /health every 14 min (just under Render\'s 15-min sleep threshold)'));

    // Step 3: UptimeRobot (optional backup)
    console.log(chalk.yellow('\nStep 3 (optional):') + ' Set up UptimeRobot as a backup:\n');
    console.log(chalk.gray(uptimeConfig));

    // Persist
    const job = addJob({
      phrase: 'keep-awake (every 14 min)',
      cron: '*/14 * * * *',
      command: url.replace(/\/+$/, '') + '/health',
      mode: 'keep-awake',
    });

    console.log(chalk.green('✔') + ' Job tracked: ' + chalk.gray(job.id));
    console.log(chalk.yellow('\n💡 Tip: Free-tier platforms like Render sleep after ~15 min of inactivity.'));
    console.log(chalk.gray('   This keep-awake setup pings every 14 min to prevent that.\n'));
  });

// ─── Scaffold Command (Phase 3) ──────────────────────────────────

program
  .command('scaffold')
  .description('Generate a "Fast Endpoint" boilerplate showing the easycron API contract')
  .option('--framework <name>', 'Server framework: express, fastify (default: express)', 'express')
  .option('--filename <name>', 'Output filename (default: easycron-endpoint.js)')
  .option('--output <path>', 'Output directory', '.')
  .action((options) => {
    console.log(chalk.bold('\n🔧 Generating Fast Endpoint scaffold...\n'));

    try {
      const { filePath, framework } = writeScaffold({
        framework: options.framework,
        outputDir: options.output,
        filename: options.filename || null,
      });

      console.log(chalk.green('✔') + ' Scaffold generated: ' + chalk.cyan(filePath));
      console.log(chalk.gray('  Framework: ' + framework));
      console.log(chalk.gray('\n  This file demonstrates:'));
      console.log(chalk.gray('    • Immediate 200 OK response (the API contract)'));
      console.log(chalk.gray('    • Async background task execution'));
      console.log(chalk.gray('    • In-memory idempotency/rate-limiting lock'));
      console.log(chalk.gray('    • /health endpoint for keep-awake pings'));
      console.log(chalk.gray('    • Optional API key middleware'));
      console.log(chalk.yellow('\n  Next steps:'));
      console.log(chalk.gray('    1. Install framework: npm install ' + framework));
      console.log(chalk.gray('    2. Replace runTaskAsync() with your real logic'));
      console.log(chalk.gray('    3. Deploy and run: easycron external <url> "schedule"\n'));
    } catch (err) {
      console.error(chalk.red('\n✖ ') + err.message + '\n');
      process.exit(1);
    }
  });

// ─── Logs Command (Phase 3) ──────────────────────────────────────

program
  .command('logs <id>')
  .description('Show execution logs for a job')
  .option('-n, --lines <count>', 'Number of log entries to show', '20')
  .action((id, options) => {
    const limit = parseInt(options.lines, 10) || 20;
    const logs = getJobLogs(id, limit);

    if (logs.length === 0) {
      console.log(chalk.yellow('\n📭 No execution logs found for: ' + id));
      console.log(chalk.gray('  Logs are recorded when jobs run via local scheduling.\n'));
      return;
    }

    console.log(chalk.bold('\n📋 Execution Logs for: ' + chalk.cyan(id.substring(0, 8)) + '\n'));
    console.log(chalk.gray('─'.repeat(80)));

    for (const entry of logs) {
      const icon = entry.status === 'success' ? chalk.green('✔') : chalk.red('✖');
      const time = entry.timestamp || 'unknown';
      const duration = entry.duration ? `${entry.duration}ms` : '';
      console.log(
        '  ' + icon + ' ' +
        chalk.gray(time) + '  ' +
        chalk.white(entry.status || 'unknown') +
        (duration ? '  ' + chalk.gray(duration) : '')
      );
      if (entry.output) {
        console.log(chalk.gray('    ' + entry.output.substring(0, 100)));
      }
    }

    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.gray('\n  Showing last ' + logs.length + ' entries\n'));
  });

// ─── Plugins Command (Phase 3) ───────────────────────────────────

program
  .command('plugins')
  .description('List registered community parser plugins')
  .action(() => {
    loadPlugins();
    const plugins = getRegisteredPlugins();

    if (plugins.length === 0) {
      console.log(chalk.yellow('\n📭 No plugins installed.\n'));
      console.log(chalk.gray('  To add a plugin, create a .js file in ~/.easycron/plugins/'));
      console.log(chalk.gray('  See: https://github.com/easycron/cli#plugins\n'));
      return;
    }

    console.log(chalk.bold('\n🔌 Registered Plugins\n'));
    for (const p of plugins) {
      console.log('  ' + chalk.cyan(p.name) + chalk.gray(' (' + p.patternCount + ' patterns)'));
      for (const desc of p.descriptions) {
        console.log(chalk.gray('    • ' + desc));
      }
    }
    console.log('');
  });

// ─── Parse & Execute ─────────────────────────────────────────────

program.parse(process.argv);

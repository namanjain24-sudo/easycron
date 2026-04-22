<h1 align="center">⏳ easycron CLI</h1>

<p align="center">
  Schedule jobs in plain English — and run them reliably even on sleeping servers.
</p>

<p align="center">
  <b>Stop writing cron syntax. Stop losing jobs when your server sleeps.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/easycron-cli" />
  <img src="https://img.shields.io/npm/dm/easycron-cli" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## 🚀 Install

```bash
npm i -g easycron-cli
```

---

## ⚡ Quick Example

```bash
easycron external https://your-app.onrender.com/api/task "every 10 minutes"
```

👉 Generates a GitHub Action
👉 Runs every 10 minutes
👉 Works even if your server is asleep

---

## 🤯 Why this exists

Free-tier platforms (Render, Railway, Fly.io):
- Put servers to sleep after inactivity
- Kill background cron jobs
- Break scheduled tasks

**easycron CLI fixes this using external triggers (GitHub Actions, UptimeRobot)**

---

## 🧠 How it works
`easycron CLI` → generates trigger → GitHub runs it → server wakes → task runs

---

## 🔥 Features
- Plain English scheduling (`every 10 minutes`)
- Works on free-tier servers
- GitHub Actions integration
- Smart retry system (handles cold starts)
- Keep-awake mode
- Plugin system

---

<h2 align="center">🎥 Demo</h2>

<p align="center">
  <img src="./demo.gif" width="700"/>
</p>

---

## 🚀 Quick Start

### External Trigger (Primary — for free-tier servers)
```bash
easycron external https://your-app.onrender.com/api/task "every 10 minutes"
```
```
✔ Schedule parsed: every 10 minutes
✔ Cron: */10 * * * *
✔ GitHub Action generated at:
  .github/workflows/easycron-trigger.yml
```

Commit the YAML to your repo → GitHub triggers your server every 10 minutes → Done.

### Local Scheduling (Secondary — for always-on servers)
```bash
easycron "every 10 minutes" -- node app.js
```

### Explain Mode (Dry-run)
```bash
easycron explain "every monday at 9am"
```
```
✔ Schedule parsed: every monday at 9am
✔ Cron: 0 9 * * 1
```

---

## 📝 Supported Schedule Inputs

| Input | Cron Output |
|---|---|
| `every 10 minutes` | `*/10 * * * *` |
| `every 2 hours` | `0 */2 * * *` |
| `daily at 08:30` | `30 8 * * *` |
| `daily at 2pm` | `0 14 * * *` |
| `daily at 2:30pm` | `30 14 * * *` |
| `every monday at 09:00` | `0 9 * * 1` |
| `every fri at 5pm` | `0 17 * * 5` |
| `every weekday at 14:00` | `0 14 * * 1-5` |
| `every weekend at 10am` | `0 10 * * 0,6` |
| `hourly` | `0 * * * *` |
| `midnight` | `0 0 * * *` |

---

## 💻 All Commands

| Command | Description |
|---|---|
| `easycron external <url> "<schedule>"` | Generate external trigger configs |
| `easycron "<schedule>" -- <command>` | Schedule a local cron job |
| `easycron list` | Show all registered jobs |
| `easycron remove <id>` | Remove a job by ID |
| `easycron explain "<schedule>"` | Preview cron translation |
| `easycron keep-awake <url>` | Prevent free-tier server sleep |
| `easycron scaffold` | Generate Fast Endpoint boilerplate |
| `easycron logs <id>` | View execution history for a job |
| `easycron plugins` | List installed community plugins |

---

## 🔄 External Triggers

### Providers
```bash
# GitHub Actions (default)
easycron external https://api.my-app.com/task "every 10 minutes"

# UptimeRobot
easycron external https://api.my-app.com/task "every 10 minutes" --provider uptimerobot

# cron-job.org
easycron external https://api.my-app.com/task "daily at 2am" --provider cronjob

# All 3 at once (redundancy mode)
easycron external https://api.my-app.com/task "every 10 minutes" --redundant
```

### Authentication
```bash
easycron external https://api.my-app.com/task "every 10 minutes" --auth "Bearer MY_TOKEN"
```

### POST Requests
```bash
easycron external https://api.my-app.com/webhook "hourly" --method POST --body '{"action":"sync"}'
```

### Custom Retry Configuration
```bash
# Server takes >30s to cold-start? Use 6 retries with 15s delay
easycron external https://api.my-app.com/task "every 10 minutes" --retries 6 --delay 15
```

### Smart Retry System
The generated GitHub Action includes:
- **Configurable retry attempts** (default: 3) with **configurable backoff** (default: 10s)
- **30s timeout** — tolerates slow cold-starts on free-tier servers
- **Follows redirects** (`-L`) — avoids false failures on 3xx responses
- **2xx & 3xx = success** — accepts all normal HTTP responses
- **5xx = retries** — handles transient 502/503 during server boot
- **4xx = fails immediately** — wrong URL/auth won't waste retries

---

## 🏥 Keep-Awake Helper

Prevent free-tier servers from sleeping with automatic 14-minute pings:

```bash
easycron keep-awake https://your-app.onrender.com
```

This generates:
1. **A `/health` endpoint** code snippet (Express/Fastify)
2. **A GitHub Action** that pings `/health` every 14 min
3. **An UptimeRobot config** as optional backup

```bash
# Fastify users
easycron keep-awake https://your-app.onrender.com --framework fastify
```

---

## ⏰ Time Zone Behavior

| Mode | Time Zone |
|---|---|
| Local (`easycron "..." -- cmd`) | System local timezone |
| External (`easycron external`) | **UTC** (GitHub Actions) |

> ⚠️ When using external triggers, adjust your schedule for UTC.

---

## 🔒 API Contract

Your target endpoint must:
1. **Respond with `200 OK` immediately**
2. **Run the actual task asynchronously** in the background

```javascript
// Express.js example
app.get('/api/task', (req, res) => {
  res.status(200).send('OK'); // Respond instantly
  runHeavyTaskAsync();        // Execute in background
});
```

---

## 🧠 Decision Tree

| Scenario | Use |
|---|---|
| Server always ON | `easycron "schedule" -- command` |
| Server sleeps (free tier) | `easycron external <url> "schedule"` |
| Mission-critical task | `easycron external <url> "schedule" --redundant` |
| Prevent server sleep entirely | `easycron keep-awake <url>` |
| Slow cold-start (>30s) | `easycron external <url> "schedule" --retries 6 --delay 15` |

---

## 🛑 Limitations

- Dependent on external services (GitHub Actions, UptimeRobot, cron-job.org)
- Not real-time guaranteed (GitHub can delay schedules during peak hours)
- Subject to network failures outside CLI control
- Not a job queue (use BullMQ/Celery for that)
- Not a replacement for Airflow/enterprise schedulers

---

## 🔧 Scaffold (Fast Endpoint Generator)

Don't know how to set up the endpoint for external triggers? Let easycron generate the boilerplate:

```bash
# Express (default)
easycron scaffold

# Fastify
easycron scaffold --framework fastify

# Custom filename
easycron scaffold --filename my-server.js
```

The generated file includes:
- **Immediate 200 OK** response pattern (the API contract)
- **Async background execution** (non-blocking)
- **In-memory idempotency lock** (60s cooldown prevents duplicate runs)
- **`/health` endpoint** (ready for keep-awake pings)
- **POST variant** with JSON body support
- **Optional API key middleware** (uncomment to enable)

---

## 🔌 Plugin System

Extend the parser with community patterns. Drop `.js` files in `~/.easycron/plugins/`:

```javascript
// ~/.easycron/plugins/custom-patterns.js
module.exports = {
  name: 'custom-patterns',
  patterns: [
    {
      match: /^twice daily$/i,
      handler: () => ({
        cron: '0 0,12 * * *',
        fields: { minute: '0', hour: '0,12', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
        intervalMinutes: null,
      }),
      description: 'twice daily → 0 0,12 * * *',
    },
  ],
};
```

```bash
# Verify plugins loaded
easycron plugins

# Now this works
easycron explain "twice daily"
```

**Security:** All community regex patterns are scanned for ReDoS vulnerabilities before loading. Patterns with nested quantifiers, excessive length, or too many quantifiers are automatically rejected.

---

## 📋 Execution Logs

```bash
# View last 20 execution entries for a job
easycron logs <job-id>

# View last 5 entries
easycron logs <job-id> -n 5
```

---

## 📦 Programmatic API

```javascript
const {
  parseSchedule,
  generateGitHubAction,
  writeScaffold,
  addPlugin,
  analyzeRegexSafety,
} = require('easycron-cli');

const result = parseSchedule('every 10 minutes');
console.log(result.cron);   // "*/10 * * * *"
console.log(result.fields); // { minute: '*/10', hour: '*', ... }

// Generate trigger programmatically
generateGitHubAction({
  url: 'https://my-app.com/api/task',
  cron: result.cron,
  auth: null,
  outputDir: '.',
  retries: 3,
  delay: 10,
});

// Generate scaffold programmatically
writeScaffold({ framework: 'express', outputDir: './' });

// Register a plugin programmatically
addPlugin({
  name: 'my-plugin',
  patterns: [{
    match: /^every quarter hour$/,
    handler: () => ({ cron: '*/15 * * * *', fields: {} }),
    description: 'every quarter hour',
  }],
});

// Check if a regex is ReDoS-safe
const safety = analyzeRegexSafety(/(a+)+/);
console.log(safety); // { safe: false, reason: 'Nested quantifiers detected' }
```

---

## ⚠️ Limitations & Edge Cases

Since `easycron CLI` leverages GitHub Actions and free-tier infrastructure to bypass hosting costs, there are a few strict platform limitations you should be aware of:

1. **The 60-Day GitHub Sleep**
   GitHub automatically halts scheduled cron workflows in repositories that haven't had any commit activity for 60 days.
   **Fix:** Ensure you push a commit (even a minor text edit) to your repository at least once every 2 months to keep your background triggers actively running.

2. **Free-Tier Execution Limits (2,000 Minutes)**
   Free GitHub accounts include 2,000 Action Minutes per month. A typical `easycron` HTTP ping takes ~5-10 seconds. Running a single `keep-awake` heartbeat (every 14 mins) uses roughly ~100 minutes a month, which is perfectly safe. However, scheduling dozens of rapid tasks (e.g. 15 apps pinging every 5 minutes) will quickly exhaust your monthly quota.

3. **Target Server Death**
   If your hosting provider (Render, Railway, etc.) permanently disables your server due to bandwidth overuse or ToS violations, `easycron`'s requests will result in `4xx` HTTP errors and the workflow will fail immediately. For `5xx` errors, the system will retry up to 3 times before giving up.

---

## License

MIT

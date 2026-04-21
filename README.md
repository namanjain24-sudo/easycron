# ⏳ easycron

**Human-friendly cron scheduling + external triggers for free-tier servers.**

Never write cron syntax again. Never lose a scheduled job to a sleeping server.

```bash
npm i -g easycron
```

---

## ⚠️ Why not just use internal cron?

Internal cron tools (like `node-cron`, `APScheduler`) **die when your server sleeps**.  
Free-tier platforms like **Render, Railway, Fly.io** forcefully put servers to sleep after ~15 minutes of inactivity.  
When the server sleeps, your background cron dies with it.

**easycron** solves this by triggering your sleeping API from an always-awake external source (GitHub Actions, UptimeRobot).

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
| `every monday at 09:00` | `0 9 * * 1` |
| `every weekday at 14:00` | `0 14 * * 1-5` |
| `every weekend at 10am` | `0 10 * * 0,6` |
| `hourly` | `0 * * * *` |
| `midnight` | `0 0 * * *` |

---

## 💻 Commands

| Command | Description |
|---|---|
| `easycron external <url> "<schedule>"` | Generate external trigger configs |
| `easycron "<schedule>" -- <command>` | Schedule a local cron job |
| `easycron list` | Show all registered jobs |
| `easycron remove <id>` | Remove a job by ID |
| `easycron explain "<schedule>"` | Preview cron translation |

### External Trigger Options
```bash
# With authentication
easycron external https://api.my-app.com/task "every 10 minutes" --auth "Bearer MY_TOKEN"

# Redundancy mode (GitHub Actions + UptimeRobot)
easycron external https://api.my-app.com/task "every 10 minutes" --redundant

# Specific provider
easycron external https://api.my-app.com/task "hourly" --provider uptimerobot
```

---

## 🔄 How External Triggers Work

```
easycron external <url> "schedule"
        ↓
  Parses English → Cron
        ↓
  Generates GitHub Action YAML
        ↓
  User commits to repo
        ↓
  GitHub runs on schedule (UTC)
        ↓
  curl hits your sleeping server
        ↓
  Server wakes → task runs
```

### Smart Retry System
Free-tier servers can take 5–20s to cold-start. The generated GitHub Action includes:
- **3 retry attempts** with **10s backoff**
- Differentiates timeouts (retries) from 5xx errors (fails immediately)
- Fully configurable inside the YAML

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

---

## 🛑 Limitations

- Dependent on external services (GitHub Actions, UptimeRobot)
- Not real-time guaranteed (GitHub can delay schedules during peak hours)
- Subject to network failures outside CLI control
- Not a job queue (use BullMQ/Celery for that)
- Not a replacement for Airflow/enterprise schedulers

---

## 📦 Programmatic API

```javascript
const { parseSchedule } = require('easycron');

const result = parseSchedule('every 10 minutes');
console.log(result.cron);   // "*/10 * * * *"
console.log(result.fields); // { minute: '*/10', hour: '*', ... }
```

---

## License

MIT

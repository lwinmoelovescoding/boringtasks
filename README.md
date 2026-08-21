# ✅ Task Reminder App

A local-first to-do app with due dates, priority levels, and **email reminders via Gmail** — hosted for free on GitHub Pages.

---

## 🚀 Deploy to GitHub Pages (free URL)

### Step 1 — Push to GitHub

1. Go to [github.com/new](https://github.com/new) and create a **new public repository** (e.g. `task-reminder`).
2. In your terminal inside the `todo-reminder` folder:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/task-reminder.git
git push -u origin main
```

### Step 2 — Set the homepage URL

Open `package.json` and update the `homepage` field:

```json
"homepage": "https://YOUR_USERNAME.github.io/task-reminder"
```

### Step 3 — Deploy

```bash
npm run deploy
```

Your app will be live at: **`https://YOUR_USERNAME.github.io/task-reminder`**

---

## 📧 Email Reminders Setup (EmailJS — Free)

### Step 1 — Create an EmailJS account
Go to https://www.emailjs.com and sign up (free = 200 emails/month).

### Step 2 — Add a Gmail Service
Dashboard → Email Services → Add New Service → Gmail → connect your account.
Note the **Service ID**.

### Step 3 — Create an Email Template
Email Templates → Create New Template. Use these variables:

Subject: ⏰ Reminder: "{{task_title}}" is due in {{days_left}} days

Body:
  Task: {{task_title}}
  Due Date: {{due_date}}
  Days Left: {{days_left}}
  Priority: {{task_priority}}
  Description: {{task_description}}

Set "To Email" field to: {{to_email}}
Note the **Template ID**.

### Step 4 — Get your Public Key
Account → General → copy your Public Key.

### Step 5 — Configure in the App
Click the ⚙️ icon → fill in Public Key, Service ID, Template ID, and your email → Save.

---

## ✨ Features
- Tasks with title, description, due date, priority (Low/Medium/High/Urgent)
- Email reminders: 3, 5, or 7 days before due
- Recurring tasks: auto-clone for next month on completion
- Search, filter (active/completed), sort (due date/priority/created)
- All data saved in browser localStorage — no account needed

## 🛠 Run Locally
```bash
npm install
npm start
```

import React, { useState, useEffect, useCallback } from 'react';
import { format, differenceInMinutes, addMonths, parseISO, isValid } from 'date-fns';
import emailjs from '@emailjs/browser';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc
} from 'firebase/firestore';
import { db } from './firebase';
import './index.css';

const SETTINGS_KEY = 'todo-reminder-settings';
const REMINDER_LOG_KEY = 'todo-reminder-sent-log';
const LEGACY_TASKS_STORAGE_KEY = 'todo-reminder-tasks';
const FIRESTORE_MIGRATION_KEY = 'todo-reminder-firestore-migrated';
const TASKS_COLLECTION = 'tasks';
const APP_PASSCODE = process.env.REACT_APP_APP_PASSCODE || '9552000';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const PRIORITY_COLORS = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#f97316',
  Urgent: '#ef4444',
};

const DEFAULT_EMAIL_SETTINGS = {
  publicKey: process.env.REACT_APP_EMAILJS_PUBLIC_KEY || 'bNpWNwq6W9Mw1osKF',
  serviceId: process.env.REACT_APP_EMAILJS_SERVICE_ID || 'service_dw5ejsb',
  templateId: process.env.REACT_APP_EMAILJS_TEMPLATE_ID || 'template_8vbtfca',
  recipientEmail: process.env.REACT_APP_RECIPIENT_EMAIL || 'lwinmoe.wanwan@gmail.com',
};

// Reminder options stored as minutes
const REMINDER_OPTIONS = [
  { label: '1 hour',  value: 60 },
  { label: '3 hours', value: 180 },
  { label: '1 day',   value: 1440 },
  { label: '3 days',  value: 4320 },
  { label: '5 days',  value: 7200 },
  { label: '7 days',  value: 10080 },
];

function friendlyReminder(minutes) {
  if (minutes < 60)   return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  return `${minutes / 1440}d`;
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function newTask(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    dueDate: '',
    dueTime: '',          // HH:mm, required for hour-level reminders
    priority: 'Medium',
    completed: false,
    recurring: false,
    reminderMinutes: [],  // array of minute values from REMINDER_OPTIONS
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── EmailJS helpers ──────────────────────────────────────────────────────────

async function sendReminderEmail(settings, task, minutesBefore) {
  const { serviceId, templateId, publicKey, recipientEmail } = settings;
  if (!serviceId || !templateId || !publicKey || !recipientEmail) return false;

  const dueStr = task.dueDate
    ? format(parseISO(task.dueDate), 'MMMM d, yyyy') + (task.dueTime ? ` at ${task.dueTime}` : '')
    : 'No date set';

  let timeLeftLabel;
  if (typeof minutesBefore === 'string') {
    timeLeftLabel = minutesBefore;
  } else if (minutesBefore < 60) {
    timeLeftLabel = `${minutesBefore} minutes`;
  } else if (minutesBefore < 1440) {
    timeLeftLabel = `${minutesBefore / 60} hour(s)`;
  } else {
    timeLeftLabel = `${minutesBefore / 1440} day(s)`;
  }

  try {
    await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: recipientEmail,
        to_name: recipientEmail,
        email: recipientEmail,
        reply_to: recipientEmail,
        task_title: task.title,
        task_priority: task.priority,
        due_date: dueStr,
        days_left: timeLeftLabel,
        task_description: task.description || '(no description)',
      },
      publicKey
    );
    return true;
  } catch (e) {
    console.error('EmailJS error:', e?.text || e?.message || e);
    return false;
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function TaskModal({ task, onSave, onClose }) {
  const [form, setForm] = useState({ reminderMinutes: [], ...task });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => () => setForm((f) => ({ ...f, [k]: !f[k] }));

  function toggleReminder(minutes) {
    setForm((f) => ({
      ...f,
      reminderMinutes: f.reminderMinutes.includes(minutes)
        ? f.reminderMinutes.filter((m) => m !== minutes)
        : [...f.reminderMinutes, minutes],
    }));
  }

  const needsTime = form.reminderMinutes.some((m) => m < 1440);

  function handleSave() {
    if (!form.title.trim()) return alert('Task title is required.');
    if (needsTime && !form.dueTime) return alert('Please set a due time — it\'s required for hour-based reminders.');
    onSave(form);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{task.title ? '✏️ Edit Task' : '➕ New Task'}</h2>

        <label>Title *
          <input value={form.title} onChange={set('title')} placeholder="What needs to be done?" autoFocus />
        </label>

        <label>Description
          <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Optional details..." />
        </label>

        <div className="row">
          <label>Due Date
            <input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </label>
          <label>
            Due Time {needsTime && <span className="required-star">*</span>}
            <input type="time" value={form.dueTime} onChange={set('dueTime')} />
          </label>
        </div>

        <label>Priority
          <select value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>

        <fieldset>
          <legend>📧 Email Reminders (before due)</legend>
          <div className="chip-group">
            {REMINDER_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className={`chip ${form.reminderMinutes.includes(value) ? 'active' : ''}`}
                onClick={() => toggleReminder(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {needsTime && (
            <p className="hint" style={{ marginTop: 8 }}>
              ⚠️ Hour-based reminders require a due time to be set above.
            </p>
          )}
        </fieldset>

        <label className="checkbox-label">
          <input type="checkbox" checked={form.recurring} onChange={toggle('recurring')} />
          🔁 Recurring — repeat every month
        </label>

        <label className="checkbox-label">
          <input type="checkbox" checked={form.completed} onChange={toggle('completed')} />
          ✅ Mark as completed
        </label>

        <div className="modal-actions">
          <button className="btn primary" onClick={handleSave}>Save Task</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onToggle }) {
  const getDueInfo = () => {
    if (!task.dueDate || !isValid(parseISO(task.dueDate))) return null;
    const due = task.dueTime
      ? new Date(`${task.dueDate}T${task.dueTime}`)
      : parseISO(task.dueDate);
    const mins = differenceInMinutes(due, new Date());
    return mins;
  };

  const minsLeft = getDueInfo();

  const dueBadge = () => {
    if (minsLeft === null) return null;
    if (minsLeft < 0) return <span className="badge overdue">Overdue</span>;
    if (minsLeft < 60) return <span className="badge overdue">Due in {minsLeft}m</span>;
    if (minsLeft < 1440) return <span className="badge today">Due in {Math.round(minsLeft / 60)}h</span>;
    const days = Math.round(minsLeft / 1440);
    if (days <= 3) return <span className="badge soon">Due in {days}d</span>;
    return <span className="badge future">Due in {days}d</span>;
  };

  const dueDateLabel = task.dueDate
    ? format(parseISO(task.dueDate), 'MMM d, yyyy') + (task.dueTime ? ` ${task.dueTime}` : '')
    : null;

  const reminderLabels = (task.reminderMinutes || [])
    .slice()
    .sort((a, b) => a - b)
    .map(friendlyReminder)
    .join(', ');

  return (
    <div className={`task-card priority-${task.priority.toLowerCase()} ${task.completed ? 'completed' : ''}`}>
      <div className="task-left">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id)}
          title={task.completed ? 'Mark as active' : 'Mark as complete'}
        />
      </div>
      <div className="task-body">
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
          <span className="priority-dot" style={{ background: PRIORITY_COLORS[task.priority] }} title={task.priority} />
        </div>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          {dueDateLabel && <span className="meta-item">📅 {dueDateLabel}</span>}
          {dueBadge()}
          <span className="meta-item priority-label" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
          {task.recurring && <span className="meta-item">🔁 Monthly</span>}
          {reminderLabels && <span className="meta-item">📧 {reminderLabels}</span>}
        </div>
      </div>
      <div className="task-actions">
        <button
          className={`icon-btn complete-btn ${task.completed ? 'done' : ''}`}
          onClick={() => onToggle(task.id)}
          title={task.completed ? 'Undo complete' : 'Complete task'}
        >
          {task.completed ? '↩️' : '✔️'}
        </button>
        <button className="icon-btn" onClick={() => onEdit(task)} title="Edit">✏️</button>
        <button className="icon-btn" onClick={() => onDelete(task.id)} title="Delete">🗑️</button>
      </div>
    </div>
  );
}

function LockScreen({ pin, pinLength, error, onDigit, onBackspace }) {
  return (
    <div className="lock-screen">
      <div className="lock-card">
        <h1>🔒 Locked</h1>
        <p className="lock-subtitle">Enter Passcode</p>
        <div className="pin-dots" aria-label="Passcode dots">
          {Array.from({ length: pinLength }).map((_, index) => (
            <span key={index} className={`pin-dot ${index < pin.length ? 'filled' : ''}`} />
          ))}
        </div>
        {error && <p className="lock-error">{error}</p>}
        <div className="lock-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              key={digit}
              type="button"
              className="lock-key"
              onClick={() => onDigit(String(digit))}
            >
              {digit}
            </button>
          ))}
          <div />
          <button type="button" className="lock-key" onClick={() => onDigit('0')}>0</button>
          <button
            type="button"
            className="lock-key lock-key-back"
            onClick={onBackspace}
            aria-label="Delete"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Test Email Button ────────────────────────────────────────────────────────

function TestEmailButton({ settings }) {
  const [status, setStatus] = useState(''); // '' | 'sending' | 'ok' | 'fail'
  const [error, setError] = useState('');

  async function handleTest() {
    setStatus('sending');
    setError('');
    try {
      await emailjs.send(
        settings.serviceId,
        settings.templateId,
        {
          to_email: settings.recipientEmail,
          to_name: settings.recipientEmail,
          email: settings.recipientEmail,
          reply_to: settings.recipientEmail,
          task_title: '🧪 Test Task',
          task_priority: 'Medium',
          due_date: 'Today',
          days_left: 'Test — no real deadline',
          task_description: 'This is a test email from your Task Reminder app.',
        },
        settings.publicKey
      );
      setStatus('ok');
    } catch (e) {
      setError(e?.text || e?.message || JSON.stringify(e));
      setStatus('fail');
    }
    setTimeout(() => { setStatus(''); setError(''); }, 5000);
  }

  const label = { '': '📨 Test Email', sending: '⏳ Sending...', ok: '✅ Sent!', fail: '❌ Failed' }[status];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        className={`btn ${status === 'ok' ? 'success' : status === 'fail' ? 'danger' : ''}`}
        onClick={handleTest}
        disabled={status === 'sending'}
        title="Send a test reminder email"
      >
        {label}
      </button>
      {error && <span style={{ fontSize: '0.72rem', color: '#f87171', maxWidth: 200, textAlign: 'right' }}>{error}</span>}
    </div>
  );
}
// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMigratingLegacyTasks, setIsMigratingLegacyTasks] = useState(false);
  const [settings] = useState(() => {
    const saved = loadFromStorage(SETTINGS_KEY, {});
    return {
      publicKey: saved.publicKey || DEFAULT_EMAIL_SETTINGS.publicKey,
      serviceId: saved.serviceId || DEFAULT_EMAIL_SETTINGS.serviceId,
      templateId: saved.templateId || DEFAULT_EMAIL_SETTINGS.templateId,
      recipientEmail: saved.recipientEmail || DEFAULT_EMAIL_SETTINGS.recipientEmail,
    };
  });
  const [reminderLog, setReminderLog] = useState(() => loadFromStorage(REMINDER_LOG_KEY, {}));

  const [editingTask, setEditingTask] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('dueDate');
  const [searchQ, setSearchQ] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => saveToStorage(SETTINGS_KEY, settings), [settings]);
  useEffect(() => saveToStorage(REMINDER_LOG_KEY, reminderLog), [reminderLog]);

  // ── Real-time Firestore sync ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, TASKS_COLLECTION), (snap) => {
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(loaded);
      setLoading(false);
    }, (err) => {
      console.error('Firestore error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    async function migrateLegacyTasks() {
      const alreadyMigrated = loadFromStorage(FIRESTORE_MIGRATION_KEY, false);
      const legacyTasks = loadFromStorage(LEGACY_TASKS_STORAGE_KEY, []);

      if (alreadyMigrated || tasks.length > 0 || legacyTasks.length === 0) {
        return;
      }

      setIsMigratingLegacyTasks(true);

      try {
        await Promise.all(
          legacyTasks.map(async (legacyTask) => {
            const taskId = legacyTask.id || crypto.randomUUID();
            await setDoc(
              doc(db, TASKS_COLLECTION, taskId),
              {
                ...newTask(),
                ...legacyTask,
                id: taskId,
                reminderMinutes: legacyTask.reminderMinutes || [],
              }
            );
          })
        );

        saveToStorage(FIRESTORE_MIGRATION_KEY, true);
        setStatusMsg(`✅ Imported ${legacyTasks.length} task(s) to Firebase`);
        setTimeout(() => setStatusMsg(''), 5000);
      } catch (error) {
        console.error('Legacy task migration failed:', error);
        setStatusMsg('❌ Failed to import old tasks to Firebase');
        setTimeout(() => setStatusMsg(''), 5000);
      } finally {
        setIsMigratingLegacyTasks(false);
      }
    }

    if (!loading) {
      migrateLegacyTasks();
    }
  }, [loading, tasks]);

  // ── Reminder checker — runs every minute ──
  const checkReminders = useCallback(async () => {
    if (!settings.publicKey || !settings.serviceId || !settings.templateId || !settings.recipientEmail) return;
    const newLog = { ...reminderLog };
    const nowMin = format(new Date(), 'yyyy-MM-dd HH:mm');
    let sent = 0;

    for (const task of tasks) {
      if (task.completed || !task.dueDate || !(task.reminderMinutes || []).length) continue;
      const due = task.dueTime
        ? new Date(`${task.dueDate}T${task.dueTime}`)
        : parseISO(task.dueDate);
      const minsLeft = differenceInMinutes(due, new Date());

      for (const m of task.reminderMinutes) {
        if (minsLeft >= m - 1 && minsLeft <= m + 1) {
          const logKey = `${task.id}-${m}-${nowMin.slice(0, 13)}`;
          if (!newLog[logKey]) {
            const ok = await sendReminderEmail(settings, task, m);
            if (ok) { newLog[logKey] = true; sent++; }
          }
        }
      }
    }
    if (sent > 0) {
      setReminderLog(newLog);
      setStatusMsg(`✅ Sent ${sent} reminder email(s)`);
      setTimeout(() => setStatusMsg(''), 4000);
    }
  }, [tasks, settings, reminderLog]);

  useEffect(() => {
    checkReminders();
    const id = setInterval(checkReminders, 60 * 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Task operations (Firestore) ──
  async function saveTask(task) {
    const ref = doc(db, TASKS_COLLECTION, task.id);
    await setDoc(ref, task);
  }

  async function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return;
    await deleteDoc(doc(db, TASKS_COLLECTION, id));
  }

  async function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const completed = !task.completed;
    await updateDoc(doc(db, TASKS_COLLECTION, id), { completed });
    // If recurring and just completed, create next month's copy
    if (completed && task.recurring && task.dueDate) {
      const nextDue = format(addMonths(parseISO(task.dueDate), 1), 'yyyy-MM-dd');
      const next = newTask({ ...task, id: crypto.randomUUID(), completed: false, dueDate: nextDue, createdAt: new Date().toISOString() });
      await setDoc(doc(db, TASKS_COLLECTION, next.id), next);
    }
  }

  function handleDigit(digit) {
    setPinError('');
    setPinInput((prev) => {
      if (prev.length >= APP_PASSCODE.length) {
        return prev;
      }

      const next = `${prev}${digit}`;
      if (next.length === APP_PASSCODE.length) {
        if (next === APP_PASSCODE) {
          setIsUnlocked(true);
          return '';
        }

        setPinError('Incorrect passcode');
        return '';
      }

      return next;
    });
  }

  function handleBackspace() {
    setPinError('');
    setPinInput((prev) => prev.slice(0, -1));
  }

  const priorityOrder = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

  const visible = tasks
    .filter((t) => {
      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      return true;
    })
    .filter((t) => !searchQ || t.title.toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const activeCount = tasks.filter((t) => !t.completed).length;

  if (!isUnlocked) {
    return (
      <LockScreen
        pin={pinInput}
        pinLength={APP_PASSCODE.length}
        error={pinError}
        onDigit={handleDigit}
        onBackspace={handleBackspace}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>✅ Task Reminder</h1>
          <span className="task-count">{activeCount} active</span>
        </div>
        <div className="header-right">
          {statusMsg && <span className="status-msg">{statusMsg}</span>}
          <button className="btn primary" onClick={() => setEditingTask(newTask())}>+ New Task</button>
          <TestEmailButton settings={settings} />
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search"
          placeholder="🔍 Search tasks..."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        <div className="filter-group">
          {['all', 'active', 'completed'].map((f) => (
            <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="dueDate">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="created">Sort: Created</option>
        </select>
      </div>

      <main className="task-list">
        {loading || isMigratingLegacyTasks ? (
          <div className="empty"><p>⏳ Loading tasks...</p></div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <p>No tasks found.</p>
            <button className="btn primary" onClick={() => setEditingTask(newTask())}>Add your first task</button>
          </div>
        ) : (
          visible.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onEdit={setEditingTask}
              onDelete={deleteTask}
              onToggle={toggleTask}
            />
          ))
        )}
      </main>

      {editingTask && (
        <TaskModal task={editingTask} onSave={saveTask} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}

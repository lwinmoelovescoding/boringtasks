import React, { useState, useEffect, useCallback } from 'react';
import { format, differenceInDays, addMonths, parseISO, isValid } from 'date-fns';
import emailjs from '@emailjs/browser';
import './index.css';

const STORAGE_KEY = 'todo-reminder-tasks';
const SETTINGS_KEY = 'todo-reminder-settings';
const REMINDER_LOG_KEY = 'todo-reminder-sent-log';
const APP_PASSCODE = '9552000';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const PRIORITY_COLORS = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#f97316',
  Urgent: '#ef4444',
};

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
    priority: 'Medium',
    completed: false,
    recurring: false,         // repeat every month
    reminderDays: [],         // e.g. [3, 5, 7]
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── EmailJS helpers ──────────────────────────────────────────────────────────

async function sendReminderEmail(settings, task, daysLeft) {
  const { serviceId, templateId, publicKey, recipientEmail } = settings;
  if (!serviceId || !templateId || !publicKey || !recipientEmail) return false;
  try {
    await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: recipientEmail,
        task_title: task.title,
        task_priority: task.priority,
        due_date: format(parseISO(task.dueDate), 'MMMM d, yyyy'),
        days_left: daysLeft,
        task_description: task.description || '(no description)',
      },
      publicKey
    );
    return true;
  } catch (e) {
    console.error('EmailJS error:', e);
    return false;
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function SettingsModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState(settings);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ Email Reminder Settings</h2>
        <p className="hint">
          Uses <strong>EmailJS</strong> (free). Create an account at{' '}
          <a href="https://www.emailjs.com" target="_blank" rel="noreferrer">emailjs.com</a>,
          add a Gmail service, create an email template, then fill in the IDs below.
          <br /><br />
          <strong>Template variables to include:</strong>{' '}
          <code>{'{{task_title}}'}</code>, <code>{'{{due_date}}'}</code>,{' '}
          <code>{'{{days_left}}'}</code>, <code>{'{{task_priority}}'}</code>,{' '}
          <code>{'{{task_description}}'}</code>, <code>{'{{to_email}}'}</code>
        </p>
        <label>EmailJS Public Key
          <input value={form.publicKey} onChange={set('publicKey')} placeholder="user_xxxxxxxxxx" />
        </label>
        <label>EmailJS Service ID
          <input value={form.serviceId} onChange={set('serviceId')} placeholder="service_xxxxxxx" />
        </label>
        <label>EmailJS Template ID
          <input value={form.templateId} onChange={set('templateId')} placeholder="template_xxxxxxx" />
        </label>
        <label>Your Email (reminders sent here)
          <input type="email" value={form.recipientEmail} onChange={set('recipientEmail')} placeholder="you@gmail.com" />
        </label>
        <div className="modal-actions">
          <button className="btn primary" onClick={() => { onSave(form); onClose(); }}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, onSave, onClose }) {
  const [form, setForm] = useState(task);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => () => setForm((f) => ({ ...f, [k]: !f[k] }));

  function toggleReminderDay(day) {
    setForm((f) => ({
      ...f,
      reminderDays: f.reminderDays.includes(day)
        ? f.reminderDays.filter((d) => d !== day)
        : [...f.reminderDays, day],
    }));
  }

  function handleSave() {
    if (!form.title.trim()) return alert('Task title is required.');
    onSave(form);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{task.id ? '✏️ Edit Task' : '➕ New Task'}</h2>

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
          <label>Priority
            <select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>📧 Email Reminders (days before due)</legend>
          <div className="chip-group">
            {[3, 5, 7].map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${form.reminderDays.includes(d) ? 'active' : ''}`}
                onClick={() => toggleReminderDay(d)}
              >
                {d} days
              </button>
            ))}
          </div>
        </fieldset>

        <label className="checkbox-label">
          <input type="checkbox" checked={form.recurring} onChange={toggle('recurring')} />
          🔁 Recurring — repeat every month
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
  const daysLeft = task.dueDate && isValid(parseISO(task.dueDate))
    ? differenceInDays(parseISO(task.dueDate), new Date())
    : null;

  const dueBadge = () => {
    if (daysLeft === null) return null;
    if (daysLeft < 0) return <span className="badge overdue">Overdue {Math.abs(daysLeft)}d</span>;
    if (daysLeft === 0) return <span className="badge today">Due today</span>;
    if (daysLeft <= 3) return <span className="badge soon">Due in {daysLeft}d</span>;
    return <span className="badge future">Due in {daysLeft}d</span>;
  };

  return (
    <div className={`task-card priority-${task.priority.toLowerCase()} ${task.completed ? 'completed' : ''}`}>
      <div className="task-left">
        <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} />
      </div>
      <div className="task-body">
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
          <span className="priority-dot" style={{ background: PRIORITY_COLORS[task.priority] }} title={task.priority} />
        </div>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          {task.dueDate && <span className="meta-item">📅 {format(parseISO(task.dueDate), 'MMM d, yyyy')}</span>}
          {dueBadge()}
          <span className="meta-item priority-label" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
          {task.recurring && <span className="meta-item">🔁 Monthly</span>}
          {task.reminderDays.length > 0 && (
            <span className="meta-item">📧 {task.reminderDays.sort((a,b)=>a-b).join(', ')}d</span>
          )}
        </div>
      </div>
      <div className="task-actions">
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
          {Array.from({ length: pinLength }).map((_, i) => (
            <span key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>
        {error && <p className="lock-error">{error}</p>}
        <div className="lock-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="lock-key" onClick={() => onDigit(String(n))}>{n}</button>
          ))}
          <div />
          <button className="lock-key" onClick={() => onDigit('0')}>0</button>
          <button className="lock-key lock-key-back" onClick={onBackspace} aria-label="Delete">⌫</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState(() => loadFromStorage(STORAGE_KEY, []));
  const [settings, setSettings] = useState(() =>
    loadFromStorage(SETTINGS_KEY, { publicKey: '', serviceId: '', templateId: '', recipientEmail: '' })
  );
  const [reminderLog, setReminderLog] = useState(() => loadFromStorage(REMINDER_LOG_KEY, {}));

  const [showSettings, setShowSettings] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null = closed, {} = new, task = edit
  const [filter, setFilter] = useState('all'); // all | active | completed
  const [sortBy, setSortBy] = useState('dueDate'); // dueDate | priority | created
  const [searchQ, setSearchQ] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Persist tasks & settings
  useEffect(() => saveToStorage(STORAGE_KEY, tasks), [tasks]);
  useEffect(() => saveToStorage(SETTINGS_KEY, settings), [settings]);
  useEffect(() => saveToStorage(REMINDER_LOG_KEY, reminderLog), [reminderLog]);

  // ── Reminder checker (runs on load and every hour) ──
  const checkReminders = useCallback(async () => {
    if (!settings.publicKey || !settings.serviceId || !settings.templateId || !settings.recipientEmail) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const newLog = { ...reminderLog };
    let sent = 0;

    for (const task of tasks) {
      if (task.completed || !task.dueDate || task.reminderDays.length === 0) continue;
      const daysLeft = differenceInDays(parseISO(task.dueDate), new Date());
      for (const d of task.reminderDays) {
        const logKey = `${task.id}-${d}-${today}`;
        if (daysLeft === d && !newLog[logKey]) {
          const ok = await sendReminderEmail(settings, task, d);
          if (ok) {
            newLog[logKey] = true;
            sent++;
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
    const id = setInterval(checkReminders, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Task operations ──
  function saveTask(task) {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx === -1) return [...prev, task];
      const updated = [...prev];
      updated[idx] = task;
      return updated;
    });
  }

  function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleTask(id) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const completed = !t.completed;
        // If recurring and just completed, clone for next month
        if (completed && t.recurring && t.dueDate) {
          const nextDue = format(addMonths(parseISO(t.dueDate), 1), 'yyyy-MM-dd');
          setTimeout(() => {
            setTasks((prev2) => [
              ...prev2,
              newTask({ ...t, id: crypto.randomUUID(), completed: false, dueDate: nextDue, createdAt: new Date().toISOString() }),
            ]);
          }, 0);
        }
        return { ...t, completed };
      })
    );
  }

  // ── Filtering & sorting ──
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

  function handleDigit(digit) {
    setPinError('');
    setPinInput((prev) => {
      if (prev.length >= APP_PASSCODE.length) return prev;
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
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1>✅ Task Reminder</h1>
          <span className="task-count">{activeCount} active</span>
        </div>
        <div className="header-right">
          {statusMsg && <span className="status-msg">{statusMsg}</span>}
          <button className="btn primary" onClick={() => setEditingTask(newTask())}>+ New Task</button>
          <button className="btn icon" onClick={() => setShowSettings(true)} title="Email Settings">⚙️</button>
        </div>
      </header>

      {/* Toolbar */}
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

      {/* Task list */}
      <main className="task-list">
        {visible.length === 0 ? (
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

      {/* Modals */}
      {editingTask && (
        <TaskModal task={editingTask} onSave={saveTask} onClose={() => setEditingTask(null)} />
      )}
      {showSettings && (
        <SettingsModal settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create a single database connection
const db = new sqlite3.Database('./database.db');

// Enable foreign key constraints
db.run('PRAGMA foreign_keys = ON');

// Initialize database schema
db.serialize(() => {
  // Accounts table for storing MAX messenger bot tokens
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bot_token TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
  )`);

  // Contacts table
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`);

  // Messages table for tracking sent messages (secure - uses file_id instead of file_path)
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    message_text TEXT,
    file_id TEXT,
    file_name TEXT,
    status TEXT DEFAULT 'pending',
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  )`);
  
  // Migration: Add file_id column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE messages ADD COLUMN file_id TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Migration info: file_id column may already exist or table is new');
    }
  });
});

// Helper functions for database operations
const dbHelpers = {
  // Run a query and return a promise
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  },

  // Get a single row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Get all rows
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  // Close database connection
  close() {
    return new Promise((resolve) => {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed.');
        }
        resolve();
      });
    });
  }
};

module.exports = { db, dbHelpers };
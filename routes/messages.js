const express = require('express');
const { Bot } = require('@maxhub/max-bot-api');
const fs = require('fs');
const path = require('path');
const { dbHelpers } = require('../db');
const messageSender = require('../utils/messaging');
const { getFilePathFromId } = require('../utils/fileUpload');

const router = express.Router();

// Get message history
router.get('/', async (req, res) => {
  const { account_id, contact_id, limit = 100 } = req.query;
  
  let query = `
    SELECT m.id, m.account_id, m.contact_id, m.message_text, 
           m.file_id, m.file_name, m.status, m.sent_at, m.created_at,
           a.name as account_name, c.name as contact_name, c.chat_id
    FROM messages m
    LEFT JOIN accounts a ON m.account_id = a.id
    LEFT JOIN contacts c ON m.contact_id = c.id
    WHERE 1=1
  `;
  let params = [];
  
  if (account_id) {
    query += ' AND m.account_id = ?';
    params.push(account_id);
  }
  
  if (contact_id) {
    query += ' AND m.contact_id = ?';
    params.push(contact_id);
  }
  
  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  try {
    const messages = await dbHelpers.all(query, params);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send bulk message with scalable implementation
router.post('/send-bulk', async (req, res) => {
  const { account_id, contact_ids, message_text, file_id, file_name } = req.body;
  
  if (!account_id || !contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return res.status(400).json({ error: 'ID аккаунта и корректный массив контактов обязательны' });
  }
  
  if (!message_text && !file_id) {
    return res.status(400).json({ error: 'Необходимо указать текст сообщения или файл' });
  }

  try {
    // Resolve file ID to path if provided
    let file_path = null;
    if (file_id) {
      file_path = getFilePathFromId(file_id);
      if (!file_path) {
        return res.status(400).json({ error: 'Файл не найден или недоступен' });
      }
    }

    // Get account info
    const account = await dbHelpers.get('SELECT * FROM accounts WHERE id = ? AND is_active = 1', [account_id]);
    if (!account) {
      return res.status(404).json({ error: 'Активный аккаунт не найден' });
    }

    // Get contacts
    const placeholders = contact_ids.map(() => '?').join(',');
    const contacts = await dbHelpers.all(
      `SELECT * FROM contacts WHERE id IN (${placeholders}) AND account_id = ?`,
      [...contact_ids, account_id]
    );

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'Контакты не найдены' });
    }

    // Use the scalable messaging system
    const results = await messageSender.sendBulkMessages(
      account.bot_token,
      contacts,
      message_text || null,
      file_path || null,
      file_name || null,
      (progress) => {
        // Could emit progress via WebSocket or Server-Sent Events here
        console.log(`Прогресс: ${progress.processed}/${progress.total} - ${progress.contact}: ${progress.success ? 'успех' : 'ошибка'}`);
      }
    );

    // Record all results in database asynchronously 
    const recordPromises = contacts.map(async (contact) => {
      const isSuccess = !results.errors.find(err => err.contact === contact.name);
      const status = isSuccess ? 'sent' : 'failed';
      const sentAt = isSuccess ? new Date().toISOString() : null;
      
      try {
        await dbHelpers.run(
          `INSERT INTO messages (account_id, contact_id, message_text, file_id, file_name, status, sent_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [account_id, contact.id, message_text || null, file_id || null, file_name || null, status, sentAt]
        );
      } catch (dbError) {
        console.error('Ошибка записи в базу данных:', dbError);
      }
    });

    // Don't wait for DB records to complete, return response immediately
    Promise.all(recordPromises).catch(err => console.error('Ошибка записи результатов:', err));

    res.json({
      message: 'Рассылка завершена',
      results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send single message  
router.post('/send', async (req, res) => {
  const { account_id, contact_id, message_text, file_id, file_name } = req.body;
  
  if (!account_id || !contact_id) {
    return res.status(400).json({ error: 'ID аккаунта и контакта обязательны' });
  }
  
  if (!message_text && !file_id) {
    return res.status(400).json({ error: 'Необходимо указать текст сообщения или файл' });
  }

  try {
    // Resolve file ID to path if provided
    let file_path = null;
    if (file_id) {
      file_path = getFilePathFromId(file_id);
      if (!file_path) {
        return res.status(400).json({ error: 'Файл не найден или недоступен' });
      }
    }

    // Get account and contact info
    const account = await dbHelpers.get('SELECT * FROM accounts WHERE id = ? AND is_active = 1', [account_id]);
    if (!account) {
      return res.status(404).json({ error: 'Активный аккаунт не найден' });
    }

    const contact = await dbHelpers.get('SELECT * FROM contacts WHERE id = ? AND account_id = ?', [contact_id, account_id]);
    if (!contact) {
      return res.status(404).json({ error: 'Контакт не найден' });
    }

    // Use the scalable messaging system for single contact
    const results = await messageSender.sendBulkMessages(
      account.bot_token,
      [contact],
      message_text || null,
      file_path || null,
      file_name || null
    );
    
    const status = results.success > 0 ? 'sent' : 'failed';
    const sentAt = results.success > 0 ? new Date().toISOString() : null;
    
    // Record in database
    await dbHelpers.run(
      `INSERT INTO messages (account_id, contact_id, message_text, file_id, file_name, status, sent_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [account_id, contact_id, message_text || null, file_id || null, file_name || null, status, sentAt]
    );
    
    if (results.success > 0) {
      res.json({
        message: 'Сообщение успешно отправлено',
        results
      });
    } else {
      res.status(500).json({ 
        error: 'Ошибка отправки сообщения',
        details: results.errors[0]?.error || 'Неизвестная ошибка'
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete message record
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await dbHelpers.run('DELETE FROM messages WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Запись сообщения не найдена' });
    }
    res.json({ message: 'Запись сообщения успешно удалена' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sending statistics
router.get('/stats', async (req, res) => {
  const { account_id } = req.query;
  
  let query = `
    SELECT 
      COUNT(*) as total_messages,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM messages
  `;
  let params = [];
  
  if (account_id) {
    query += ' WHERE account_id = ?';
    params.push(account_id);
  }
  
  try {
    const stats = await dbHelpers.get(query, params);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
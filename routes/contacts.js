const express = require('express');
const { dbHelpers } = require('../db');

const router = express.Router();

// Get all contacts
router.get('/', async (req, res) => {
  const { account_id } = req.query;
  
  let query = `
    SELECT c.*, a.name as account_name 
    FROM contacts c 
    LEFT JOIN accounts a ON c.account_id = a.id
  `;
  let params = [];
  
  if (account_id) {
    query += ' WHERE c.account_id = ?';
    params.push(account_id);
  }
  
  query += ' ORDER BY c.created_at DESC';
  
  try {
    const contacts = await dbHelpers.all(query, params);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new contact
router.post('/', async (req, res) => {
  const { name, chat_id, account_id } = req.body;
  
  if (!name || !chat_id || !account_id) {
    return res.status(400).json({ error: 'Имя, ID чата и ID аккаунта обязательны' });
  }

  try {
    // Check if account exists
    const account = await dbHelpers.get('SELECT id FROM accounts WHERE id = ?', [account_id]);
    if (!account) {
      return res.status(400).json({ error: 'Аккаунт не найден' });
    }
    
    const result = await dbHelpers.run(
      'INSERT INTO contacts (name, chat_id, account_id) VALUES (?, ?, ?)',
      [name, chat_id, account_id]
    );
    
    res.status(201).json({
      id: result.id,
      name,
      chat_id,
      account_id,
      message: 'Контакт успешно добавлен'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update contact
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, chat_id, account_id } = req.body;
  
  if (!name && !chat_id && !account_id) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  try {
    // If account_id is provided, check if account exists
    if (account_id) {
      const account = await dbHelpers.get('SELECT id FROM accounts WHERE id = ?', [account_id]);
      if (!account) {
        return res.status(400).json({ error: 'Аккаунт не найден' });
      }
    }

    let updateFields = [];
    let values = [];
    
    if (name) {
      updateFields.push('name = ?');
      values.push(name);
    }
    if (chat_id) {
      updateFields.push('chat_id = ?');
      values.push(chat_id);
    }
    if (account_id) {
      updateFields.push('account_id = ?');
      values.push(account_id);
    }
    
    values.push(id);
    
    const result = await dbHelpers.run(
      `UPDATE contacts SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Контакт не найден' });
    }
    res.json({ message: 'Контакт успешно обновлен' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await dbHelpers.run('DELETE FROM contacts WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Контакт не найден' });
    }
    res.json({ message: 'Контакт успешно удален' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import contacts from JSON
router.post('/import', async (req, res) => {
  const { contacts, account_id } = req.body;
  
  if (!contacts || !Array.isArray(contacts) || !account_id) {
    return res.status(400).json({ error: 'Неверный формат данных для импорта' });
  }

  try {
    // Check if account exists
    const account = await dbHelpers.get('SELECT id FROM accounts WHERE id = ?', [account_id]);
    if (!account) {
      return res.status(400).json({ error: 'Аккаунт не найден' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process contacts asynchronously
    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      
      if (!contact.name || !contact.chat_id) {
        errorCount++;
        errors.push(`Строка ${index + 1}: отсутствует имя или ID чата`);
        continue;
      }
      
      try {
        await dbHelpers.run(
          'INSERT INTO contacts (name, chat_id, account_id) VALUES (?, ?, ?)',
          [contact.name, contact.chat_id, account_id]
        );
        successCount++;
      } catch (err) {
        errorCount++;
        errors.push(`Строка ${index + 1}: ${err.message}`);
      }
    }
    
    res.json({
      message: `Импорт завершен. Успешно: ${successCount}, Ошибок: ${errorCount}`,
      successCount,
      errorCount,
      errors
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
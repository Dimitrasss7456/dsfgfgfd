// Global variables
let accounts = [];
let contacts = [];
let selectedContacts = [];
let uploadedFile = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadAccounts();
    loadContacts();
    loadMessageHistory();
});

// Tab functionality
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });

            // Load data for the active tab
            if (targetTab === 'contacts') {
                loadContactAccountOptions();
            } else if (targetTab === 'messages') {
                loadMessageAccountOptions();
            } else if (targetTab === 'history') {
                loadHistoryAccountOptions();
            }
        });
    });
}

// Utility functions
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const messageEl = document.getElementById('notification-message');

    notification.className = `notification ${type}`;
    messageEl.textContent = message;
    notification.classList.remove('hidden');

    // Auto hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
}

function hideNotification() {
    document.getElementById('notification').classList.add('hidden');
}

// Account management
async function loadAccounts() {
    try {
        showLoading();
        const response = await fetch('/api/accounts', {
            headers: { 'X-API-Key': 'admin123' }
        });
        const accountsData = await response.json();

        // Ensure accounts is always an array
        accounts = Array.isArray(accountsData) ? accountsData : [];
        renderAccounts(accounts);
    } catch (error) {
        showNotification('Ошибка загрузки аккаунтов: ' + error.message, 'error');
        accounts = []; // Set to empty array on error
    } finally {
        hideLoading();
    }
}

function renderAccounts() {
    const container = document.getElementById('accounts-list');

    if (accounts.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет добавленных аккаунтов</div>';
        return;
    }

    container.innerHTML = accounts.map(account => `
        <div class="list-item">
            <div class="item-info">
                <div class="item-name">${account.name}</div>
                <div class="item-details">
                    Статус: ${account.is_active ? '✅ Активен' : '❌ Неактивен'} | 
                    Добавлен: ${new Date(account.created_at).toLocaleDateString()}
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-small ${account.is_active ? 'btn-danger' : 'btn-success'}" 
                        onclick="toggleAccount(${account.id}, ${!account.is_active})">
                    ${account.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
                <button class="btn-small btn-danger" onclick="deleteAccount(${account.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

// Phone verification functions
async function requestVerification() {
    const phone = document.getElementById('phone').value.trim();

    if (!phone) {
        showNotification('Введите номер телефона', 'error');
        return;
    }

    if (!phone.match(/^\+7\d{10}$/)) {
        showNotification('Неверный формат номера. Используйте формат +7xxxxxxxxxx', 'error');
        return;
    }

    try {
        showLoading();
        const response = await fetch('/api/accounts/request-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123'
            },
            body: JSON.stringify({ phone })
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(result.message + (result.debug_code ? ` (Код: ${result.debug_code})` : ''), 'success');
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка запроса кода: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function addAccount() {
    const name = document.getElementById('account-name').value.trim();
    const botToken = document.getElementById('bot-token').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const verificationCode = document.getElementById('verification-code').value.trim();

    if (!name || !botToken || !phone || !verificationCode) {
        showNotification('Заполните все поля', 'error');
        return;
    }

    try {
        showLoading();
        const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123'
            },
            body: JSON.stringify({ 
                name, 
                bot_token: botToken, 
                phone, 
                verification_code: verificationCode 
            })
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            document.getElementById('account-name').value = '';
            document.getElementById('bot-token').value = '';
            document.getElementById('phone').value = '';
            document.getElementById('verification-code').value = '';
            loadAccounts();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка добавления аккаунта: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function testToken() {
    const botToken = document.getElementById('bot-token').value.trim();

    if (!botToken) {
        showNotification('Введите токен бота', 'error');
        return;
    }

    try {
        showLoading();
        const response = await fetch('/api/accounts/test', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123' 
            },
            body: JSON.stringify({ bot_token: botToken })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(`Токен действителен! Бот: ${result.bot_info.first_name || 'Без имени'}`, 'success');
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка проверки токена: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function toggleAccount(id, isActive) {
    try {
        showLoading();
        const response = await fetch(`/api/accounts/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123' 
            },
            body: JSON.stringify({ is_active: isActive })
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            loadAccounts();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка обновления аккаунта: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteAccount(id) {
    if (!confirm('Вы уверены, что хотите удалить этот аккаунт?')) {
        return;
    }

    try {
        showLoading();
        const response = await fetch(`/api/accounts/${id}`, { 
            method: 'DELETE',
            headers: { 'X-API-Key': 'admin123' }
        });
        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            loadAccounts();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка удаления аккаунта: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Contact management
async function loadContacts() {
    try {
        showLoading();
        const response = await fetch('/api/contacts', {
            headers: { 'X-API-Key': 'admin123' }
        });
        contacts = await response.json();
        renderContacts();
        updateRecipientList();
    } catch (error) {
        showNotification('Ошибка загрузки контактов: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderContacts() {
    const container = document.getElementById('contacts-list');

    if (contacts.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет добавленных контактов</div>';
        return;
    }

    container.innerHTML = contacts.map(contact => `
        <div class="list-item">
            <div class="item-info">
                <div class="item-name">${contact.name}</div>
                <div class="item-details">
                    ID чата: ${contact.chat_id} | 
                    Аккаунт: ${contact.account_name || 'Неизвестен'} | 
                    Добавлен: ${new Date(contact.created_at).toLocaleDateString()}
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-small btn-danger" onclick="deleteContact(${contact.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

function loadContactAccountOptions() {
    const select = document.getElementById('contact-account');
    if (!Array.isArray(accounts)) {
        select.innerHTML = '<option value="">Выберите аккаунт</option>';
        return;
    }
    select.innerHTML = '<option value="">Выберите аккаунт</option>' +
        accounts.filter(acc => acc.is_active).map(account => 
            `<option value="${account.id}">${account.name}</option>`
        ).join('');
}

async function addContact() {
    const name = document.getElementById('contact-name').value.trim();
    const chatId = document.getElementById('chat-id').value.trim();
    const accountId = document.getElementById('contact-account').value;

    if (!name || !chatId || !accountId) {
        showNotification('Заполните все поля', 'error');
        return;
    }

    try {
        showLoading();
        const response = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123' 
            },
            body: JSON.stringify({ 
                name, 
                chat_id: chatId, 
                account_id: parseInt(accountId) 
            })
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            document.getElementById('contact-name').value = '';
            document.getElementById('chat-id').value = '';
            loadContacts();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка добавления контакта: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function importContacts() {
    const importData = document.getElementById('import-contacts').value.trim();
    const accountId = document.getElementById('contact-account').value;

    if (!importData || !accountId) {
        showNotification('Выберите аккаунт и введите данные для импорта', 'error');
        return;
    }

    try {
        const contactsData = JSON.parse(importData);

        if (!Array.isArray(contactsData)) {
            throw new Error('Данные должны быть в формате массива');
        }

        showLoading();
        const response = await fetch('/api/contacts/import', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123' 
            },
            body: JSON.stringify({ 
                contacts: contactsData, 
                account_id: parseInt(accountId) 
            })
        });

        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            document.getElementById('import-contacts').value = '';
            loadContacts();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка импорта: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteContact(id) {
    if (!confirm('Вы уверены, что хотите удалить этот контакт?')) {
        return;
    }

    try {
        showLoading();
        const response = await fetch(`/api/contacts/${id}`, { 
            method: 'DELETE',
            headers: { 'X-API-Key': 'admin123' }
        });
        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            loadContacts();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка удаления контакта: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Message sending
function loadMessageAccountOptions() {
    const select = document.getElementById('message-account');
    if (!Array.isArray(accounts)) {
        select.innerHTML = '<option value="">Выберите аккаунт</option>';
        return;
    }
    select.innerHTML = '<option value="">Выберите аккаунт</option>' +
        accounts.filter(acc => acc.is_active).map(account => 
            `<option value="${account.id}">${account.name}</option>`
        ).join('');

    select.addEventListener('change', updateRecipientList);
}

function updateRecipientList() {
    const accountId = document.getElementById('message-account')?.value;
    const container = document.getElementById('recipient-list');

    if (!container) return;

    const filteredContacts = accountId ? 
        contacts.filter(c => c.account_id == accountId) : 
        contacts;

    if (filteredContacts.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет доступных контактов</div>';
        return;
    }

    container.innerHTML = filteredContacts.map(contact => `
        <div class="recipient-item">
            <input type="checkbox" 
                   id="contact-${contact.id}" 
                   value="${contact.id}" 
                   onchange="updateSelectedContacts()">
            <label for="contact-${contact.id}">
                ${contact.name} (${contact.chat_id})
            </label>
        </div>
    `).join('');
}

function updateSelectedContacts() {
    selectedContacts = Array.from(document.querySelectorAll('#recipient-list input:checked'))
        .map(checkbox => parseInt(checkbox.value));
}

function selectAllContacts() {
    document.querySelectorAll('#recipient-list input[type="checkbox"]')
        .forEach(checkbox => checkbox.checked = true);
    updateSelectedContacts();
}

function deselectAllContacts() {
    document.querySelectorAll('#recipient-list input[type="checkbox"]')
        .forEach(checkbox => checkbox.checked = false);
    updateSelectedContacts();
}

async function uploadFile() {
    const fileInput = document.getElementById('message-file');
    const file = fileInput.files[0];

    if (!file) {
        showNotification('Выберите файл для загрузки', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        showLoading();
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'X-API-Key': 'admin123' // Default API key for development
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            uploadedFile = {
                id: result.fileId,
                name: result.originalName
            };
            document.getElementById('upload-status').innerHTML = 
                `<div class="status-success">Файл загружен: ${result.originalName}</div>`;
            showNotification(result.message, 'success');
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка загрузки файла: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function sendBulkMessage() {
    const accountId = document.getElementById('message-account').value;
    const messageText = document.getElementById('message-text').value.trim();

    if (!accountId) {
        showNotification('Выберите аккаунт', 'error');
        return;
    }

    if (selectedContacts.length === 0) {
        showNotification('Выберите получателей', 'error');
        return;
    }

    if (!messageText && !uploadedFile) {
        showNotification('Введите текст сообщения или загрузите файл', 'error');
        return;
    }

    try {
        showLoading();
        document.getElementById('send-btn').disabled = true;

        const response = await fetch('/api/messages/send-bulk', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'admin123' 
            },
            body: JSON.stringify({
                account_id: parseInt(accountId),
                contact_ids: selectedContacts,
                message_text: messageText || null,
                file_path: uploadedFile?.path || null,
                file_name: uploadedFile?.name || null
            })
        });

        const result = await response.json();

        if (response.ok) {
            const statusDiv = document.getElementById('send-status');
            statusDiv.className = 'status-success';
            statusDiv.textContent = 
                `${result.message}\n` +
                `Всего: ${result.results.total}\n` +
                `Успешно: ${result.results.success}\n` +
                `Ошибок: ${result.results.failed}\n` +
                (result.results.errors.length > 0 ? 
                    `\nОшибки:\n${result.results.errors.map(e => `${e.contact}: ${e.error}`).join('\n')}` : 
                    '');
            showNotification('Рассылка завершена', 'success');

            // Reset form
            document.getElementById('message-text').value = '';
            document.getElementById('message-file').value = '';
            uploadedFile = null;
            document.getElementById('upload-status').innerHTML = '';
            deselectAllContacts();
        } else {
            document.getElementById('send-status').className = 'status-error';
            document.getElementById('send-status').textContent = result.error;
            showNotification(result.error, 'error');
        }
    } catch (error) {
        document.getElementById('send-status').className = 'status-error';
        document.getElementById('send-status').textContent = 'Ошибка: ' + error.message;
        showNotification('Ошибка отправки: ' + error.message, 'error');
    } finally {
        hideLoading();
        document.getElementById('send-btn').disabled = false;
    }
}

// Message history
function loadHistoryAccountOptions() {
    const select = document.getElementById('history-account');
    if (!Array.isArray(accounts)) {
        select.innerHTML = '<option value="">Все аккаунты</option>';
        return;
    }
    select.innerHTML = '<option value="">Все аккаунты</option>' +
        accounts.map(account => 
            `<option value="${account.id}">${account.name}</option>`
        ).join('');
}

async function loadMessageHistory() {
    const accountId = document.getElementById('history-account')?.value || '';

    try {
        showLoading();

        // Load statistics
        const statsResponse = await fetch(`/api/messages/stats${accountId ? '?account_id=' + accountId : ''}`, {
            headers: { 'X-API-Key': 'admin123' }
        });
        const stats = await statsResponse.json();
        renderStats(stats);

        // Load message history
        const historyResponse = await fetch(`/api/messages${accountId ? '?account_id=' + accountId : ''}`, {
            headers: { 'X-API-Key': 'admin123' }
        });
        const messages = await historyResponse.json();
        renderMessageHistory(messages);

    } catch (error) {
        showNotification('Ошибка загрузки истории: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderStats(stats) {
    const container = document.getElementById('stats');
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.total_messages || 0}</div>
            <div class="stat-label">Всего сообщений</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.successful || 0}</div>
            <div class="stat-label">Успешно отправлено</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.failed || 0}</div>
            <div class="stat-label">Ошибок отправки</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.pending || 0}</div>
            <div class="stat-label">В ожидании</div>
        </div>
    `;
}

function renderMessageHistory(messages) {
    const container = document.getElementById('history-list');

    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет отправленных сообщений</div>';
        return;
    }

    container.innerHTML = messages.map(message => `
        <div class="list-item">
            <div class="item-info">
                <div class="item-name">
                    ${message.contact_name || 'Неизвестен'} (${message.chat_id || 'N/A'})
                </div>
                <div class="item-details">
                    ${message.message_text ? `Текст: ${message.message_text.substring(0, 50)}${message.message_text.length > 50 ? '...' : ''}` : ''}
                    ${message.file_name ? `| Файл: ${message.file_name}` : ''}
                    <br>
                    Статус: ${getStatusText(message.status)} | 
                    Аккаунт: ${message.account_name || 'Неизвестен'} | 
                    ${message.sent_at ? 
                        `Отправлено: ${new Date(message.sent_at).toLocaleString()}` : 
                        `Создано: ${new Date(message.created_at).toLocaleString()}`}
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-small btn-danger" onclick="deleteMessage(${message.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

function getStatusText(status) {
    const statusMap = {
        'sent': '✅ Отправлено',
        'failed': '❌ Ошибка',
        'pending': '⏳ В ожидании'
    };
    return statusMap[status] || status;
}

async function deleteMessage(id) {
    if (!confirm('Вы уверены, что хотите удалить эту запись?')) {
        return;
    }

    try {
        showLoading();
        const response = await fetch(`/api/messages/${id}`, { 
            method: 'DELETE',
            headers: { 'X-API-Key': 'admin123' }
        });
        const result = await response.json();

        if (response.ok) {
            showNotification(result.message, 'success');
            loadMessageHistory();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка удаления записи: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}
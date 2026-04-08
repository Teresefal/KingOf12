async function loadSessions() {
    try {
        const response = await fetch('api/sessions.php?action=list');
        const data = await response.json();
        const container = document.getElementById('sessions-container');

        if (!data.sessions || data.sessions.length === 0) {
            container.innerHTML = '<p class="empty">Нет доступных игр. Создайте новую!</p>';
            return;
        }

        let html = `<table>
            <tr>
                <th>Игра</th>
                <th>Игроки</th>
                <th>Статус</th>
                <th></th>
            </tr>`;

        data.sessions.forEach(session => {
            const statusLabel = session.status === 'waiting' ? '⏳ Ожидание' : '🎮 В игре';
            let actionBtn = '';

            if (session.i_am_in) {
                // Игрок уже в этой сессии
                if (session.status === 'waiting') {
                    actionBtn = `
                        <button onclick="rejoinGame(${session.session_id})" class="btn-rejoin">Вернуться</button>
                        ${session.i_am_owner
                            ? `<button onclick="disbandGame(${session.session_id})" class="btn-disband">Закрыть</button>`
                            : `<button onclick="leaveGame(${session.session_id})" class="btn-leave">Выйти</button>`
                        }`;
                } else {
                    actionBtn = `<button onclick="rejoinGame(${session.session_id})" class="btn-rejoin">Войти в игру</button>`;
                }
            } else if (session.status === 'waiting' && session.current_players < session.max_players) {
                actionBtn = `<button onclick="joinGame(${session.session_id})">Присоединиться</button>`;
            }

            html += `
                <tr ${session.i_am_in ? 'class="my-session"' : ''}>
                    <td>${session.session_name || 'Игра #' + session.session_id}</td>
                    <td>${session.current_players}/${session.max_players}</td>
                    <td>${statusLabel}</td>
                    <td>${actionBtn}</td>
                </tr>`;
        });

        html += '</table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Ошибка загрузки сессий:', error);
    }
}

async function createGame(event) {
    event.preventDefault();
    const gameName   = document.getElementById('game-name').value;
    const maxPlayers = document.getElementById('max-players').value;

    try {
        const response = await fetch('api/sessions.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: 'create', name: gameName, max_players: maxPlayers })
        });
        const data = await response.json();
        if (data.success) {
            window.location.href = 'game.php?session=' + data.session_id;
        } else {
            alert('Ошибка создания игры: ' + data.message);
        }
    } catch (error) {
        alert('Ошибка соединения');
    }
}

async function joinGame(sessionId) {
    try {
        const response = await fetch('api/sessions.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: 'join', session_id: sessionId })
        });
        const data = await response.json();
        if (data.success) {
            window.location.href = 'game.php?session=' + data.session_id;
        } else {
            alert('Не удалось присоединиться: ' + data.message);
        }
    } catch (error) {
        alert('Ошибка соединения');
    }
}

// Вернуться в уже существующую сессию
function rejoinGame(sessionId) {
    window.location.href = 'game.php?session=' + sessionId;
}

// Покинуть лобби (не хост)
async function leaveGame(sessionId) {
    if (!confirm('Покинуть лобби?')) return;
    try {
        const response = await fetch('api/sessions.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: 'leave', session_id: sessionId })
        });
        const data = await response.json();
        if (data.success) loadSessions();
        else alert('Ошибка: ' + data.message);
    } catch (error) {
        alert('Ошибка соединения');
    }
}

// Закрыть лобби (хост)
async function disbandGame(sessionId) {
    if (!confirm('Закрыть лобби? Все игроки будут удалены.')) return;
    try {
        const response = await fetch('api/sessions.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: 'leave', session_id: sessionId })
        });
        const data = await response.json();
        if (data.success) loadSessions();
        else alert('Ошибка: ' + data.message);
    } catch (error) {
        alert('Ошибка соединения');
    }
}

async function logout() {
    await fetch('api/auth.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action: 'logout' })
    });
    window.location.href = 'index.php';
}
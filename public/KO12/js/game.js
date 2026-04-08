const CARD_DESCRIPTIONS = {
    'АЛХИМИК':  'Увеличьте в два раза значение своего кубика.',
    'ШУЛЕР':    'Победитель получает 1 очко, второе место — 2 очка.',
    'ОРАКУЛ':   'Перебросьте свой кубик. Срабатывает последним.',
    'ГОЛЕМ':    'Значение вашего кубика = 12. Если после эффектов = 12, то = 1.',
    'ЧАРОДЕЙ':  'Переверните кубик на прилегающую грань.',
    'РЫЦАРЬ':   'Минимум побеждает, второй минимум — второе место.',
    'ЛЕДИ':     'Отменяет эффекты всех остальных карт.',
    'РОБОТ':    'Добавьте 7 к значению своего кубика.',
    'ТОРГОВЦЫ': 'Все передают кубики по кругу влево.',
    'ПАРАЗИТ':  'Уменьшите значение кубика на 7.',
    'ОБОРОТЕНЬ':'Переверните кубик на противоположную грань (сумма = 13).',
    'СМУТЬЯНЫ': 'Все переворачивают кубики на противоположную грань.'
};

const CARD_ICONS = {
    'АЛХИМИК':'⚗️','ШУЛЕР':'🃏','ОРАКУЛ':'🔮','ГОЛЕМ':'🗿',
    'ЧАРОДЕЙ':'🧙','РЫЦАРЬ':'⚔️','ЛЕДИ':'👸','РОБОТ':'🤖',
    'ТОРГОВЦЫ':'🛒','ПАРАЗИТ':'🦠','ОБОРОТЕНЬ':'🐺','СМУТЬЯНЫ':'😈'
};

let wizardModalOpen = false;

// PostgreSQL JSON возвращает числа как строки; PHP вставляет числа.
// "5" === 5 → false, поэтому используем sameId везде.
const sameId = (a, b) => parseInt(a, 10) === parseInt(b, 10);

// ─────────────────────────────────────────────────────────────────────────────
// POLLING
// ─────────────────────────────────────────────────────────────────────────────

function startPolling() {
    loadGameState();
    loadGameLog();
    pollInterval = setInterval(loadGameState, 2000);
    setInterval(loadGameLog, 4000);
}

function stopPolling() {
    if (pollInterval) clearInterval(pollInterval);
}

async function loadGameState() {
    try {
        const res  = await fetch(`api/game.php?action=state&session=${SESSION_ID}`);
        const data = await res.json();
        if (!data.success) return;
        gameState = data.state;
        updateUI();
    } catch (e) { console.error('loadGameState:', e); }
}

async function loadGameLog() {
    try {
        const res  = await fetch(`api/game.php?action=log&session=${SESSION_ID}`);
        const data = await res.json();
        if (!data.success || !data.log || data.log.length === 0) return;
        renderLog(data.log);
    } catch (e) { console.error('loadGameLog:', e); }
}

function renderLog(entries) {
    const box = document.getElementById('log-messages');
    if (!box || !entries || entries.length === 0) return;

    let html = '';
    entries.forEach(entry => {
        const raw = (entry.log_time || '').toString();
        let t = '';
        try {
            const d = new Date(raw.replace(' ', 'T'));
            t = isNaN(d) ? raw.substring(11,19)
                : d.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        } catch(_) { t = raw.substring(11,19); }

        const msg = (entry.event_msg || '').toString();
        let cls = 'log-info';
        if (msg.startsWith('⭐')||msg.startsWith('🏆')||msg.startsWith('✅')||msg.startsWith('🏅')) cls = 'log-success';
        if (msg.startsWith('❌')) cls = 'log-error';
        if (msg.startsWith('💃')||msg.startsWith('🤝')) cls = 'log-warn';

        html += `<div class="log-message ${cls}">[${t}] ${msg}</div>`;
    });
    box.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI UPDATE
// ─────────────────────────────────────────────────────────────────────────────

function updateUI() {
    if (!gameState) return;
    updateRoundInfo();
    updatePlayers();
    updateYourHand();
    updateDiceArea();
    updateStartButton();
    checkWizardChoice();
}

function updateRoundInfo() {
    const el     = document.getElementById('round-info');
    const status = gameState.session.status;

    if (status === 'waiting') {
        el.textContent = `Ожидание игроков: ${gameState.players.length}/${gameState.session.max_players}`;
    } else if (status === 'active') {
        const round = gameState.current_round;
        const play  = gameState.current_play;
        if (round && play) {
            const hint = play.status === 'awaiting_wizard' ? ' 🧙 ждём ЧАРОДЕЙ' : '';
            el.textContent = `Раунд ${round.round_number} | Розыгрыш ${play.play_number}${hint}`;
        } else if (round) {
            el.textContent = `Раунд ${round.round_number}`;
        }
    } else if (status === 'finished') {
        el.textContent = 'Игра завершена!';
        stopPolling();
        showGameResult();
    }
}

function updatePlayers() {
    const area = document.getElementById('players-area');
    let html = '';
    gameState.players.forEach(p => {
        const isYou = p.login === USER_LOGIN;
        const hasSel = gameState.current_play &&
            gameState.selected_cards.some(sc => sameId(sc.id_player, p.id_player));
        html += `
        <div class="player-card ${isYou ? 'player-you' : ''}">
            <div class="player-header">
                <div class="player-name">${p.name||p.login}${isYou?' (Вы)':''}${p.is_owner?' 👑':''}</div>
                ${hasSel ? '<span class="card-selected">✓ выбрал</span>' : ''}
            </div>
            <div class="player-stats">
                <div class="stat"><span class="label">Очки:</span><span class="value">${p.round_victory_points}</span></div>
                <div class="stat"><span class="label">Победы:</span><span class="value">${p.cards_under_dice}/2</span></div>
            </div>
            <div class="player-victories">${'⭐'.repeat(p.cards_under_dice)}</div>
        </div>`;
    });
    area.innerHTML = html;
}

function updateYourHand() {
    const hand    = document.getElementById('your-hand');
    const statusEl = document.getElementById('hand-status');

    if (!gameState.your_cards || gameState.your_cards.length === 0) {
        hand.innerHTML = '<p class="loading">Нет карт</p>';
        return;
    }

    const isActive  = gameState.session.status === 'active';
    const canSelect = isActive &&
        gameState.current_play &&
        gameState.current_play.status === 'card_selection' &&
        !gameState.selected_cards.some(sc => sameId(sc.id_player, PLAYER_ID));

    if (statusEl) {
        if (!isActive) statusEl.textContent = '';
        else if (canSelect) statusEl.textContent = '← выберите карту';
        else if (gameState.current_play?.status === 'card_selection') statusEl.textContent = '✓ ждём остальных';
        else statusEl.textContent = '';
    }

    let html = '';
    gameState.your_cards.forEach(card => {
        const avail   = card.is_available;
        const isSelHP = selectedCard === card.card_id;
        const imgSrc  = `images/cards/${encodeURIComponent(card.card_name)}.png`;
        const icon    = CARD_ICONS[card.card_name] || '🂠';
        const click   = (canSelect && avail) ? `onclick="selectCard(${card.card_id},'${card.card_name}')"` : '';
        const cls     = ['card', !avail?'card-disabled':'', isSelHP?'card-selected-hand':''].filter(Boolean).join(' ');

        html += `
        <div class="${cls}" ${click}>
            <div class="container">
                <img class="image" src="${imgSrc}" alt="${card.card_name}"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="image-placeholder" style="display:none">${icon}</div>
                <div class="info">
                    <div class="name">${card.card_name}</div>
                    <p class="rules">${card.card_description || CARD_DESCRIPTIONS[card.card_name] || ''}</p>
                    ${!avail ? '<div class="card-status-badge">Использована</div>' : ''}
                </div>
            </div>
        </div>`;
    });
    hand.innerHTML = html;
}

function updateDiceArea() {
    const area = document.getElementById('dice-area');
    if (!gameState.current_play || !gameState.dice_rolls?.length) {
        area.innerHTML = ''; return;
    }
    let html = '<div class="dice-container">';
    gameState.dice_rolls.forEach(roll => {
        const p = gameState.players.find(pl => sameId(pl.id_player, roll.id_player));
        if (!p) return;
        const hasResult  = roll.final_value !== null && roll.final_value !== undefined;
        const isCanceled = roll.is_canceled;
        html += `
        <div class="dice-item ${isCanceled?'dice-canceled':''}">
            <div class="dice-player">${p.name||p.login}</div>
            <div class="dice-value">🎲 ${roll.base_value}${
                hasResult && String(roll.final_value) !== String(roll.base_value)
                    ? ` → ${roll.final_value}` : ''}</div>
            ${isCanceled ? '<div class="dice-status">Отменён</div>' : ''}
        </div>`;
    });
    html += '</div>';
    area.innerHTML = html;
}

function updateStartButton() {
    if (!IS_OWNER) return;
    const container = document.getElementById('start-game-container');
    const btn       = document.getElementById('start-game-btn');
    if (!container || !btn) return;
    if (gameState.session.status === 'waiting') {
        container.style.display = 'block';
        btn.disabled = gameState.players.length < 2;
    } else {
        container.style.display = 'none';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ВЫБОР КАРТЫ
// ─────────────────────────────────────────────────────────────────────────────

async function selectCard(cardId, cardName) {
    if (selectedCard === cardId) { selectedCard = null; updateYourHand(); return; }
    selectedCard = cardId;
    updateYourHand();

    if (!confirm(`Сыграть карту «${cardName}»?`)) { selectedCard = null; updateYourHand(); return; }

    try {
        const res  = await fetch('api/game.php', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action:'select_card',session_id:SESSION_ID,player_id:PLAYER_ID,card_id:cardId})
        });
        const data = await res.json();
        selectedCard = null;
        if (data.success) {
            loadGameState();
            setTimeout(loadGameLog, 700);
        } else {
            alert('Ошибка: ' + data.message);
            updateYourHand();
        }
    } catch(e) { alert('Ошибка выбора карты'); selectedCard=null; updateYourHand(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// СТАРТ / ВЫХОД
// ─────────────────────────────────────────────────────────────────────────────

async function startGame() {
    if (!IS_OWNER || !confirm('Начать игру?')) return;
    try {
        const res  = await fetch('api/game.php', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action:'start_game',session_id:SESSION_ID})
        });
        const data = await res.json();
        if (data.success) { loadGameState(); setTimeout(loadGameLog, 800); }
        else alert('Ошибка: ' + data.message);
    } catch(e) { alert('Ошибка запуска'); }
}

async function leaveGame() {
    if (!confirm('Покинуть игру?')) return;
    if (gameState?.session?.status === 'waiting') {
        try {
            await fetch('api/sessions.php', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({action:'leave',session_id:SESSION_ID})
            });
        } catch(_) {}
    }
    stopPolling();
    window.location.href = 'lobby.php';
}

// ─────────────────────────────────────────────────────────────────────────────
// РЕЗУЛЬТАТ ИГРЫ
// ─────────────────────────────────────────────────────────────────────────────

function showGameResult() {
    const modal  = document.getElementById('result-modal');
    const title  = document.getElementById('result-title');
    const body   = document.getElementById('result-body');
    const winner = gameState.players.find(p => p.cards_under_dice >= 2);
    if (!winner) return;
    title.textContent = '🏆 Игра завершена!';
    body.innerHTML = `
        <p class="winner-announce">Победитель: <strong>${winner.name||winner.login}</strong>!</p>
        <div class="final-scores"><h3>Итоговый счёт:</h3>
            ${gameState.players.map(p=>`
                <div class="score-line">
                    ${sameId(p.id_player,winner.id_player)?'👑 ':''}
                    ${p.name||p.login}: ${p.cards_under_dice} побед
                </div>`).join('')}
        </div>`;
    modal.style.display = 'flex';
    loadGameLog();
}

function closeResultModal() {
    document.getElementById('result-modal').style.display = 'none';
    window.location.href = 'lobby.php';
}

// ─────────────────────────────────────────────────────────────────────────────
// ЧАРОДЕЙ
// ─────────────────────────────────────────────────────────────────────────────

function getAdjacentFacesD12(f) {
    const m = {
        1:[2,4,5,6,10], 2:[1,4,7,8,10], 3:[4,6,8,11,12], 4:[1,2,3,6,8],
        5:[1,6,9,10,11], 6:[1,3,4,5,11], 7:[2,8,9,10,12], 8:[2,3,4,7,12],
        9:[5,7,10,11,12], 10:[1,2,5,7,9], 11:[3,5,6,9,12], 12:[3,7,8,9,11]
    };
    return m[parseInt(f,10)] || [];
}

function checkWizardChoice() {
    if (!gameState?.current_play) return;
    if (gameState.current_play.status !== 'awaiting_wizard') return;
    if (wizardModalOpen) return;

    const mySelected = gameState.selected_cards.find(sc => sameId(sc.id_player, PLAYER_ID));
    if (!mySelected) return;

    const myCard = gameState.your_cards.find(c => sameId(c.card_id, mySelected.id_card));
    if (!myCard || myCard.card_name !== 'ЧАРОДЕЙ') return;

    if ((gameState.wizard_choices||[]).some(wc => sameId(wc.id_player, PLAYER_ID))) return;

    const myDice = gameState.dice_rolls.find(dr => sameId(dr.id_player, PLAYER_ID));
    if (!myDice) return;

    showWizardChoiceModal(myDice.base_value);
}

function showWizardChoiceModal(currentFace) {
    wizardModalOpen = true;
    const faces = getAdjacentFacesD12(currentFace);
    document.getElementById('wizard-modal-title').textContent = '🧙 ЧАРОДЕЙ — выберите грань';
    document.getElementById('wizard-modal-body').innerHTML = `
        <div class="wizard-info">Текущая грань:<strong>${currentFace}</strong></div>
        <p class="wizard-instruction">Выберите одну из прилегающих граней:</p>
        <div class="wizard-choices">
            ${faces.map(f=>`<button class="wizard-choice-btn" onclick="selectWizardChoice(${f})">🎲 ${f}</button>`).join('')}
        </div>
        <p class="wizard-hint">Прилегающие грани касаются текущей верхней грани додекаэдра.</p>`;
    document.getElementById('wizard-modal').style.display = 'flex';
}

function closeWizardModal() {
    wizardModalOpen = false;
    document.getElementById('wizard-modal').style.display = 'none';
}

async function selectWizardChoice(face) {
    try {
        const res  = await fetch('api/game.php', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                action:'wizard_choice', session_id:SESSION_ID, player_id:PLAYER_ID,
                play_id:gameState.current_play.id_play, chosen_face:face
            })
        });
        const data = await res.json();
        if (data.success) {
            closeWizardModal();
            loadGameState();
            setTimeout(loadGameLog, 800);
        } else { alert('Ошибка: ' + data.message); }
    } catch(e) { alert('Ошибка выбора грани'); console.error(e); }
}
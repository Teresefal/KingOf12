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

// ── Серверно-синхронизированный таймер лобби ─────────────────────────────────
// Сервер сам считает сколько секунд осталось и присылает lobby_countdown_sec.
// Клиент только интерполирует между poll-ами через requestAnimationFrame.
const LOBBY_COUNTDOWN_SEC = 30;
let lobbyCountdownAtPoll  = null; // секунды с сервера на момент последнего poll
let lobbyCountdownFetchTs = null; // Date.now() когда получили это значение
let lobbyRafHandle        = null; // rAF для плавного обновления полоски

// ── Попап подтверждения карты ─────────────────────────────────────────────────
const CARD_CONFIRM_SEC = 5;
let pendingCardId    = null;
let pendingCardName  = null;
let cardConfirmRaf   = null;
let cardConfirmStart = null; // Date.now() старта confirm

// sameId: PostgreSQL возвращает числа как строки
const sameId = (a, b) => parseInt(a, 10) === parseInt(b, 10);

// ─────────────────────────────────────────────────────────────────────────────
// POLLING
// ─────────────────────────────────────────────────────────────────────────────

function startPolling() {
    loadGameState();
    loadGameLog();
    pollInterval = setInterval(loadGameState, 2000);
    setInterval(loadGameLog, 4000);
    sendHeartbeat();
    setInterval(sendHeartbeat, 30000);
}

function stopPolling() {
    if (pollInterval) clearInterval(pollInterval);
}

async function sendHeartbeat() {
    if (!SESSION_ID) return;
    try {
        await fetch('api/heartbeat.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: SESSION_ID })
        });
    } catch (_) {}
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
    const hand     = document.getElementById('your-hand');
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
        // Передаём event для позиционирования попапа рядом с картой
        const click   = (canSelect && avail)
            ? `onclick="selectCard(event,${card.card_id},'${card.card_name}')"`
            : '';
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

// ─────────────────────────────────────────────────────────────────────────────
// СТАРТ ИГРЫ — серверно-синхронизированный countdown
// ─────────────────────────────────────────────────────────────────────────────

function updateStartButton() {
    const container = document.getElementById('start-game-container');
    const content   = document.getElementById('lobby-status-content');
    if (!container || !content) return;

    if (gameState.session.status !== 'waiting') {
        container.style.display = 'none';
        cancelAnimationFrame(lobbyRafHandle);
        lobbyCountdownAtPoll = lobbyCountdownFetchTs = null;
        return;
    }

    container.style.display = 'block';
    const count            = gameState.players.length;
    const max              = gameState.session.max_players;
    const countdownFromSrv = gameState.session.lobby_countdown_sec;

    if (count < 2 || countdownFromSrv === null || countdownFromSrv === undefined) {
        cancelAnimationFrame(lobbyRafHandle);
        lobbyCountdownAtPoll = null;
        content.innerHTML = `
            <p class="countdown-waiting">Ожидание игроков…</p>
            <p class="hint">${count} из ${max} — нужно минимум 2</p>`;
        return;
    }

    // Обновляем серверное значение, но структуру HTML рендерим только один раз
    lobbyCountdownAtPoll  = parseInt(countdownFromSrv, 10);
    lobbyCountdownFetchTs = Date.now();

    // Рендерим структуру только если её ещё нет — кнопка должна жить постоянно
    if (!document.getElementById('lobby-countdown-sec')) {
        content.innerHTML = `
            <p class="countdown-label">Игра начнётся через <strong id="lobby-countdown-sec"></strong> сек</p>
            <div class="countdown-track">
                <div class="countdown-fill" id="lobby-countdown-fill"></div>
            </div>
            <p class="hint">${count} из ${max} игроков в комнате</p>
            ${IS_OWNER
                ? `<button id="lobby-start-btn" onclick="startGame()" class="btn-primary btn-start-now">Начать сейчас</button>`
                : ''}`;
    }

    cancelAnimationFrame(lobbyRafHandle);
    tickLobbyCountdown();
}

function tickLobbyCountdown() {
    const secEl = document.getElementById('lobby-countdown-sec');
    const fill  = document.getElementById('lobby-countdown-fill');
    if (!secEl || lobbyCountdownAtPoll === null) return;

    const elapsed   = (Date.now() - lobbyCountdownFetchTs) / 1000;
    const remaining = Math.max(0, lobbyCountdownAtPoll - elapsed);
    const pct       = (remaining / LOBBY_COUNTDOWN_SEC) * 100;

    secEl.textContent  = Math.ceil(remaining);
    if (fill) fill.style.width = pct + '%';

    if (remaining <= 0) {
        if (IS_OWNER) startGame(true);
        return;
    }

    lobbyRafHandle = requestAnimationFrame(tickLobbyCountdown);
}

async function startGame(auto = false) {
    if (!IS_OWNER) return;
    try {
        const res  = await fetch('api/game.php', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action:'start_game', session_id:SESSION_ID})
        });
        const data = await res.json();
        if (data.success) { loadGameState(); setTimeout(loadGameLog, 800); }
        else if (!auto) alert('Ошибка: ' + data.message);
    } catch(e) { if (!auto) alert('Ошибка запуска'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// ВЫБОР КАРТЫ — попап рядом с картой
// ─────────────────────────────────────────────────────────────────────────────

function selectCard(event, cardId, cardName) {
    if (selectedCard === cardId) { selectedCard = null; updateYourHand(); return; }
    // Снимаем координаты ДО перерисовки — после updateYourHand элемент уничтожается
    const cardRect = event.currentTarget.getBoundingClientRect();
    selectedCard = cardId;
    updateYourHand();
    showCardConfirmPopup(cardRect, cardId, cardName);
}

// ─────────────────────────────────────────────────────────────────────────────
// ПОПАП ПОДТВЕРЖДЕНИЯ КАРТЫ
// ─────────────────────────────────────────────────────────────────────────────

function showCardConfirmPopup(cardRect, cardId, cardName) {
    pendingCardId    = cardId;
    pendingCardName  = cardName;
    cardConfirmStart = Date.now();

    document.getElementById('card-confirm-icon').textContent = CARD_ICONS[cardName] || '🂠';
    document.getElementById('card-confirm-name').textContent = cardName;

    const popup = document.getElementById('card-confirm-popup');
    popup.style.display = 'flex';
    // cardRect — уже снятый DOMRect, элемент может быть уничтожен
    positionConfirmPopup(popup, cardRect);

    cancelAnimationFrame(cardConfirmRaf);
    tickCardConfirm();
}

function positionConfirmPopup(popup, cardRect) {
    const isMobile = window.innerWidth <= 640;

    if (isMobile) {
        // Мобильный: внизу экрана по центру
        popup.style.position  = 'fixed';
        popup.style.left      = '50%';
        popup.style.top       = 'auto';
        popup.style.bottom    = '16px';
        popup.style.transform = 'translateX(-50%)';
        return;
    }

    // Десктоп: под картой.
    // Центрируем горизонтально через transform — не нужно знать ширину попапа.
    // Якорь left = центр карты, translateX(-50%) выравнивает попап по центру.
    const gap = 10;

    const anchorLeft = cardRect.left + cardRect.width / 2;
    let   top        = cardRect.bottom + gap;

    // Грубая оценка высоты попапа (~160px) чтобы проверить выход за экран снизу
    const POPUP_H_EST = 170;
    if (top + POPUP_H_EST > window.innerHeight - 8) {
        top = cardRect.top - POPUP_H_EST - gap;
    }

    popup.style.position  = 'fixed';
    popup.style.left      = anchorLeft + 'px';
    popup.style.top       = top + 'px';
    popup.style.bottom    = 'auto';
    // translateX(-50%) центрирует, clamp не даём выйти за края через CSS max-width
    popup.style.transform = 'translateX(-50%)';
}

function tickCardConfirm() {
    const fill      = document.getElementById('card-confirm-fill');
    const secEl     = document.getElementById('card-confirm-sec');
    const elapsed   = (Date.now() - cardConfirmStart) / 1000;
    const remaining = Math.max(0, CARD_CONFIRM_SEC - elapsed);

    if (fill)  fill.style.width  = (remaining / CARD_CONFIRM_SEC * 100) + '%';
    if (secEl) secEl.textContent = Math.ceil(remaining);

    if (remaining <= 0) { confirmCardSelection(); return; }
    cardConfirmRaf = requestAnimationFrame(tickCardConfirm);
}

function cancelCardSelection() {
    cancelAnimationFrame(cardConfirmRaf);
    document.getElementById('card-confirm-popup').style.display = 'none';
    pendingCardId = pendingCardName = null;
    selectedCard  = null;
    updateYourHand();
}

async function confirmCardSelection() {
    cancelAnimationFrame(cardConfirmRaf);
    document.getElementById('card-confirm-popup').style.display = 'none';

    const cardId = pendingCardId;
    pendingCardId = pendingCardName = null;
    if (!cardId) return;

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
    } catch(e) { alert('Ошибка выбора карты'); selectedCard = null; updateYourHand(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// СТАРТ / ВЫХОД
// ─────────────────────────────────────────────────────────────────────────────

async function leaveGame() {
    if (!confirm('Покинуть игру?')) return;
    cancelCardSelection(); // закрываем попап если открыт
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
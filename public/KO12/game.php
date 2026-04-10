<?php

session_start();
require_once __DIR__ . '/../../includes/db.php';

if (!isset($_SESSION['user_login'])) {
    header('Location: index.php');
    exit;
}

$sessionId = (int)($_GET['session'] ?? 0);
if ($sessionId <= 0) {
    header('Location: lobby.php');
    exit;
}

try {
    $player = Database::fetchOne(
        "SELECT p.id_player, p.seat_index, p.is_owner
         FROM Players p
         WHERE p.id_session = ? AND p.login = ?",
        [$sessionId, $_SESSION['user_login']]
    );
    if (!$player) {
        header('Location: lobby.php');
        exit;
    }
    $playerId = $player['id_player'];
    $isOwner  = $player['is_owner'];
} catch (Exception $e) {
    error_log("Game page error: " . $e->getMessage());
    header('Location: lobby.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Игра — Дюжина Короля</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Prata&family=Roboto:ital,wght@0,400;0,500;0,700;1,400&family=Red+Hat+Display:ital,wght@0,900;1,900&display=swap" rel="stylesheet">
    <link rel="icon" href="images/icon.png" type="image/x-icon">
</head>
<body class="game-body">
<div class="game-container">

    <!-- Шапка -->
    <div class="game-header">
        <div class="game-info">
            <h1>Дюжина Короля</h1>
            <div id="round-info">Ожидание начала игры...</div>
        </div>
        <div class="header-actions">
            <a href="ko12_rules.pdf" target="_blank">правила игры</a>
            <button onclick="leaveGame()" class="btn-danger">Покинуть</button>
        </div>
    </div>

    <!-- Основное поле: игроки + центр -->
    <div class="game-board">
        <div id="players-area" class="players-area">
            <p class="loading">Загрузка игроков...</p>
        </div>

        <div class="center-area">
            <div id="dice-area" class="dice-area"></div>
            <div id="game-log" class="game-log">
                <h3>События игры</h3>
                <div id="log-messages"></div>
            </div>
        </div>
    </div>

    <!-- Карты — полная ширина внизу -->
    <div class="your-hand-section">
        <div class="hand-header">
            <h3>Ваши карты</h3>
            <span id="hand-status"></span>
        </div>
        <div id="your-hand" class="your-hand">
            <p class="loading">Загрузка карт...</p>
        </div>
    </div>

    <!-- Обратный отсчёт / статус лобби (виден всем) -->
    <div id="start-game-container" class="start-game-container" style="display:none;">
        <div id="lobby-status-content"></div>
    </div>

</div><!-- .game-container -->

<!-- Попап подтверждения выбора карты -->
<div id="card-confirm-popup" class="card-confirm-popup" style="display:none;">
    <div class="card-confirm-inner">
        <div class="card-confirm-header">
            <span id="card-confirm-icon" class="card-confirm-icon"></span>
            <span id="card-confirm-name" class="card-confirm-name"></span>
        </div>
        <div class="card-confirm-timer-track">
            <div id="card-confirm-fill" class="card-confirm-fill"></div>
        </div>
        <p class="card-confirm-hint">Автоподтверждение через <span id="card-confirm-sec">5</span> сек</p>
        <div class="card-confirm-actions">
            <button onclick="confirmCardSelection()" class="btn-card-confirm">✓ Сыграть</button>
            <button onclick="cancelCardSelection()" class="btn-card-cancel">✗ Отмена</button>
        </div>
    </div>
</div>

<!-- Модальное окно результатов -->
<div id="result-modal" class="modal" style="display:none;">
    <div class="modal-content">
        <h2 id="result-title"></h2>
        <div id="result-body"></div>
        <button onclick="closeResultModal()" class="btn-primary">В лобби</button>
    </div>
</div>

<!-- Модальное окно ЧАРОДЕЙ -->
<div id="wizard-modal" class="modal" style="display:none;">
    <div class="modal-content wizard-modal-content">
        <h2 id="wizard-modal-title"></h2>
        <div id="wizard-modal-body"></div>
    </div>
</div>

<script>
    const SESSION_ID = <?= $sessionId ?>;
    const PLAYER_ID  = <?= $playerId ?>;
    const IS_OWNER   = <?= $isOwner ? 'true' : 'false' ?>;
    const USER_LOGIN = '<?= htmlspecialchars($_SESSION['user_login']) ?>';
    let gameState    = null;
    let selectedCard = null;
    let pollInterval = null;
</script>
<script src="js/game.js"></script>
<script>startPolling();</script>
</body>
</html>
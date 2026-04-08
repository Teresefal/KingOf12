<?php

session_start();
require_once __DIR__ . '/../../../includes/db.php';

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['user_login'])) {
    echo json_encode(['success' => false, 'message' => 'Не авторизован']);
    exit;
}

$userLogin = $_SESSION['user_login'];

// ── GET ───────────────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action    = $_GET['action'] ?? '';
    $sessionId = (int)($_GET['session'] ?? 0);

    if ($sessionId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Неверный ID сессии']);
        exit;
    }

    if ($action === 'state') {
        try {
            echo json_encode(['success' => true, 'state' => getGameState($sessionId, $userLogin)]);
        } catch (Exception $e) {
            error_log("Get game state error: " . $e->getMessage());
            echo json_encode(['success' => false, 'message' => 'Ошибка загрузки состояния']);
        }
    } elseif ($action === 'log') {
        // Отдельный endpoint для лога — клиент может запрашивать независимо
        try {
            $log = callFunction('get_session_log', [$sessionId, 100]);
            echo json_encode(['success' => true, 'log' => $log]);
        } catch (Exception $e) {
            error_log("Get log error: " . $e->getMessage());
            echo json_encode(['success' => false, 'log' => []]);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Неверный action']);
    }
    exit;
}

// ── POST ──────────────────────────────────────────────────────────────────────
$input     = json_decode(file_get_contents('php://input'), true);
$action    = $input['action'] ?? '';
$sessionId = (int)($input['session_id'] ?? 0);

if ($sessionId <= 0) {
    echo json_encode(['success' => false, 'message' => 'Неверный ID сессии']);
    exit;
}

try {
    $player = Database::fetchOne(
        "SELECT id_player, is_owner FROM Players WHERE id_session = ? AND login = ?",
        [$sessionId, $userLogin]
    );
    if (!$player) {
        echo json_encode(['success' => false, 'message' => 'Вы не участник этой игры']);
        exit;
    }
    $playerId = $player['id_player'];
    $isOwner  = $player['is_owner'];
} catch (Exception $e) {
    error_log("Player check error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Ошибка проверки игрока']);
    exit;
}

switch ($action) {
    case 'start_game':    handleStartGame($sessionId, $isOwner);         break;
    case 'select_card':   handleSelectCard($input, $playerId, $sessionId); break;
    case 'wizard_choice': handleWizardChoice($input, $playerId, $sessionId); break;
    default:
        echo json_encode(['success' => false, 'message' => 'Неизвестное действие']);
}

// =============================================================================
// ФУНКЦИИ
// =============================================================================

function getGameState(int $sessionId, string $userLogin): array {
    $session = Database::fetchOne(
        "SELECT id_session, session_name, phase_length, status, max_players, current_round_number
         FROM Sessions WHERE id_session = ?",
        [$sessionId]
    );
    if (!$session) throw new Exception('Сессия не найдена');

    $players = Database::fetchAll(
        "SELECT p.id_player, p.login, u.name, p.seat_index, p.is_owner,
                p.round_victory_points, p.cards_under_dice
         FROM Players p
         LEFT JOIN Users u ON u.login = p.login
         WHERE p.id_session = ?
         ORDER BY p.seat_index",
        [$sessionId]
    );

    $currentRound = Database::fetchOne(
        "SELECT id_round, round_number, status
         FROM Rounds
         WHERE id_session = ? AND status = 'active'
         ORDER BY round_number DESC LIMIT 1",
        [$sessionId]
    );

    $currentPlay   = null;
    $diceRolls     = [];
    $selectedCards = [];
    $wizardChoices = [];

    if ($currentRound) {
        $currentPlay = Database::fetchOne(
            "SELECT id_play, play_number, status
             FROM Plays
             WHERE id_round = ?
               AND status IN ('card_selection', 'processing', 'awaiting_wizard')
             ORDER BY play_number DESC LIMIT 1",
            [$currentRound['id_round']]
        );

        if ($currentPlay) {
            $diceRolls = Database::fetchAll(
                "SELECT id_player, base_value, final_value, is_canceled
                 FROM Dice_Rolls WHERE id_play = ? ORDER BY id_player",
                [$currentPlay['id_play']]
            );

            $selectedCards = Database::fetchAll(
                "SELECT id_player, id_card, is_canceled
                 FROM Selected_Cards WHERE id_play = ?",
                [$currentPlay['id_play']]
            );

            $wizardChoices = Database::fetchAll(
                "SELECT ae.id_player, ae.effect_param AS chosen_face
                 FROM Applied_Effects ae
                 JOIN Cards c ON c.id_card = ae.id_card
                 WHERE ae.id_play = ? AND c.name = 'ЧАРОДЕЙ' AND ae.effect_param IS NOT NULL",
                [$currentPlay['id_play']]
            );
        }
    }

    // Карты текущего игрока
    $yourPlayer = null;
    foreach ($players as $p) {
        if ($p['login'] === $userLogin) { $yourPlayer = $p; break; }
    }

    $yourCards = [];
    if ($yourPlayer) {
        $yourCards = Database::fetchAll(
            "SELECT pc.id_card AS card_id, c.name AS card_name, c.description AS card_description,
                    pc.is_under_dice,
                    CASE
                        WHEN pc.is_under_dice = TRUE THEN FALSE
                        WHEN pc.discarded_in_round = ? THEN FALSE
                        ELSE TRUE
                    END AS is_available
             FROM Player_Cards pc
             JOIN Cards c ON c.id_card = pc.id_card
             WHERE pc.id_player = ?
             ORDER BY c.name",
            [$currentRound['id_round'] ?? null, $yourPlayer['id_player']]
        );
    }

    return [
        'session'        => $session,
        'players'        => $players,
        'current_round'  => $currentRound,
        'current_play'   => $currentPlay,
        'dice_rolls'     => $diceRolls,
        'selected_cards' => $selectedCards,
        'wizard_choices' => $wizardChoices,
        'your_cards'     => $yourCards,
    ];
}

function handleStartGame(int $sessionId, bool $isOwner): void {
    if (!$isOwner) {
        echo json_encode(['success' => false, 'message' => 'Только владелец может начать игру']);
        return;
    }
    $cnt = Database::fetchOne("SELECT COUNT(*) AS cnt FROM Players WHERE id_session = ?", [$sessionId]);
    if ((int)$cnt['cnt'] < 2) {
        echo json_encode(['success' => false, 'message' => 'Недостаточно игроков (минимум 2)']);
        return;
    }
    Database::execute("UPDATE Sessions SET status = 'active' WHERE id_session = ?", [$sessionId]);
    echo json_encode(['success' => true, 'message' => 'Игра началась']);
}

function handleSelectCard(array $input, int $playerId, int $sessionId): void {
    $cardId = (int)($input['card_id'] ?? 0);
    if ($cardId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Неверный ID карты']);
        return;
    }

    $currentPlay = Database::fetchOne(
        "SELECT p.id_play, p.id_round, p.status
         FROM Plays p
         JOIN Rounds r ON r.id_round = p.id_round
         WHERE r.id_session = ?
           AND r.status = 'active'
           AND p.status = 'card_selection'
         ORDER BY p.play_number DESC LIMIT 1",
        [$sessionId]
    );
    if (!$currentPlay) {
        echo json_encode(['success' => false, 'message' => 'Нет активного розыгрыша для выбора карт']);
        return;
    }
    $playId = $currentPlay['id_play'];

    if (Database::fetchOne(
        "SELECT 1 FROM Selected_Cards WHERE id_play = ? AND id_player = ?",
        [$playId, $playerId]
    )) {
        echo json_encode(['success' => false, 'message' => 'Вы уже выбрали карту']);
        return;
    }

    try {
        $result = callFunction('select_card', [$playerId, $cardId, $playId]);
        if (!$result || !$result[0]['select_card']) {
            echo json_encode(['success' => false, 'message' => 'Не удалось выбрать карту']);
            return;
        }
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        return;
    }

    echo json_encode(['success' => true, 'message' => 'Карта выбрана']);

    try {
        checkAndProcessPlay($playId, $sessionId);
    } catch (Exception $e) {
        error_log("process_play error (play={$playId}): " . $e->getMessage());
    }
}

function checkAndProcessPlay(int $playId, int $sessionId): void {
    $total    = Database::fetchOne("SELECT COUNT(*) AS cnt FROM Players WHERE id_session = ?", [$sessionId]);
    $selected = Database::fetchOne("SELECT COUNT(*) AS cnt FROM Selected_Cards WHERE id_play = ?", [$playId]);

    if ((int)$total['cnt'] === (int)$selected['cnt']) {
        callProcedure('process_play', [$playId]);
        error_log("process_play called for play {$playId}");
    }
}

function handleWizardChoice(array $input, int $playerId, int $sessionId): void {
    $playId     = (int)($input['play_id'] ?? 0);
    $chosenFace = (int)($input['chosen_face'] ?? 0);

    if ($playId <= 0 || $chosenFace < 1 || $chosenFace > 12) {
        echo json_encode(['success' => false, 'message' => 'Неверные параметры']);
        return;
    }

    $play = Database::fetchOne(
        "SELECT p.id_play, p.status FROM Plays p
         JOIN Rounds r ON r.id_round = p.id_round
         WHERE p.id_play = ? AND r.id_session = ?",
        [$playId, $sessionId]
    );
    if (!$play) {
        echo json_encode(['success' => false, 'message' => 'Розыгрыш не найден']);
        return;
    }
    if (!in_array($play['status'], ['awaiting_wizard', 'processing'], true)) {
        echo json_encode(['success' => false, 'message' => 'Розыгрыш не ожидает выбора грани']);
        return;
    }

    $selectedCard = Database::fetchOne(
        "SELECT sc.id_card, c.name FROM Selected_Cards sc
         JOIN Cards c ON c.id_card = sc.id_card
         WHERE sc.id_play = ? AND sc.id_player = ?",
        [$playId, $playerId]
    );
    if (!$selectedCard || $selectedCard['name'] !== 'ЧАРОДЕЙ') {
        echo json_encode(['success' => false, 'message' => 'Вы не выбрали ЧАРОДЕЙ']);
        return;
    }

    $already = Database::fetchOne(
        "SELECT ae.effect_param FROM Applied_Effects ae
         JOIN Cards c ON c.id_card = ae.id_card
         WHERE ae.id_play = ? AND ae.id_player = ? AND c.name = 'ЧАРОДЕЙ'",
        [$playId, $playerId]
    );
    if ($already && $already['effect_param'] !== null) {
        echo json_encode(['success' => false, 'message' => 'Вы уже выбрали грань']);
        return;
    }

    try {
        $result = callFunction('set_wizard_choice', [$playId, $playerId, $chosenFace]);
        if (!$result || !$result[0]['set_wizard_choice']) {
            echo json_encode(['success' => false, 'message' => 'Не удалось установить грань']);
            return;
        }

        // Все ЧАРОДЕЙ-игроки ответили?
        $pending = Database::fetchOne(
            "SELECT COUNT(*) AS cnt FROM Applied_Effects ae
             JOIN Cards c ON c.id_card = ae.id_card
             WHERE ae.id_play = ? AND c.name = 'ЧАРОДЕЙ' AND ae.effect_param IS NULL",
            [$playId]
        );
        if ((int)($pending['cnt'] ?? 1) === 0) {
            callProcedure('finish_process_play', [$playId]);
        }

        echo json_encode(['success' => true, 'message' => "Грань {$chosenFace} выбрана"]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}
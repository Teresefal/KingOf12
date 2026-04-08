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
    $action = $_GET['action'] ?? '';

    if ($action === 'list') {
        try {
            // Автоочистка брошенных лобби (нет игроков > 3 минут)
            try { callFunction('cleanup_abandoned_sessions', []); } catch (Exception $e) {}

            $sessions = callFunction('get_available_sessions', [$userLogin]);

            foreach ($sessions as &$s) {
                $inSession = Database::fetchOne(
                    "SELECT is_owner FROM Players WHERE login = ? AND id_session = ?",
                    [$userLogin, $s['session_id']]
                );
                $s['i_am_in']    = (bool)$inSession;
                $s['i_am_owner'] = $inSession ? (bool)$inSession['is_owner'] : false;
            }
            unset($s);

            echo json_encode(['success' => true, 'sessions' => $sessions]);
        } catch (Exception $e) {
            error_log("Get sessions error: " . $e->getMessage());
            echo json_encode(['success' => false, 'message' => 'Ошибка загрузки списка игр']);
        }
    }
    exit;
}

// ── POST ──────────────────────────────────────────────────────────────────────
$input  = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

if ($action === 'create') {
    $gameName   = trim($input['name'] ?? 'Новая игра');
    $maxPlayers = (int)($input['max_players'] ?? 3);

    if ($maxPlayers < 2 || $maxPlayers > 4) {
        echo json_encode(['success' => false, 'message' => 'Количество игроков: от 2 до 4']);
        exit;
    }
    try {
        $result = callFunction('create_game_session', [$userLogin, $gameName, 60, $maxPlayers]);
        if ($result && isset($result[0])) {
            echo json_encode(['success' => true, 'session_id' => $result[0]['create_game_session']]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Ошибка создания игры']);
        }
    } catch (Exception $e) {
        error_log("Create session error: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Ошибка создания игры']);
    }

} elseif ($action === 'join') {
    $sessionId = (int)($input['session_id'] ?? 0);
    if ($sessionId <= 0) { echo json_encode(['success'=>false,'message'=>'Неверный ID сессии']); exit; }

    try {
        $existing = Database::fetchOne(
            "SELECT id_player FROM Players WHERE login = ? AND id_session = ?",
            [$userLogin, $sessionId]
        );
        if ($existing) {
            echo json_encode(['success' => true, 'session_id' => $sessionId, 'rejoin' => true]);
            exit;
        }

        $canJoin = callFunction('can_join_session', [$userLogin, $sessionId]);
        if (!$canJoin || !$canJoin[0]['can_join_session']) {
            echo json_encode(['success' => false, 'message' => 'Невозможно присоединиться']);
            exit;
        }

        $owner = Database::fetchOne(
            "SELECT login FROM Players WHERE id_session = ? AND is_owner = TRUE", [$sessionId]
        );
        if (!$owner) throw new Exception('Владелец сессии не найден');

        callFunction('create_game_invite', [$owner['login'], $userLogin, $sessionId]);
        $result = callFunction('accept_game_invite', [$userLogin, $sessionId]);

        if ($result && $result[0]['accept_game_invite']) {
            echo json_encode(['success' => true, 'session_id' => $sessionId]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Не удалось присоединиться']);
        }
    } catch (Exception $e) {
        error_log("Join session error: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Ошибка присоединения']);
    }

} elseif ($action === 'leave') {
    $sessionId = (int)($input['session_id'] ?? 0);
    if ($sessionId <= 0) { echo json_encode(['success'=>false,'message'=>'Неверный ID сессии']); exit; }

    try {
        $result = callFunction('leave_session', [$userLogin, $sessionId]);
        $status = $result[0]['leave_session'] ?? 'error';

        if ($status === 'disbanded')     echo json_encode(['success'=>true,'disbanded'=>true, 'message'=>'Лобби закрыто']);
        elseif ($status === 'left')      echo json_encode(['success'=>true,'disbanded'=>false,'message'=>'Вы покинули лобби']);
        elseif ($status === 'in_game')   echo json_encode(['success'=>true,'disbanded'=>false,'message'=>'Игра уже идёт']);
        else                             echo json_encode(['success'=>false,'message'=>'Вы не в этой сессии']);
    } catch (Exception $e) {
        error_log("Leave session error: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Ошибка выхода']);
    }

} else {
    echo json_encode(['success' => false, 'message' => 'Неизвестное действие']);
}
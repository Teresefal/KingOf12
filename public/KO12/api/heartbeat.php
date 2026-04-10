<?php
// Клиент вызывает каждые 30 сек пока находится на странице игры/лобби.
// Обновляет last_seen для игрока и чистит неактивных.

session_start();
require_once __DIR__ . '/../../../includes/db.php';

header('Content-Type: application/json; charset=utf-8');
 
if (!isset($_SESSION['user_login'])) {
    echo json_encode(['success' => false]);
    exit;
}
 
$input     = json_decode(file_get_contents('php://input'), true);
$sessionId = (int)($input['session_id'] ?? 0);
$userLogin = $_SESSION['user_login'];
 
if ($sessionId <= 0) {
    echo json_encode(['success' => false]);
    exit;
}
 
try {
    // Обновляем last_seen напрямую (не через callFunction — нет возвращаемого значения)
    Database::execute(
        "UPDATE Players SET last_seen = CURRENT_TIMESTAMP WHERE login = ? AND id_session = ?",
        [$userLogin, $sessionId]
    );
 
    // Запускаем очистку через CALL (процедура, не функция — нет проблем с PDO)
    Database::callProcedure('cleanup_inactive_players', []);
 
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    error_log("Heartbeat error: " . $e->getMessage());
    // Не возвращаем ошибку клиенту — heartbeat некритичен
    echo json_encode(['success' => false]);
}
 
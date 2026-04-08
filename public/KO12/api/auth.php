<?php

session_start();
require_once __DIR__ . '/../../../includes/db.php';

header('Content-Type: application/json; charset=utf-8');

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

if ($action === 'register') {
    $username = trim($input['username'] ?? '');
    $name     = trim($input['name'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($username) || empty($name) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Все поля обязательны']);
        exit;
    }
    if (strlen($password) < 8) {
        echo json_encode(['success' => false, 'message' => 'Пароль должен содержать не менее 8 символов']);
        exit;
    }
    if (strlen($username) > 64 || strlen($name) > 32) {
        echo json_encode(['success' => false, 'message' => 'Логин или имя слишком длинные']);
        exit;
    }

    try {
        $passwordHash = hashPassword($password);
        $result = callFunction('register_user', [$username, $passwordHash, $name]);

        echo json_encode([
            'success' => (bool)($result[0]['success'] ?? false),
            'message' => $result[0]['message'] ?? 'Ошибка регистрации'
        ]);
    } catch (Exception $e) {
        error_log("Registration error: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Ошибка регистрации. Попробуйте позже.']);
    }

} elseif ($action === 'login') {
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($username) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Введите логин и пароль']);
        exit;
    }

    try {
        $result = callFunctionOne('get_user_for_login', [$username]);

        if ($result && verifyPassword($password, $result['password_hash'])) {
            $_SESSION['user_login'] = $result['user_login'];
            $_SESSION['user_name']  = $result['user_name'];

            try {
                callProcedure('update_last_login', [$username]);
            } catch (Exception $e) {
                // Не критично — логируем и продолжаем
                error_log("update_last_login failed: " . $e->getMessage());
            }

            echo json_encode([
                'success' => true,
                'message' => 'Вход выполнен',
                'user'    => ['login' => $result['user_login'], 'name' => $result['user_name']]
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Неверный логин или пароль']);
        }
    } catch (Exception $e) {
        error_log("Login error: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Ошибка входа. Попробуйте позже.']);
    }

} elseif ($action === 'logout') {
    session_destroy();
    echo json_encode(['success' => true]);

} else {
    echo json_encode(['success' => false, 'message' => 'Неизвестное действие']);
}
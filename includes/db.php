<?php

require_once __DIR__ . '/../src/lib/database.php';

/**
 * Вызов функции PostgreSQL, которая возвращает набор данных.
 */
function callFunction($functionName, $params = []) {
    $placeholders = array_fill(0, count($params), '?');
    $sql = "SELECT * FROM {$functionName}(" . implode(', ', $placeholders) . ")";
    return Database::fetchAll($sql, $params);
}

/**
 * Вызов функции PostgreSQL, которая возвращает одну строку.
 */
function callFunctionOne($functionName, $params = []) {
    $placeholders = array_fill(0, count($params), '?');
    $sql = "SELECT * FROM {$functionName}(" . implode(', ', $placeholders) . ")";
    return Database::fetchOne($sql, $params);
}

/**
 * Вызов процедуры PostgreSQL.
 */
function callProcedure($procedureName, $params = []) {
    return Database::callProcedure($procedureName, $params);
}

/**
 * Хеширование пароля с bcrypt.
 */
function hashPassword($password) {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

/**
 * Проверка пароля.
 */
function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}
?>
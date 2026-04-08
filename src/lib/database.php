<?php

/**
 * Класс для взаимодействия с базой данных PostgreSQL.
 * Использует PDO для подключения и выполнения запросов.
 */
class Database {
    private static ?PDO $pdo = null; // Статическое свойство для хранения объекта PDO (Singleton)

    /**
     * Получает соединение с базой данных (Singleton).
     * @return PDO Объект PDO для взаимодействия с БД.
     * @throws PDOException Если не удалось подключиться.
     */
    private static function getConnection(): PDO {
        if (self::$pdo === null) {

            $envPath = __DIR__ . '/.env';

            if (!file_exists($envPath)) {
                throw new Exception(".env file not found");
            }

            $env = parse_ini_file($envPath);

            $host = $env['DB_HOST'] ?? '';
            $port = $env['DB_PORT'] ?? '';
            $dbname = $env['DB_DATABASE'] ?? '';
            $user = $env['DB_USER'] ?? '';
            $password = $env['DB_PASSWORD'] ?? '';
            $schema = $env['DB_SCHEMA'] ?? 'public';

            $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            try {
                self::$pdo = new PDO($dsn, $user, $password, $options);
                self::$pdo->exec("SET search_path TO \"{$schema}\", public");
            } catch (PDOException $e) {
                throw new PDOException("Database connection failed: " . $e->getMessage());
            }
        }

        return self::$pdo;
    }

        /**
     * Вызывает хранимую процедуру PostgreSQL (которая не возвращает результат SELECT).
     *
     * @param string $procedureName Имя процедуры.
     * @param array $params Массив параметров для процедуры.
     * @return bool True в случае успеха.
     * @throws PDOException В случае ошибки выполнения.
     */
    public static function callProcedure(string $procedureName, array $params = []): bool {
        $pdo = self::getConnection();
        $placeholders = implode(', ', array_fill(0, count($params), '?'));
        $sql = "CALL {$procedureName}({$placeholders})";

        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return true;
        } catch (PDOException $e) {
            error_log("Error calling procedure {$procedureName}: " . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Выполняет SQL-запрос SELECT и возвращает все строки результата.
     *
     * @param string $sql SQL-запрос.
     * @param array $params Массив параметров.
     * @return array Массив ассоциативных массивов строк.
     */
    public static function fetchAll(string $sql, array $params = []): array {
        $pdo = self::getConnection();
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
        } catch (PDOException $e) {
            error_log("Error executing fetchAll query '{$sql}': " . $e->getMessage());
            throw $e;
        }
    }

     /**
     * Выполняет SQL-запрос SELECT и возвращает одну строку результата.
     *
     * @param string $sql SQL-запрос.
     * @param array $params Массив параметров.
     * @return array|false Ассоциативный массив строки или false, если ничего не найдено.
     */
    public static function fetchOne(string $sql, array $params = []) {
        $pdo = self::getConnection();
         try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetch();
        } catch (PDOException $e) {
            error_log("Error executing fetchOne query '{$sql}': " . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Выполняет запрос INSERT, UPDATE или DELETE.
     *
     * @param string $sql SQL-запрос.
     * @param array $params Массив параметров.
     * @return int Количество затронутых строк.
     */
    public static function execute(string $sql, array $params = []): int {
        $pdo = self::getConnection();
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->rowCount();
        } catch (PDOException $e) {
            error_log("Error executing execute query '{$sql}': " . $e->getMessage());
            throw $e;
        }
    }

     /**
     * Выполняет запрос INSERT и возвращает ID последней вставленной строки.
     *
     * @param string $sql SQL-запрос INSERT.
     * @param array $params Массив параметров.
     * @param string|null $sequenceName Имя последовательности.
     * @return string|false ID последней вставленной строки или false в случае ошибки.
     */
    public static function insert(string $sql, array $params = [], ?string $sequenceName = null) {
        $pdo = self::getConnection();
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $pdo->lastInsertId($sequenceName);
        } catch (PDOException $e) {
            error_log("Error executing insert query '{$sql}': " . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Начинает транзакцию.
     */
    public static function beginTransaction(): void {
        self::getConnection()->beginTransaction();
    }

    /**
     * Подтверждает транзакцию.
     */
    public static function commit(): void {
        // Предполагается, что $pdo хранится в статическом свойстве self::$pdo
        if (self::$pdo && self::$pdo->inTransaction()) {
            self::$pdo->commit();
        }
    }

    /**
     * Откатывает транзакцию.
     */
    public static function rollBack(): void {
        if (self::$pdo && self::$pdo->inTransaction()) {
            self::$pdo->rollBack();
        }
    }
}
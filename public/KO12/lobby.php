<?php
session_start();

if (!isset($_SESSION['user_login'])) {
    header('Location: index.php');
    exit;
}

$userName = $_SESSION['user_name'];
$userLogin = $_SESSION['user_login'];
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Лобби - Дюжина Короля</title>
    <link rel="stylesheet" href="css/style.css">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Prata&family=Roboto:wght@400;500;700&family=Red+Hat+Display:ital,wght@0,900;1,900&display=swap" rel="stylesheet">

    <link rel="icon" href="images/icon.png" type="image/x-icon">

</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Лобби</h1>
            <div>
                <a href="ko12_rules.pdf" target="_blank">правила игры</a>
                <button onclick="logout()">Выйти</button>
            </div>
        </div>
        
        <div class="lobby-content">
            <!-- Создание новой игры -->
            <div class="create-game">
                <h2>Создать новую игру</h2>
                <form onsubmit="createGame(event)">
                    <input type="text" id="game-name" placeholder="Название игры" required>
                    <select id="max-players">
                        <option value="2">2 игрока</option>
                        <option value="3" selected>3 игрока</option>
                        <option value="4">4 игрока</option>
                    </select>
                    <button type="submit">Создать</button>
                </form>
            </div>
            
            <!-- Список доступных игр -->
            <div class="games-list">
                <h2>Доступные игры</h2>
                <div id="sessions-container">
                    <p>Загрузка...</p>
                </div>
            </div>
        </div>
    </div>

    <script src="js/lobby.js"></script>
    <script>
        // Загружаем список игр при открытии страницы
        loadSessions();
        
        // Обновляем каждые 3 секунды
        setInterval(loadSessions, 3000);
    </script>
</body>
</html>
<?php
session_start();

// Если уже залогинен - редирект в лобби
if (isset($_SESSION['user_login'])) {
    header('Location: lobby.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Дюжина Короля</title>
    <link rel="stylesheet" href="css/style.css">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Prata&family=Roboto:wght@400;500;700&family=Red+Hat+Display:ital,wght@0,900;1,900&display=swap" rel="stylesheet">

    <link rel="icon" href="images/icon.png" type="image/x-icon">

</head>
<body>
    <div class="container">
        <img src="images/ko12.png" alt="Дюжина Короля" style="display: block; margin: 0 auto; width: 256px;">
        
        <div class="form-container">
            <!-- Вкладки -->
            <div class="tabs">
                <button class="tab active" onclick="showTab('login')">Вход</button>
                <button class="tab" onclick="showTab('register')">Регистрация</button>
            </div>
            
            <!-- Форма входа -->
            <div id="login-form">
                <h2 style="text-align: center;">Вход</h2>
                <form onsubmit="login(event)">
                    <input type="text" id="login-username" placeholder="Логин" required>
                    <input type="password" id="login-password" placeholder="Пароль" required>
                    <button type="submit">Войти</button>
                </form>
                <div id="login-error" class="error"></div>
            </div>
            
            <!-- Форма регистрации -->
            <div id="register-form" style="display: none;">
                <h2 style="text-align: center;">Регистрация</h2>
                <form onsubmit="register(event)">
                    <input type="text" id="reg-username" placeholder="Логин" required>
                    <input type="text" id="reg-name" placeholder="Имя" required>
                    <input type="password" id="reg-password" placeholder="Пароль (мин. 8 символов)" required>
                    <button type="submit">Зарегистрироваться</button>
                </form>
                <div id="register-error" class="error"></div>
            </div>
        </div>

        <div class="rules-container" style="max-width: 400px; margin: 20px auto; text-align: center;">
            <a href="ko12_rules.pdf" target="_blank">правила игры</a>
        </div>

        </div>
    </div>

    <script>
        function showTab(tab) {
            if (tab === 'login') {
                document.getElementById('login-form').style.display = 'block';
                document.getElementById('register-form').style.display = 'none';
            } else {
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('register-form').style.display = 'block';
            }
        }
        
        async function login(event) {
            event.preventDefault();
            
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            
            try {
                const response = await fetch('api/auth.php', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'login',
                        username: username,
                        password: password
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    window.location.href = 'lobby.php';
                } else {
                    document.getElementById('login-error').textContent = data.message;
                }
            } catch (error) {
                document.getElementById('login-error').textContent = 'Ошибка соединения';
            }
        }
        
        async function register(event) {
            event.preventDefault();
            
            const username = document.getElementById('reg-username').value;
            const name = document.getElementById('reg-name').value;
            const password = document.getElementById('reg-password').value;
            
            try {
                const response = await fetch('api/auth.php', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'register',
                        username: username,
                        name: name,
                        password: password
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert('Регистрация успешна! Теперь войдите.');
                    showTab('login');
                } else {
                    document.getElementById('register-error').textContent = data.message;
                }
            } catch (error) {
                document.getElementById('register-error').textContent = 'Ошибка соединения';
            }
        }
    </script>
</body>
</html>
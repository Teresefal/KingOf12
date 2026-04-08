# Документация Дюжина Короля

## Структура проекта:<br>

├ src/lib/database.php<br>
├ includes/<br>
│ └ db.php           # Подключение к БД<br>
│ ├ .env             # Данные для подключения<br>
├ public/<br>
│ ├ index.php        # Главная страница (вход/регистрация)<br>
│ ├ lobby.php        # Лобби (список игр)<br>
│ ├ game.php         # Игровая комната<br>
│ ├ css/<br>
│ │ └ style.css<br>
│ ├ api/<br>
│ │ ├ .htaccess      # для предотвращения нежеланного просмотра файлов<br>
│ │ ├ auth.php       # Регистрация/вход<br>
│ │ ├ sessions.php   # Создание/получение сессий<br>
│ │ └ game.php       # Игровая логика<br>
│ │ ├ js/<br>
│ │ │ ├ lobby.js<br>
│ │ │ └ game.js<br>
│ │ └ images/<br>
│ │ │ ├ cards/       # Изображения карт<br>


---


# API
**Base URL:** `https://trsfl.ru/KO12`  
**Content-Type:** `application/json` (все запросы и ответы)  
**Авторизация:** сессионные cookie (PHP session). Все эндпоинты кроме `auth` требуют активной сессии.

---

## Общий формат ответа

Все ответы возвращают JSON-объект. Поле `success` всегда присутствует:

```json
{ "success": true, ... }
{ "success": false, "message": "Описание ошибки" }
```

---

## 1. Аутентификация

### `POST /api/auth.php`

#### 1.1 Регистрация

**Запрос:**
```json
{
  "action": "register",
  "username": "ivan",
  "name": "Иван",
  "password": "securepass123"
}
```

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `username` | string | макс. 64 символа, уникальный |
| `name` | string | макс. 32 символа |
| `password` | string | мин. 8 символов |

**Успешный ответ:**
```json
{
  "success": true,
  "message": "Пользователь успешно зарегистрирован"
}
```

**Ошибки:**
```json
{ "success": false, "message": "Все поля обязательны" }
{ "success": false, "message": "Пароль должен содержать не менее 8 символов" }
{ "success": false, "message": "Логин или имя слишком длинные" }
```

---

#### 1.2 Вход

**Запрос:**
```json
{
  "action": "login",
  "username": "ivan",
  "password": "securepass123"
}
```

**Успешный ответ** (устанавливает session cookie):
```json
{
  "success": true,
  "message": "Вход выполнен",
  "user": {
    "login": "ivan",
    "name": "Иван"
  }
}
```

**Ошибки:**
```json
{ "success": false, "message": "Введите логин и пароль" }
{ "success": false, "message": "Неверный логин или пароль" }
```

---

#### 1.3 Выход

**Запрос:**
```json
{ "action": "logout" }
```

**Ответ:**
```json
{ "success": true }
```

---

## 2. Сессии (лобби)

### `GET /api/sessions.php?action=list`

Возвращает список доступных игровых сессий.

**Ответ:**
```json
{
  "success": true,
  "sessions": [
    {
      "session_id": 123,
      "session_name": "Битва Титанов",
      "max_players": 4,
      "status": "waiting",
      "i_am_in": true,
      "i_am_owner": false
    }
  ]
}
```

| Поле | Описание |
|------|----------|
| `status` | Текущий статус лобби (например, `waiting`) |
| `i_am_in` | true если текущий пользователь уже в этой сессии |
| `i_am_owner` | true если текущий пользователь — владелец |

---

### `POST /api/sessions.php` — Создать сессию

**Запрос:**
```json
{
  "action": "create",
  "name": "Эпичная Игра",
  "max_players": 4
}
```

| Поле | Тип | Допустимые значения |
|------|-----|---------------------|
| `name` | string | любое название (по умолчанию "Новая игра") |
| `max_players` | int | от 2 до 4 (по умолчанию 3) |

**Ответ:**
```json
{
  "success": true,
  "session_id": 124
}
```

---

### `POST /api/sessions.php` — Присоединиться

**Запрос:**
```json
{
  "action": "join",
  "session_id": 123
}
```

**Ответ:**
```json
{
  "success": true,
  "session_id": 123,
  "rejoin": false
}
```

---

### `POST /api/sessions.php` — Покинуть лобби

**Запрос:**
```json
{
  "action": "leave",
  "session_id": 123
}
```

**Ответ:**
```json
{ "success": true, "disbanded": true,  "message": "Лобби закрыто" }
{ "success": true, "disbanded": false, "message": "Вы покинули лобби" }
{ "success": true, "disbanded": false, "message": "Игра уже идёт" }
```

---

## 3. Игровой процесс

### `GET /api/game.php?action=state&session={id}`

Возвращает полное состояние игры.

**Ответ:**
```json
{
  "success": true,
  "state": {
    "session": { "id_session": 123, "status": "active", ... },
    "players": [ { "id_player": 1, "login": "player1", ... } ],
    "current_round": { "id_round": 10, "round_number": 1, ... },
    "current_play": { "id_play": 50, "status": "card_selection", ... },
    "dice_rolls": [ { "id_player": 1, "final_value": 5, ... } ],
    "selected_cards": [ { "id_player": 1, "id_card": 7, ... } ],
    "wizard_choices": [ { "id_player": 1, "chosen_face": 6 } ],
    "your_cards": [ { "card_id": 5, "card_name": "Рыцарь", "is_available": true, ... } ]
  }
}
```

---

### `GET /api/game.php?action=log&session={id}`

Возвращает хронологический лог событий игры.

**Ответ:**
```json
{
  "success": true,
  "log": [
    "Игрок Иван выбрал карту Рыцарь",
    "..."
  ]
}
```

---

### `POST /api/game.php` — Начать игру

Только владелец сессии.

**Запрос:**
```json
{
  "action": "start_game",
  "session_id": 123
}
```

**Ответ:**
```json
{ "success": true, "message": "Игра началась" }
```

**Ошибки:**
```json
{ "success": false, "message": "Недостаточно игроков (минимум 2)" }
```

---

### `POST /api/game.php` — Выбрать карту

**Запрос:**
```json
{
  "action": "select_card",
  "session_id": 123,
  "card_id": 7
}
```

**Ответ:**
```json
{ "success": true, "message": "Карта выбрана" }
```

---

### `POST /api/game.php` — Выбор грани (карта ЧАРОДЕЙ)

**Запрос:**
```json
{
  "action": "wizard_choice",
  "session_id": 123,
  "play_id": 50,
  "chosen_face": 6
}
```

| Поле | Описание |
|------|----------|
| `play_id` | ID текущего розыгрыша |
| `chosen_face` | Выбранная грань (1–12) |

**Ответ:**
```json
{ "success": true, "message": "Грань 6 выбрана" }
```

---

## 4. Типовой сценарий взаимодействия

```
1. POST /api/auth.php           { action: "login", ... }
2. GET  /api/sessions.php?action=list
3. POST /api/sessions.php       { action: "create", name: "...", max_players: 4 }
   -- другие игроки:
4. POST /api/sessions.php       { action: "join", session_id: 123 }
   -- владелец:
5. POST /api/game.php           { action: "start_game", session_id: 123 }
   -- игровой цикл (polling):
6. GET  /api/game.php?action=state&session=123
7. POST /api/game.php           { action: "select_card", session_id: 123, card_id: 7 }
   -- если выпал ЧАРОДЕЙ:
8. POST /api/game.php           { action: "wizard_choice", ..., chosen_face: 6 }
   -- лог:
9. GET  /api/game.php?action=log&session=123
```

---

*Стек: PHP-сессии (cookie `PHPSESSID`), формат JSON.*

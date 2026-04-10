# Дюжина Короля — KO12

Веб-реализация настольной игры **«Дюжина Короля»** (King of 12). Игроки бросают 12-гранный кубик и разыгрывают карты с уникальными эффектами, чтобы выиграть раунды и занять трон.

**Стек:** PHP 8 · PostgreSQL 13 · Vanilla JS · CSS3

---

## Структура проекта

```
├── src/lib/database.php       # PDO-обёртка (Singleton)
├── includes/
│   ├── db.php                 # Вспомогательные функции (callFunction, callProcedure и др.)
│   └── .env                   # Параметры подключения к БД (не в репозитории)
└── public/KO12/
    ├── index.php              # Главная страница (вход / регистрация)
    ├── lobby.php              # Лобби (список игр)
    ├── game.php               # Игровая комната
    ├── css/style.css
    ├── js/
    │   ├── game.js
    │   └── lobby.js
    ├── images/cards/          # PNG-изображения карт
    └── api/
        ├── auth.php           # Регистрация / вход / выход
        ├── sessions.php       # Создание и управление сессиями
        ├── game.php           # Игровая логика
        └── heartbeat.php      # Поддержание присутствия игрока
```

---

## Игровой процесс

### Лобби

- После **регистрации** пользователь автоматически авторизуется и попадает в лобби.
- Хост создаёт комнату (2–4 игрока), остальные присоединяются.
- Как только наберётся **минимум 2 игрока**, запускается **обратный отсчёт 30 секунд** (синхронизируется по серверному времени — `lobby_ready_at` в БД).
- Хост видит кнопку **«Начать сейчас»** и может запустить игру досрочно.
- Неактивные игроки удаляются через 90 секунд (heartbeat каждые 30 сек).

### Раунд

Каждый раунд состоит из нескольких **розыгрышей**:

1. Каждый игрок выбирает карту из руки (попап с таймером 5 сек).
2. Карты с дубликатами отменяются.
3. Применяются эффекты карт в порядке приоритета.
4. Сравниваются финальные значения кубиков; совпадающие значения отменяются.
5. Победитель розыгрыша получает очко; использованные карты уходят в сброс.
6. Раунд завершается, когда у кого-то ≥ 8 очков или у кого-то осталась 1 карта.
7. Победитель раунда кладёт одну карту под кубик. При ничьей очки сбрасываются.

**Победа в игре** — первый игрок с **2 картами под кубиком**.

### Карты

| Карта | Эффект |
|---|---|
| АЛХИМИК | Значение кубика × 2 |
| РОБОТ | Значение кубика + 7 |
| ПАРАЗИТ | Значение кубика − 7 |
| ОБОРОТЕНЬ | Переворачивает кубик на противоположную грань (сумма = 13) |
| ГОЛЕМ | Кубик = 12; если после всех эффектов = 12, то = 1 |
| ЧАРОДЕЙ | Переворачивает кубик на одну из прилегающих граней (выбор игрока) |
| ОРАКУЛ | Перебрасывает кубик (срабатывает последним) |
| ТОРГОВЦЫ | Все передают кубики по кругу влево (применяется первым) |
| СМУТЬЯНЫ | Все переворачивают кубики на противоположную грань |
| РЫЦАРЬ | Минимальное значение побеждает |
| ШУЛЕР | Победитель +1 очко, второе место +2 очка |
| ЛЕДИ | Отменяет эффекты всех остальных карт; при отмене самой ЛЕДИ — кража очков |

---

## API

**Base URL:** `https://trsfl.ru/KO12`
**Content-Type:** `application/json`
**Авторизация:** сессионные cookie (`PHPSESSID`). Все эндпоинты кроме `auth` требуют активной сессии.

Все ответы содержат поле `"success": true | false`. При ошибке добавляется `"message"`.

---

### Аутентификация — `POST /api/auth.php`

#### Регистрация

```json
// Запрос
{ "action": "register", "username": "ivan", "name": "Иван", "password": "secret123" }

// Ответ — сессия устанавливается автоматически, клиент перенаправляется в лобби
{ "success": true, "message": "Регистрация успешна", "redirect": "lobby.php" }
```

#### Вход

```json
// Запрос
{ "action": "login", "username": "ivan", "password": "secret123" }

// Ответ
{ "success": true, "message": "Вход выполнен", "user": { "login": "ivan", "name": "Иван" } }
```

#### Выход

```json
{ "action": "logout" }
// → { "success": true }
```

---

### Сессии — `/api/sessions.php`

#### Список игр `GET ?action=list`

```json
{
  "success": true,
  "sessions": [
    {
      "session_id": 123,
      "session_name": "Битва Титанов",
      "current_players": 2,
      "max_players": 4,
      "status": "waiting",
      "i_am_in": true,
      "i_am_owner": false
    }
  ]
}
```

#### Создать `POST`

```json
{ "action": "create", "name": "Эпичная Игра", "max_players": 4 }
// → { "success": true, "session_id": 124 }
```

`max_players` — от 2 до 4.

#### Присоединиться `POST`

```json
{ "action": "join", "session_id": 123 }
// → { "success": true, "session_id": 123, "rejoin": false }
```

#### Покинуть `POST`

```json
{ "action": "leave", "session_id": 123 }
// → { "success": true, "disbanded": true,  "message": "Лобби закрыто" }   // хост ушёл
// → { "success": true, "disbanded": false, "message": "Вы покинули лобби" }
// → { "success": true, "disbanded": false, "message": "Игра уже идёт" }
```

---

### Игра — `/api/game.php`

#### Состояние `GET ?action=state&session={id}`

```json
{
  "success": true,
  "state": {
    "session": {
      "id_session": 123,
      "status": "active",
      "max_players": 3,
      "lobby_countdown_sec": 17
    },
    "players": [
      {
        "id_player": 1,
        "login": "ivan",
        "name": "Иван",
        "round_victory_points": 3,
        "cards_under_dice": 1,
        "is_owner": true
      }
    ],
    "current_round":  { "id_round": 10, "round_number": 2, "status": "active" },
    "current_play":   { "id_play": 50, "play_number": 3, "status": "card_selection" },
    "dice_rolls":     [ { "id_player": 1, "base_value": 7, "final_value": 14, "is_canceled": false } ],
    "selected_cards": [ { "id_player": 1, "id_card": 5, "is_canceled": false } ],
    "wizard_choices": [ { "id_player": 1, "chosen_face": 6 } ],
    "your_cards": [
      { "card_id": 5, "card_name": "АЛХИМИК", "card_description": "...", "is_available": true }
    ]
  }
}
```

`lobby_countdown_sec` — оставшееся время отсчёта в секундах (вычисляется на сервере), `null` если игроков меньше 2.

Статусы `current_play.status`:

| Значение | Описание |
|---|---|
| `card_selection` | Игроки выбирают карты |
| `processing` | Сервер обрабатывает розыгрыш |
| `awaiting_wizard` | Ожидание выбора грани от игрока с ЧАРОДЕЙ |

#### Лог `GET ?action=log&session={id}`

```json
{
  "success": true,
  "log": [
    { "log_time": "2025-01-01 12:00:05", "event_msg": "🎲 Иван бросил 9" },
    { "log_time": "2025-01-01 12:00:06", "event_msg": "🃏 Иван сыграл АЛХИМИК" }
  ]
}
```

#### Начать игру `POST`

Только для владельца сессии.

```json
{ "action": "start_game", "session_id": 123 }
// → { "success": true,  "message": "Игра началась" }
// → { "success": false, "message": "Недостаточно игроков (минимум 2)" }
```

#### Выбрать карту `POST`

```json
{ "action": "select_card", "session_id": 123, "card_id": 7 }
// → { "success": true, "message": "Карта выбрана" }
```

Как только все игроки выбрали карты, сервер автоматически запускает `process_play`.

#### Выбор грани ЧАРОДЕЙ `POST`

Требуется когда `current_play.status = "awaiting_wizard"` и текущий игрок сыграл ЧАРОДЕЙ.

```json
{ "action": "wizard_choice", "session_id": 123, "play_id": 50, "chosen_face": 6 }
// → { "success": true, "message": "Грань 6 выбрана" }
```

`chosen_face` должна быть одной из пяти граней, прилегающих к текущей верхней грани кубика. Клиентская функция `getAdjacentFacesD12(face)` возвращает допустимые значения.

#### Heartbeat `POST /api/heartbeat.php`

Клиент отправляет каждые 30 секунд. Обновляет `last_seen` игрока.

```json
{ "session_id": 123 }
// → { "success": true }
```

При отсутствии более 90 секунд игрок удаляется из лобби; если пропал хост — сессия удаляется целиком.

---

### Типовой сценарий

```
POST /api/auth.php          { action: "register", ... }   # авто-вход после регистрации
GET  /api/sessions.php?action=list
POST /api/sessions.php      { action: "create", name: "...", max_players: 3 }

# другие игроки:
POST /api/sessions.php      { action: "join", session_id: 123 }

# lobby_countdown_sec отсчитывает → 0, хост запускает старт (или авто):
POST /api/game.php          { action: "start_game", session_id: 123 }

# игровой цикл (polling каждые 2 сек):
GET  /api/game.php?action=state&session=123
POST /api/game.php          { action: "select_card", session_id: 123, card_id: 7 }

# если выпал ЧАРОДЕЙ:
POST /api/game.php          { action: "wizard_choice", play_id: 50, chosen_face: 6 }

# лог (polling каждые 4 сек):
GET  /api/game.php?action=log&session=123
```

---

## Технические детали

### Синхронизация таймера лобби

`Sessions.lobby_ready_at` устанавливается в БД в момент, когда число игроков достигает 2 (`COALESCE(lobby_ready_at, NOW())` — не перезаписывается при повторных join, не сбрасывается при перезагрузке страниц). Оставшееся время считается целиком в PostgreSQL:

```sql
GREATEST(0, 30 - EXTRACT(EPOCH FROM (NOW() - lobby_ready_at))::INT)
```

Это исключает проблемы с timezone (`TIMESTAMP WITHOUT TIME ZONE`): оба операнда в одном контексте сервера БД. Клиент получает готовое число секунд и интерполирует его через `requestAnimationFrame` между poll-ами для плавной анимации полоски.

### Heartbeat и очистка зависших сессий

`GET /api/sessions.php?action=list` перед выдачей списка вызывает `cleanup_inactive_players()` (удаляет игроков с `last_seen > 90 сек`) и `cleanup_abandoned_sessions()` (удаляет пустые waiting-сессии старше 3 минут). Это гарантирует очистку зависших лобби от закрытых вкладок при следующем заходе любого пользователя.

### Обработка карты ЧАРОДЕЙ

При сыгранном ЧАРОДЕЕ `process_play` переводит розыгрыш в статус `awaiting_wizard` и возвращает управление клиенту. Клиент обнаруживает статус при следующем poll и показывает модальное окно с выбором прилегающей грани. После ответа всех ЧАРОДЕЙ-игроков PHP вызывает `finish_process_play`.

### Попап выбора карты

Координаты карты снимаются через `getBoundingClientRect()` **до** вызова `updateYourHand()`, который перерисовывает DOM и уничтожает исходный элемент. Попап позиционируется через `left = центр карты` + `transform: translateX(-50%)` — без необходимости измерять ширину самого попапа. На мобильных (≤ 640px) попап фиксируется внизу экрана.

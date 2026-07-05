# tosu-gui

Десктопное приложение для [tosu](https://github.com/tosuapp/tosu) — memory reader для osu! с внутриигровым оверлеем.

Единое окно: tosu запускается в фоне, настройки и мониторинг — в GUI. Без терминала.

## Возможности

- Управление tosu из графического интерфейса
- Настройка внутриигрового оверлея (вкл/выкл, горячие клавиши)
- Установка и настройка PP-счётчиков
- Мониторинг статуса osu! в реальном времени
- Обновление tosu из приложения

## Установка

1. Скачайте последний релиз из [Releases](https://github.com/absolute2007/tosu-gui/releases/latest)
2. Запустите установщик `tosu GUI Setup *.exe` или распакуйте portable-архив
3. Запустите **tosu GUI**

Требования: Windows 10/11, osu! Stable или Lazer.

## Разработка

```bash
npm install
npm run start
```

С hot-reload:

```bash
npm run dev
```

Сборка установщика:

```bash
npm run build
```

Готовые файлы появятся в `release/`. Бинарник tosu скачивается автоматически при `npm install`.

## Лицензия

GPL-3.0 (tosu — LGPL-3.0)
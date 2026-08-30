# Askona — остатки Обухово

Версия **1.0.11**  
Автор: **Ярослав Федоренко**  
Год: **2026**

Статический сайт свободных остатков МОЛ «Обухово».

## Локально

```bat
python -m http.server 8080 -d docs
```

[http://localhost:8080](http://localhost:8080)

Не открывать через `file://`.

## GitHub Pages

https://erosya363-del.github.io/askona-stock-site/

Репозиторий: https://github.com/erosya363-del/askona-stock-site

Публикуются только `docs/data/stock.json` и `docs/data/sale.json` (агент, `site_publish.py`). HTML/CSS/JS меняются отдельно.

## Данные

- `docs/data/stock.json` — остатки qty > 0
- `docs/data/sale.json` — распродажа, exact match по названию; qty всегда из stock

## Версия

Формат: `major.minor.patch` (сейчас **1.0.11**).

При каждой новой функции поднимать версию сразу в трёх местах:

1. `SITE.version` в `docs/assets/app.js`
2. подпись `v…` в `docs/index.html` (`#siteCredit`)
3. этот README

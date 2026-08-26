# Askona — остатки Обухово

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

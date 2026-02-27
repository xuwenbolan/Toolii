# Toolii Backend

## 本地开发

```bash
cd backend
uv sync --extra dev --extra processing
uv run uvicorn app.main:app --reload --port 8000
```

## 数据库迁移

```bash
cd backend
uv run alembic revision --autogenerate -m "init"
uv run alembic upgrade head
```

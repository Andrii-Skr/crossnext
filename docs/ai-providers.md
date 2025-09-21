AI Providers (generation)

Common env
- `AI_PROVIDER` — `openai` | `anthropic` | `gemini`
- `AI_MODEL` — общее имя модели (можно переопределить провайдер-специфичным)
- `AI_REQUIRE_API_KEY` — `true|false` (по умолчанию true). Для локальных прокси можно выключить
- `AI_EXTRA_HEADERS` — JSON с доп. заголовками

OpenAI‑совместимые
- Ключ: `AI_API_KEY` или `OPENAI_API_KEY`
- База/путь: `AI_BASE_URL` (или `OPENAI_BASE_URL`), `AI_PATH` (по умолчанию `/v1/chat/completions`)
- Заголовок/схема авторизации: `AI_AUTH_HEADER` (по умолчанию `Authorization`), `AI_AUTH_SCHEME` (по умолчанию `Bearer`)

Anthropic (Claude)
- `AI_PROVIDER=anthropic`
- `ANTHROPIC_API_KEY`, опционально `ANTHROPIC_MODEL`, `ANTHROPIC_VERSION` (по умолчанию `2023-06-01`)

Google Gemini
- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY`, опционально `GEMINI_MODEL`, `GEMINI_BASE_URL` (по умолчанию `https://generativelanguage.googleapis.com`)
- Путь: `GEMINI_PATH` (по умолчанию `/v1beta/models/<model>:generateContent`)
- Если вместо `?key=` нужен заголовок — `GEMINI_AUTH_HEADER`

Примеры `.env.local`

OpenAI
```
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-...
# AI_BASE_URL=https://api.openai.com
# AI_PATH=/v1/chat/completions
```

Anthropic
```
AI_PROVIDER=anthropic
AI_MODEL=claude-3-5-sonnet-20240620
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_VERSION=2023-06-01
```

Gemini
```
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-1.5-flash
GEMINI_API_KEY=AIza...
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com
# GEMINI_PATH=/v1beta/models/gemini-1.5-flash:generateContent
```

Безопасность
- Не коммитить реальные ключи. Используйте `.env.local`
- Для CI/Prod — секреты через настройки окружения (Docker/Compose/Cloud)


AI Providers (generation)

Common env
- `AI_PROVIDER` — `nvidia` | `openai` | `anthropic` | `gemini` (по умолчанию `nvidia`)
- `AI_MODEL` — общее имя модели (можно переопределить провайдер-специфичным)
- `AI_REQUIRE_API_KEY` — `true|false` (по умолчанию true). Для локальных прокси можно выключить
- `AI_EXTRA_HEADERS` — JSON с доп. заголовками

NVIDIA NIM
- `AI_PROVIDER=nvidia`
- `NVIDIA_API_KEY`, опционально `NVIDIA_MODEL` (по умолчанию `google/gemma-3n-e4b-it`)
- `NVIDIA_BASE_URL` (по умолчанию `https://integrate.api.nvidia.com`)
- Путь: `NVIDIA_PATH` (по умолчанию `/v1/chat/completions`)
- Авторизация (опционально): `NVIDIA_AUTH_HEADER` (по умолчанию `Authorization`), `NVIDIA_AUTH_SCHEME` (по умолчанию `Bearer`)
- Параметры генерации (опционально):
  - `NVIDIA_TEMPERATURE` (по умолчанию `0.2`)
  - `NVIDIA_TOP_P` (по умолчанию `0.7`)
  - `NVIDIA_FREQUENCY_PENALTY` (по умолчанию `0`)
  - `NVIDIA_PRESENCE_PENALTY` (по умолчанию `0`)

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
- Путь: `GEMINI_PATH` (по умолчанию `/v1beta/models/<model>:generateContent`). Можно использовать плейсхолдер `<model>` — он будет заменён на имя модели.
- Если вместо `?key=` нужен заголовок — `GEMINI_AUTH_HEADER`

Примеры `.env.local`

NVIDIA (default)
```
AI_PROVIDER=nvidia
NVIDIA_MODEL=google/gemma-3n-e4b-it
NVIDIA_API_KEY=nvapi-...
# NVIDIA_BASE_URL=https://integrate.api.nvidia.com
# NVIDIA_PATH=/v1/chat/completions
```

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

Подсказки по Gemini 2.x/2.5
- Некоторые новые модели могут требовать другой версионированный путь (например, `v1` вместо `v1beta`). В этом случае укажите `GEMINI_PATH`, используя плейсхолдер `<model>`:
  - `GEMINI_PATH=/v1/models/<model>:generateContent`
- Авторизацию можно передавать заголовком в стиле документации Google:
  - `GEMINI_AUTH_HEADER=x-goog-api-key`
- Чтобы убедиться, что имя модели верное для вашего ключа/проекта, получите список доступных моделей:
  - `curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY" | jq -r '.models[].name'`
  - При заголовке: `curl -s -H "x-goog-api-key: YOUR_API_KEY" https://generativelanguage.googleapis.com/v1beta/models | jq -r '.models[].name'`


Безопасность
- Не коммитить реальные ключи. Используйте `.env.local`
- Для CI/Prod — секреты через настройки окружения (Docker/Compose/Cloud)

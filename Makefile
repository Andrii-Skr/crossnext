# Makefile
SHELL := /bin/bash
COMPOSE := docker compose
PROFILE ?= dev
APP_SERVICE := $(if $(filter $(PROFILE),prod),app,app-dev)
DB_SERVICE  := $(if $(filter $(PROFILE),prod),db,db-dev)

.PHONY: help build up down logs sh psql migrate generate seed prod clean

help:
	@echo "PROFILE=$(PROFILE) (dev|prod)"
	@echo "Targets: build, up, down, logs, sh, psql, migrate, generate, seed, prod, clean"

build:
	$(COMPOSE) --profile $(PROFILE) build

up:
	$(COMPOSE) --profile $(PROFILE) up -d

down:
	$(COMPOSE) --profile $(PROFILE) down -v

logs:
	$(COMPOSE) --profile $(PROFILE) logs -f $(APP_SERVICE)

sh:
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'command -v bash >/dev/null && exec bash || exec sh'

psql:
	$(COMPOSE) --profile $(PROFILE) exec $(DB_SERVICE) sh -lc 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

# dev: prisma migrate dev (через pnpm), prod: prisma migrate deploy (без pnpm)
migrate:
ifneq ($(PROFILE),prod)
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'pnpm prisma migrate dev'
else
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'prisma migrate deploy'
endif

generate:
ifneq ($(PROFILE),prod)
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'pnpm prisma generate'
else
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'prisma generate'
endif

seed:
ifneq ($(PROFILE),prod)
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'pnpm run prisma:seed || pnpm run seed || true'
else
	$(COMPOSE) --profile $(PROFILE) exec $(APP_SERVICE) sh -lc 'prisma db seed || true'
endif

prod:
	$(MAKE) PROFILE=prod up

clean:
	-docker image prune -f
	-docker volume prune -f

# ---- MySQL local (optional) ----
COMPOSE ?= docker compose
PROFILE ?= mysql

# имена контейнеров из compose-патча
MYSQL_CONT ?= crossnext-mysql-dev
PMA_CONT   ?= crossnext-pma-dev

# параметры импорта
MYSQL_ROOT ?= root
MYSQL_DB   ?= legacydb
DUMP       ?= zenit_mysql.sql

.PHONY: mysql-up mysql-down mysql-restart mysql-wait mysql-import mysql-cli mysql-logs pma-open

## Поднять MySQL (+phpMyAdmin) из профиля `mysql`
mysql-up:
	$(COMPOSE) --profile $(PROFILE) up -d mysql-dev phpmyadmin-dev

## Перезапустить MySQL
mysql-restart:
	$(COMPOSE) restart mysql-dev

## Остановить и удалить только MySQL и phpMyAdmin
mysql-down:
	$(COMPOSE) --profile $(PROFILE) rm -sf mysql-dev phpmyadmin-dev || true
	$(COMPOSE) --profile $(PROFILE) down || true

## Подождать готовности MySQL
mysql-wait:
	@echo "⏳ Ждём готовности MySQL в контейнере $(MYSQL_CONT)..."
	@until docker exec $(MYSQL_CONT) mysqladmin ping -p$(MYSQL_ROOT) --silent; do sleep 2; done
	@echo "✅ MySQL готов."

## Импортировать дамп .sql в $(MYSQL_DB)
## Использование: make mysql-import DUMP=./path/to/dump.sql
mysql-import: mysql-wait
	@[ -f "$(DUMP)" ] || (echo "⛔ Файл не найден: $(DUMP)"; exit 1)
	@echo "📥 Импорт $(DUMP) → $(MYSQL_DB)..."
	@docker exec -i $(MYSQL_CONT) sh -c 'mysql -uroot -p$(MYSQL_ROOT) $(MYSQL_DB)' < "$(DUMP)"
	@echo "✅ Импорт завершён."

## Открыть mysql-клиент внутри контейнера
mysql-cli:
	docker exec -it $(MYSQL_CONT) mysql -uroot -p$(MYSQL_ROOT) $(MYSQL_DB)

## Логи MySQL
mysql-logs:
	docker logs -f $(MYSQL_CONT)

## Быстро открыть phpMyAdmin в браузере (macOS)
pma-open:
	open http://localhost:8081 || xdg-open http://localhost:8081

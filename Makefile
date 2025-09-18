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

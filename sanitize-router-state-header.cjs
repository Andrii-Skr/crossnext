"use strict";

const http = require("node:http");
const https = require("node:https");

const NEXT_ROUTER_STATE_TREE_HEADER = "next-router-state-tree";
const NEXT_ROUTER_STATE_TREE_MAX_LENGTH = 20 * 2000;

let parseAndValidateFlightRouterState = null;
try {
  ({
    parseAndValidateFlightRouterState,
  } = require("next/dist/server/app-render/parse-and-validate-flight-router-state"));
} catch {}

function isInvalidRouterStateHeader(value) {
  if (typeof value === "undefined") return false;
  if (Array.isArray(value)) return true;
  if (typeof value !== "string") return true;
  if (value.length > NEXT_ROUTER_STATE_TREE_MAX_LENGTH) return true;

  if (parseAndValidateFlightRouterState) {
    try {
      parseAndValidateFlightRouterState(value);
      return false;
    } catch {
      return true;
    }
  }

  try {
    JSON.parse(decodeURIComponent(value));
    return false;
  } catch {
    return true;
  }
}

function sanitizeRequest(req) {
  const header = req.headers[NEXT_ROUTER_STATE_TREE_HEADER];
  if (isInvalidRouterStateHeader(header)) {
    delete req.headers[NEXT_ROUTER_STATE_TREE_HEADER];
  }
}

function patchCreateServer(moduleRef) {
  const originalCreateServer = moduleRef.createServer;
  moduleRef.createServer = function patchedCreateServer(...args) {
    if (typeof args[0] === "function") {
      const originalHandler = args[0];
      args[0] = function wrappedHandler(req, res) {
        sanitizeRequest(req);
        return originalHandler(req, res);
      };
    } else if (args[1] && typeof args[1] === "function") {
      const originalHandler = args[1];
      args[1] = function wrappedHandler(req, res) {
        sanitizeRequest(req);
        return originalHandler(req, res);
      };
    }
    return originalCreateServer.apply(this, args);
  };
}

patchCreateServer(http);
patchCreateServer(https);

"use client";

import { CircleAlert, CircleCheckBig, CirclePlus, Loader2, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type AddDefinitionCreatedPayload, AddDefinitionModal } from "@/components/dictionary/AddDefinitionModal";
import { EditDefinitionModal } from "@/components/dictionary/EditDefinitionModal";
import { type NewWordCreatedPayload, NewWordModal } from "@/components/dictionary/NewWordModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type {
  FillFinalizePayload,
  FillMaskCandidate,
  FillReviewDefinitionOption,
  FillReviewPayload,
  FillReviewSlot,
  FillReviewTemplate,
} from "./model";

type EditableSlot = {
  slotId: number;
  word: string;
  definition: string;
  wordId: string | null;
  opredId: string | null;
  definitionOptions: FillReviewDefinitionOption[];
};

type WordOption = {
  value: string;
  word: string;
  wordId: string | null;
  definitions: FillReviewDefinitionOption[];
};

type DefinitionExistingOption = {
  id: string;
  text: string;
  lang?: "ru" | "uk" | "en";
};

type WordCreateTarget = {
  templateKey: string;
  slotId: number;
  language: string;
  length: number;
  fixedLetters: Array<{ index: number; letter: string }>;
};

type DefinitionCreateTarget = {
  templateKey: string;
  slotId: number;
  wordId: string;
  word: string;
  language: string;
  existing: DefinitionExistingOption[];
};

type DefinitionEditTarget = {
  templateKey: string;
  slotId: number;
  wordId: string;
  opredId: string;
  definition: string;
};

type FillReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewJobId: string | null;
  reviewData: FillReviewPayload | null;
  loading: boolean;
  finalizing: boolean;
  error: string | null;
  onFinalize: (payload: FillFinalizePayload) => Promise<void>;
  onRequestCandidates: (params: {
    templateKey: string;
    slotId: number;
    mask: string;
    limit?: number;
  }) => Promise<FillMaskCandidate[]>;
};

function normalizeWordInput(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

const PENDING_DEFAULT_DEFINITION_DIFFICULTY = 3;

type FillReviewDefinitionOptionInput = Omit<FillReviewDefinitionOption, "difficulty"> & {
  difficulty?: number | null;
};

function normalizeDefinitionDifficulty(value: number | null | undefined): number | null {
  if (!Number.isFinite(value as number)) return null;
  return Math.trunc(value as number);
}

function normalizeDefinitionOptions(
  options: FillReviewDefinitionOptionInput[] | null | undefined,
): FillReviewDefinitionOption[] {
  if (!Array.isArray(options)) return [];
  const byText = new Map<string, FillReviewDefinitionOption>();
  for (const option of options) {
    const text = (option.text ?? "").trim();
    if (!text) continue;
    const next: FillReviewDefinitionOption = {
      opredId: option.opredId ?? null,
      text,
      difficulty: normalizeDefinitionDifficulty(option.difficulty),
    };
    const key = normalizeDefinitionKey(text);
    const current = byText.get(key);
    if (!current) {
      byText.set(key, next);
      continue;
    }
    const currentHasOpredId = Boolean(current.opredId);
    const nextHasOpredId = Boolean(next.opredId);
    const currentHasDifficulty = Number.isFinite(current.difficulty as number);
    const nextHasDifficulty = Number.isFinite(next.difficulty as number);
    if (nextHasOpredId && !currentHasOpredId) {
      byText.set(key, next);
      continue;
    }
    if (!nextHasOpredId && currentHasOpredId) {
      continue;
    }
    if (nextHasDifficulty && !currentHasDifficulty) {
      byText.set(key, next);
    }
  }
  return [...byText.values()];
}

function buildInitialTemplateState(template: FillReviewTemplate): EditableSlot[] {
  return template.slots.map((slot) => ({
    slotId: slot.slotId,
    word: normalizeWordInput(slot.word),
    definition: slot.definition,
    wordId: slot.wordId ?? null,
    opredId: slot.opredId ?? null,
    definitionOptions: normalizeDefinitionOptions(slot.definitionOptions),
  }));
}

function keyForRow(templateKey: string, slotId: number): string {
  return `${templateKey}:${slotId}`;
}

function keyForWordOption(wordId: string | null, word: string): string {
  return `${wordId ?? "new"}:${normalizeWordInput(word)}`;
}

function toSupportedLanguage(value: string): "ru" | "uk" | "en" | undefined {
  if (value === "ru" || value === "uk" || value === "en") return value;
  return undefined;
}

type PersistedReviewDraft = {
  version: 2;
  rows: PersistedReviewRow[];
};

const REVIEW_DRAFT_STORAGE_PREFIX = "scanwords:fillReviewDraft:";
const REVIEW_DRAFT_API_PATH = "/api/scanwords/fill-review-draft";
const REVIEW_DRAFT_SAVE_DEBOUNCE_MS = 700;

function buildReviewDraftStorageKey(reviewJobId: string): string {
  return `${REVIEW_DRAFT_STORAGE_PREFIX}${reviewJobId}`;
}

type PersistedReviewRow = {
  templateKey: string;
  slotId: number;
  word: string;
  definition: string;
  wordId: string | null;
  opredId: string | null;
};

function mapPersistedRowsByTemplate(rows: PersistedReviewRow[]): Map<string, Map<number, PersistedReviewRow>> {
  const result = new Map<string, Map<number, PersistedReviewRow>>();
  for (const row of rows) {
    const bySlotId = result.get(row.templateKey) ?? new Map<number, PersistedReviewRow>();
    bySlotId.set(row.slotId, row);
    result.set(row.templateKey, bySlotId);
  }
  return result;
}

function normalizePersistedRows(value: unknown): PersistedReviewRow[] {
  if (!Array.isArray(value)) return [];
  const rows: PersistedReviewRow[] = [];
  for (const rowRaw of value) {
    const row = normalizePersistedSlot(rowRaw);
    if (!row) continue;
    rows.push(row);
  }
  return rows;
}

function normalizePersistedSlot(value: unknown): PersistedReviewRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    templateKey?: unknown;
    slotId?: unknown;
    word?: unknown;
    definition?: unknown;
    wordId?: unknown;
    opredId?: unknown;
  };
  if (typeof row.templateKey !== "string" || !row.templateKey) return null;
  const slotId = typeof row.slotId === "number" ? row.slotId : Number.NaN;
  if (!Number.isFinite(slotId)) return null;
  const word = typeof row.word === "string" ? normalizeWordInput(row.word) : "";
  const definition = typeof row.definition === "string" ? row.definition : "";
  const wordId = typeof row.wordId === "string" && row.wordId.length > 0 ? row.wordId : null;
  const opredId = typeof row.opredId === "string" && row.opredId.length > 0 ? row.opredId : null;
  return {
    templateKey: row.templateKey,
    slotId,
    word,
    definition,
    wordId,
    opredId,
  };
}

function readPersistedReviewDraft(storageKey: string): Map<string, Map<number, PersistedReviewRow>> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    const payload = parsed as { version?: unknown; rows?: unknown };
    if (payload.version !== 2 || !Array.isArray(payload.rows)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return mapPersistedRowsByTemplate(normalizePersistedRows(payload.rows));
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

async function loadServerReviewDraft(
  reviewJobId: string,
): Promise<{ available: boolean; rows: Map<string, Map<number, PersistedReviewRow>> }> {
  try {
    const res = await fetch(`${REVIEW_DRAFT_API_PATH}?jobId=${encodeURIComponent(reviewJobId)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return { available: false, rows: new Map() };
    }
    const data = (await res.json()) as { available?: unknown; rows?: unknown };
    const available = data?.available !== false;
    if (!available) return { available: false, rows: new Map() };
    const rows = normalizePersistedRows(data?.rows);
    return { available: true, rows: mapPersistedRowsByTemplate(rows) };
  } catch {
    return { available: false, rows: new Map() };
  }
}

async function saveServerReviewDraft(reviewJobId: string, rows: PersistedReviewRow[]): Promise<boolean> {
  try {
    const res = await fetch(REVIEW_DRAFT_API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: reviewJobId,
        rows,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: unknown };
    return data?.available !== false;
  } catch {
    return false;
  }
}

async function deleteServerReviewDraft(reviewJobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${REVIEW_DRAFT_API_PATH}?jobId=${encodeURIComponent(reviewJobId)}`, {
      method: "DELETE",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: unknown };
    return data?.available !== false;
  } catch {
    return false;
  }
}

function cleanupLegacyReviewDraftStorage() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(REVIEW_DRAFT_STORAGE_PREFIX)) continue;
    keys.push(key);
  }
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      window.localStorage.removeItem(key);
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        window.localStorage.removeItem(key);
        continue;
      }
      const payload = parsed as { version?: unknown; rows?: unknown };
      if (payload.version !== 2 || !Array.isArray(payload.rows)) {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

function mergeTemplateStateWithDraft(
  initialRows: EditableSlot[],
  draftRowsBySlotId: Map<number, PersistedReviewRow> | undefined,
): EditableSlot[] {
  if (!draftRowsBySlotId?.size) return initialRows;
  return initialRows.map((initialRow) => {
    const draft = draftRowsBySlotId.get(initialRow.slotId);
    if (!draft) return initialRow;
    const nextWord = normalizeWordInput(draft.word);
    const nextDefinitionOptions = [...initialRow.definitionOptions];
    const nextDefinition = draft.definition ?? "";
    const hasDefinitionInOptions =
      !nextDefinition ||
      nextDefinitionOptions.some(
        (option) => option.text === nextDefinition && option.opredId === (draft.opredId ?? null),
      ) ||
      nextDefinitionOptions.some((option) => option.text === nextDefinition);
    if (!hasDefinitionInOptions && nextDefinition) {
      const knownOption = nextDefinitionOptions.find((option) => option.text === nextDefinition);
      nextDefinitionOptions.push({
        opredId: draft.opredId ?? null,
        text: nextDefinition,
        difficulty: knownOption?.difficulty ?? null,
      });
    }

    return {
      ...initialRow,
      word: nextWord || initialRow.word,
      definition: nextDefinition,
      wordId: draft.wordId ?? null,
      opredId: draft.opredId ?? null,
      definitionOptions: nextDefinitionOptions,
    };
  });
}

function buildPersistedRows(
  templates: FillReviewTemplate[],
  slotsByTemplate: Record<string, EditableSlot[]>,
): PersistedReviewRow[] {
  const rows: PersistedReviewRow[] = [];
  for (const template of templates) {
    const initialRows = buildInitialTemplateState(template);
    const initialBySlotId = new Map(initialRows.map((row) => [row.slotId, row]));
    const currentRows = slotsByTemplate[template.key] ?? [];
    for (const currentRow of currentRows) {
      const initialRow = initialBySlotId.get(currentRow.slotId);
      if (!initialRow) continue;
      const currentWord = normalizeWordInput(currentRow.word);
      const initialWord = normalizeWordInput(initialRow.word);
      const currentWordId = currentRow.wordId ?? null;
      const initialWordId = initialRow.wordId ?? null;
      const currentDefinition = currentRow.definition ?? "";
      const initialDefinition = initialRow.definition ?? "";
      const currentOpredId = currentRow.opredId ?? null;
      const initialOpredId = initialRow.opredId ?? null;
      const unchanged =
        currentWord === initialWord &&
        currentWordId === initialWordId &&
        currentDefinition === initialDefinition &&
        currentOpredId === initialOpredId;
      if (unchanged) continue;
      rows.push({
        templateKey: template.key,
        slotId: currentRow.slotId,
        word: currentWord,
        definition: currentDefinition,
        wordId: currentWordId,
        opredId: currentOpredId,
      });
    }
  }
  return rows;
}

function buildWordOptions(row: EditableSlot, candidates: FillMaskCandidate[]): WordOption[] {
  const byKey = new Map<string, WordOption>();
  const add = (wordId: string | null, word: string, definitions: FillReviewDefinitionOptionInput[]) => {
    const normalizedWord = normalizeWordInput(word);
    if (!normalizedWord) return;
    const value = keyForWordOption(wordId, normalizedWord);
    if (byKey.has(value)) return;
    byKey.set(value, {
      value,
      word: normalizedWord,
      wordId,
      definitions: normalizeDefinitionOptions(definitions),
    });
  };

  add(row.wordId, row.word, row.definitionOptions);
  for (const candidate of candidates) {
    add(candidate.wordId ?? null, candidate.word, candidate.definitions ?? []);
  }

  return [...byKey.values()];
}

function buildDefinitionClueGroups(template: FillReviewTemplate) {
  const byKey = new Map<
    string,
    {
      key: string;
      row: number;
      col: number;
      slotIds: number[];
    }
  >();
  for (const slot of template.slots) {
    const clue = slot.clueCell;
    if (!clue) continue;
    const group = byKey.get(clue.key) ?? {
      key: clue.key,
      row: clue.row,
      col: clue.col,
      slotIds: [],
    };
    if (!group.slotIds.includes(slot.slotId)) {
      group.slotIds.push(slot.slotId);
    }
    byKey.set(clue.key, group);
  }
  return [...byKey.values()].map((group) => ({
    ...group,
    slotIds: [...group.slotIds].sort((a, b) => a - b),
  }));
}

function normalizeDefinitionKey(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function extractTemplateNumber(value: string): number | null {
  const match = value.trim().match(/^(\d{1,6})(?=\D|$)/u);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function resolveTemplatePageNumber(template: FillReviewTemplate): number {
  const fromName = extractTemplateNumber(template.name);
  if (fromName !== null) return fromName;
  const fromSource = extractTemplateNumber(template.sourceName);
  if (fromSource !== null) return fromSource;
  return template.order + 1;
}

function resolveSpreadIndex(page: number): number {
  return Math.floor((page - 1) / 2);
}

function buildTemplateNeighborMap(templates: FillReviewTemplate[]): Map<string, Set<string>> {
  const spreadByKey = new Map<string, number>();
  const keysBySpread = new Map<number, string[]>();

  for (const template of templates) {
    const spread = resolveSpreadIndex(resolveTemplatePageNumber(template));
    spreadByKey.set(template.key, spread);
    const list = keysBySpread.get(spread) ?? [];
    list.push(template.key);
    keysBySpread.set(spread, list);
  }

  const neighbors = new Map<string, Set<string>>();
  for (const template of templates) {
    const spread = spreadByKey.get(template.key);
    if (spread === undefined) continue;
    const set = new Set<string>();
    for (const candidateSpread of [spread - 1, spread, spread + 1]) {
      const keys = keysBySpread.get(candidateSpread);
      if (!keys) continue;
      for (const key of keys) {
        if (key !== template.key) set.add(key);
      }
    }
    neighbors.set(template.key, set);
  }
  return neighbors;
}

export function FillReviewDialog({
  open,
  onOpenChange,
  reviewJobId,
  reviewData,
  loading,
  finalizing,
  error,
  onFinalize,
  onRequestCandidates,
}: FillReviewDialogProps) {
  const t = useTranslations();
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [slotsByTemplate, setSlotsByTemplate] = useState<Record<string, EditableSlot[]>>({});
  const [candidateMap, setCandidateMap] = useState<Record<string, FillMaskCandidate[]>>({});
  const [candidateLoadingKey, setCandidateLoadingKey] = useState<string | null>(null);
  const [wordCreateTarget, setWordCreateTarget] = useState<WordCreateTarget | null>(null);
  const [definitionCreateTarget, setDefinitionCreateTarget] = useState<DefinitionCreateTarget | null>(null);
  const [definitionEditTarget, setDefinitionEditTarget] = useState<DefinitionEditTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const draftStorageKey = useMemo(() => (reviewJobId ? buildReviewDraftStorageKey(reviewJobId) : null), [reviewJobId]);
  const draftStorageDisabledRef = useRef(false);
  const draftRemoteEnabledRef = useRef(false);
  const draftPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moderationCreatedRef = useRef<{
    newWords: Set<string>;
    newDefinitions: Set<string>;
  }>({
    newWords: new Set<string>(),
    newDefinitions: new Set<string>(),
  });

  const templates = useMemo(() => {
    if (!reviewData?.templates) return [];
    return [...reviewData.templates].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [reviewData?.templates]);
  const templateNeighbors = useMemo(() => buildTemplateNeighborMap(templates), [templates]);

  useEffect(() => {
    let active = true;
    if (!templates.length) {
      setSelectedTemplateKey(null);
      setSlotsByTemplate({});
      setCandidateMap({});
      moderationCreatedRef.current.newWords.clear();
      moderationCreatedRef.current.newDefinitions.clear();
      setDraftHydrated(false);
      return () => {
        active = false;
      };
    }

    setDraftHydrated(false);
    const hydrate = async () => {
      draftStorageDisabledRef.current = false;
      draftRemoteEnabledRef.current = false;
      cleanupLegacyReviewDraftStorage();
      const persistedLocalDraft = draftStorageKey ? readPersistedReviewDraft(draftStorageKey) : null;
      let persistedServerDraft: Map<string, Map<number, PersistedReviewRow>> | null = null;

      if (reviewJobId) {
        const remoteDraft = await loadServerReviewDraft(reviewJobId);
        if (!active) return;
        draftRemoteEnabledRef.current = remoteDraft.available;
        persistedServerDraft = remoteDraft.rows;
      }

      const persistedDraft =
        draftRemoteEnabledRef.current && persistedServerDraft != null ? persistedServerDraft : persistedLocalDraft;

      const initial: Record<string, EditableSlot[]> = {};
      for (const template of templates) {
        const initialRows = buildInitialTemplateState(template);
        initial[template.key] = mergeTemplateStateWithDraft(initialRows, persistedDraft?.get(template.key));
      }
      if (!active) return;

      setSlotsByTemplate(initial);
      setCandidateMap({});
      moderationCreatedRef.current.newWords.clear();
      moderationCreatedRef.current.newDefinitions.clear();
      setSelectedTemplateKey((prev) => (prev && initial[prev] ? prev : (templates[0]?.key ?? null)));
      setDraftHydrated(true);
    };

    void hydrate();
    return () => {
      active = false;
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current);
        draftPersistTimeoutRef.current = null;
      }
    };
  }, [draftStorageKey, reviewJobId, templates]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (!templates.length) return;
    if (!Object.keys(slotsByTemplate).length) return;
    if (typeof window === "undefined") return;
    const rows = buildPersistedRows(templates, slotsByTemplate);

    const persistLocally = () => {
      if (!draftStorageKey) return;
      if (draftStorageDisabledRef.current) return;
      if (rows.length === 0) {
        window.localStorage.removeItem(draftStorageKey);
        return;
      }
      const payload: PersistedReviewDraft = {
        version: 2,
        rows,
      };
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      } catch {
        cleanupLegacyReviewDraftStorage();
        try {
          window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        } catch {
          draftStorageDisabledRef.current = true;
        }
      }
    };

    if (draftPersistTimeoutRef.current) {
      clearTimeout(draftPersistTimeoutRef.current);
      draftPersistTimeoutRef.current = null;
    }

    draftPersistTimeoutRef.current = setTimeout(() => {
      void (async () => {
        if (reviewJobId && draftRemoteEnabledRef.current) {
          if (rows.length === 0) {
            const cleared = await deleteServerReviewDraft(reviewJobId);
            if (cleared) {
              if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
              return;
            }
          } else {
            const saved = await saveServerReviewDraft(reviewJobId, rows);
            if (saved) {
              if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
              return;
            }
          }
          draftRemoteEnabledRef.current = false;
        }
        persistLocally();
      })();
    }, REVIEW_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current);
        draftPersistTimeoutRef.current = null;
      }
    };
  }, [draftHydrated, draftStorageKey, reviewJobId, slotsByTemplate, templates]);

  useEffect(() => {
    if (open) return;
    setWordCreateTarget(null);
    setDefinitionCreateTarget(null);
    setDefinitionEditTarget(null);
  }, [open]);

  const templateByKey = useMemo(() => {
    const map = new Map<string, FillReviewTemplate>();
    for (const template of templates) map.set(template.key, template);
    return map;
  }, [templates]);

  const selectedTemplate = selectedTemplateKey ? (templateByKey.get(selectedTemplateKey) ?? null) : null;
  const selectedSlots = selectedTemplate ? (slotsByTemplate[selectedTemplate.key] ?? []) : [];

  const updateSlot = useCallback(
    (templateKey: string, slotId: number, updater: (slot: EditableSlot) => EditableSlot) => {
      setSlotsByTemplate((prev) => {
        const rows = prev[templateKey];
        if (!rows) return prev;
        const nextRows = rows.map((row) => (row.slotId === slotId ? updater(row) : row));
        return {
          ...prev,
          [templateKey]: nextRows,
        };
      });
    },
    [],
  );

  const buildMask = useCallback(
    (template: FillReviewTemplate, slot: FillReviewSlot): string => {
      const currentSlots = slotsByTemplate[template.key] ?? [];
      const byId = new Map(currentSlots.map((item) => [item.slotId, item]));
      const mask = Array.from({ length: slot.len }, () => ".");
      for (const intersection of slot.intersections) {
        const other = byId.get(intersection.slotId);
        const otherWord = normalizeWordInput(other?.word ?? "");
        const letter = otherWord[intersection.otherIndex];
        if (letter) mask[intersection.index] = letter;
      }
      return mask.join("");
    },
    [slotsByTemplate],
  );

  const validation = useMemo(() => {
    const messages: string[] = [];
    const rowMessages = new Map<string, string[]>();
    const templateMessages = new Map<string, string[]>();
    const templateByKey = new Map(templates.map((template) => [template.key, template]));
    const wordsByTemplate = new Map<string, Map<string, number[]>>();
    const definitionOwner = new Map<string, { templateKey: string; templateName: string; slotId: number }>();
    const unique = new Set<string>();
    const push = (message: string, rows: Array<{ templateKey: string; slotId: number }> = [], templateKey?: string) => {
      if (!unique.has(message)) {
        unique.add(message);
        messages.push(message);
      }
      const targetTemplateKey = templateKey ?? rows[0]?.templateKey;
      if (targetTemplateKey) {
        const list = templateMessages.get(targetTemplateKey) ?? [];
        if (!list.includes(message)) list.push(message);
        templateMessages.set(targetTemplateKey, list);
      }
      for (const row of rows) {
        const key = keyForRow(row.templateKey, row.slotId);
        const list = rowMessages.get(key) ?? [];
        if (!list.includes(message)) list.push(message);
        rowMessages.set(key, list);
      }
    };

    for (const template of templates) {
      const editableRows = slotsByTemplate[template.key] ?? [];
      const rowById = new Map(editableRows.map((row) => [row.slotId, row]));
      const definitionByWord = new Map<string, string>();
      const slotIdsByWord = new Map<string, number[]>();
      const slotByDefinition = new Map<string, number>();
      for (const slot of template.slots) {
        const current = rowById.get(slot.slotId);
        if (!current) continue;
        const word = normalizeWordInput(current.word);
        const definition = (current.definition ?? "").trim();
        const rowRef = [{ templateKey: template.key, slotId: slot.slotId }];

        if (!word) {
          push(`${template.name}: слот ${slot.slotId} — слово пустое`, rowRef, template.key);
          continue;
        }
        if (!/^\p{L}+$/u.test(word)) {
          push(`${template.name}: слот ${slot.slotId} — в слове только буквы`, rowRef, template.key);
        }
        if (word.length !== slot.len) {
          push(`${template.name}: слот ${slot.slotId} — длина слова должна быть ${slot.len}`, rowRef, template.key);
        }
        if (!definition) {
          push(`${template.name}: слот ${slot.slotId} — определение пустое`, rowRef, template.key);
        }

        const mask = buildMask(template, slot);
        if (word.length === slot.len && mask.length === slot.len) {
          for (let i = 0; i < mask.length; i += 1) {
            const fixed = mask[i];
            if (fixed !== "." && fixed !== word[i]) {
              push(`${template.name}: слот ${slot.slotId} не подходит по маске пересечений`, rowRef, template.key);
              break;
            }
          }
        }

        const existingDefinition = definitionByWord.get(word);
        if (existingDefinition === undefined) {
          definitionByWord.set(word, definition);
        } else if (existingDefinition !== definition) {
          push(`${template.name}: слово ${word} имеет разные определения`, rowRef, template.key);
        }

        const sameWordSlots = slotIdsByWord.get(word) ?? [];
        sameWordSlots.push(slot.slotId);
        slotIdsByWord.set(word, sameWordSlots);
        if (sameWordSlots.length > 1) {
          push(`${template.name}: слово ${word} повторяется в шаблоне`, rowRef, template.key);
        }

        if (definition) {
          const definitionKey = normalizeDefinitionKey(definition);
          const sameDefinitionSlot = slotByDefinition.get(definitionKey);
          if (sameDefinitionSlot !== undefined && sameDefinitionSlot !== slot.slotId) {
            push(
              `${template.name}: слот ${slot.slotId} — определение дублирует слот ${sameDefinitionSlot}`,
              rowRef,
              template.key,
            );
          } else {
            slotByDefinition.set(definitionKey, slot.slotId);
          }

          const existingDefinitionOwner = definitionOwner.get(definitionKey);
          if (existingDefinitionOwner && existingDefinitionOwner.templateKey !== template.key) {
            const refs = [
              { templateKey: template.key, slotId: slot.slotId },
              { templateKey: existingDefinitionOwner.templateKey, slotId: existingDefinitionOwner.slotId },
            ];
            const message = `${template.name}: слот ${slot.slotId} — определение повторяет шаблон ${existingDefinitionOwner.templateName} (слот ${existingDefinitionOwner.slotId})`;
            push(message, refs, template.key);
            push(message, refs, existingDefinitionOwner.templateKey);
          } else if (!existingDefinitionOwner) {
            definitionOwner.set(definitionKey, {
              templateKey: template.key,
              templateName: template.name,
              slotId: slot.slotId,
            });
          }
        }
      }
      wordsByTemplate.set(template.key, slotIdsByWord);

      const clueGroups = buildDefinitionClueGroups(template);
      for (const group of clueGroups) {
        const defs = group.slotIds
          .map((slotId) => {
            const row = rowById.get(slotId);
            return {
              slotId,
              length: (row?.definition ?? "").trim().length,
            };
          })
          .filter((item) => item.length > 0);
        if (!defs.length) continue;

        if (group.slotIds.length === 2) {
          for (const def of defs) {
            if (def.length > 15) {
              push(
                `${template.name}: слот ${def.slotId} — максимум 15 символов (две стрелки из клетки ${group.key})`,
                [{ templateKey: template.key, slotId: def.slotId }],
                template.key,
              );
            }
          }
          const sum = defs.reduce((acc, item) => acc + item.length, 0);
          if (sum > 30) {
            push(
              `${template.name}: сумма определений для клетки ${group.key} больше 30`,
              defs.map((item) => ({ templateKey: template.key, slotId: item.slotId })),
              template.key,
            );
          }
        } else {
          for (const def of defs) {
            if (def.length > 30) {
              push(
                `${template.name}: слот ${def.slotId} — определение больше 30 символов`,
                [{ templateKey: template.key, slotId: def.slotId }],
                template.key,
              );
            }
          }
        }
      }
    }

    for (const template of templates) {
      const words = wordsByTemplate.get(template.key);
      if (!words) continue;
      const neighborKeys = templateNeighbors.get(template.key);
      if (!neighborKeys) continue;
      for (const neighborKey of neighborKeys) {
        if (template.key >= neighborKey) continue;
        const neighborTemplate = templateByKey.get(neighborKey);
        const neighborWords = wordsByTemplate.get(neighborKey);
        if (!neighborTemplate || !neighborWords) continue;

        for (const [word, slotIds] of words) {
          const neighborSlotIds = neighborWords.get(word);
          if (!neighborSlotIds || !neighborSlotIds.length) continue;
          const refs = [
            ...slotIds.map((slotId) => ({ templateKey: template.key, slotId })),
            ...neighborSlotIds.map((slotId) => ({ templateKey: neighborKey, slotId })),
          ];
          const message = `${template.name} и ${neighborTemplate.name}: слово ${word} повторяется в соседних шаблонах`;
          push(message, refs, template.key);
          push(message, refs, neighborKey);
        }
      }
    }

    return {
      messages,
      rowMessages,
      templateMessages,
    };
  }, [buildMask, slotsByTemplate, templateNeighbors, templates]);

  const selectedValidationMessages = useMemo(() => {
    if (!selectedTemplate) return validation.messages;
    return validation.templateMessages.get(selectedTemplate.key) ?? [];
  }, [selectedTemplate, validation.messages, validation.templateMessages]);
  const selectedTemplateHasErrors = selectedTemplate
    ? (validation.templateMessages.get(selectedTemplate.key)?.length ?? 0) > 0
    : false;
  const selectedSlotById = useMemo(() => {
    const byId = new Map<number, EditableSlot>();
    for (const row of selectedSlots) byId.set(row.slotId, row);
    return byId;
  }, [selectedSlots]);
  const selectedTemplateSlots = useMemo(() => {
    if (!selectedTemplate) return [];
    const ordered = [...selectedTemplate.slots];
    const orderBySlotId = new Map<number, number>(ordered.map((slot, index) => [slot.slotId, index]));
    ordered.sort((a, b) => {
      const keyA = keyForRow(selectedTemplate.key, a.slotId);
      const keyB = keyForRow(selectedTemplate.key, b.slotId);
      const errorsA = validation.rowMessages.get(keyA)?.length ?? 0;
      const errorsB = validation.rowMessages.get(keyB)?.length ?? 0;
      const hasErrorsA = errorsA > 0 ? 1 : 0;
      const hasErrorsB = errorsB > 0 ? 1 : 0;
      if (hasErrorsA !== hasErrorsB) return hasErrorsB - hasErrorsA;
      if (errorsA !== errorsB) return errorsB - errorsA;
      return (orderBySlotId.get(a.slotId) ?? 0) - (orderBySlotId.get(b.slotId) ?? 0);
    });
    return ordered;
  }, [selectedTemplate, validation.rowMessages]);
  const definitionUsageCountByKey = useMemo(() => {
    const usage = new Map<string, number>();
    for (const rows of Object.values(slotsByTemplate)) {
      for (const row of rows) {
        const text = (row.definition ?? "").trim();
        if (!text) continue;
        const key = normalizeDefinitionKey(text);
        usage.set(key, (usage.get(key) ?? 0) + 1);
      }
    }
    return usage;
  }, [slotsByTemplate]);
  const draftLoading = Boolean(reviewData) && templates.length > 0 && !draftHydrated;
  const reviewLoading = loading || draftLoading;

  const requestCandidates = useCallback(
    async (template: FillReviewTemplate, slot: FillReviewSlot) => {
      const key = keyForRow(template.key, slot.slotId);
      try {
        setCandidateLoadingKey(key);
        const mask = buildMask(template, slot);
        const candidates = await onRequestCandidates({
          templateKey: template.key,
          slotId: slot.slotId,
          mask,
          limit: 120,
        });
        setCandidateMap((prev) => ({ ...prev, [key]: candidates }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("scanwordsReviewCandidatesError");
        toast.error(msg);
      } finally {
        setCandidateLoadingKey(null);
      }
    },
    [buildMask, onRequestCandidates, t],
  );

  const applyNewWord = useCallback(
    (target: WordCreateTarget, payload: NewWordCreatedPayload) => {
      const normalizedWord = normalizeWordInput(payload.word);
      const nextOptions = payload.definitions
        .map((item) => ({
          text: item.text.trim(),
          difficulty: normalizeDefinitionDifficulty(item.difficulty),
        }))
        .filter((item) => item.text.length > 0)
        .map((item) => ({ opredId: null, text: item.text, difficulty: item.difficulty }));
      const firstDefinition = nextOptions[0]?.text ?? "";

      for (const definition of nextOptions) {
        moderationCreatedRef.current.newWords.add(`${target.language}:${normalizedWord}:${definition.text}`);
      }

      updateSlot(target.templateKey, target.slotId, (slot) => ({
        ...slot,
        word: normalizedWord,
        wordId: null,
        definition: firstDefinition || slot.definition,
        opredId: null,
        definitionOptions: nextOptions.length > 0 ? nextOptions : slot.definitionOptions,
      }));
    },
    [updateSlot],
  );

  const applyAddedDefinitions = useCallback(
    (target: DefinitionCreateTarget, payload: AddDefinitionCreatedPayload) => {
      const appended = payload.definitions
        .map((item) => ({
          text: item.text.trim(),
          difficulty: normalizeDefinitionDifficulty(item.difficulty),
        }))
        .filter((item) => item.text.length > 0);
      if (!appended.length) return;

      for (const definition of appended) {
        moderationCreatedRef.current.newDefinitions.add(`${target.wordId}:${definition.text}`);
      }

      updateSlot(target.templateKey, target.slotId, (slot) => {
        const nextOptions = [...slot.definitionOptions];
        for (const definition of appended) {
          if (!nextOptions.some((option) => option.text === definition.text)) {
            nextOptions.push({ opredId: null, text: definition.text, difficulty: definition.difficulty });
          }
        }
        return {
          ...slot,
          definition: appended[0]?.text ?? slot.definition,
          opredId: null,
          definitionOptions: nextOptions,
        };
      });
    },
    [updateSlot],
  );

  const applyEditedDefinition = useCallback(
    (target: DefinitionEditTarget, text: string) => {
      const nextDefinition = text.trim();
      if (!nextDefinition) return;
      moderationCreatedRef.current.newDefinitions.add(`${target.wordId}:${nextDefinition}`);
      updateSlot(target.templateKey, target.slotId, (slot) => {
        const nextOptions = [...slot.definitionOptions];
        const baseOption =
          nextOptions.find((option) => option.opredId === target.opredId) ??
          nextOptions.find((option) => option.text === target.definition);
        const nextDifficulty = baseOption?.difficulty ?? null;
        if (!nextOptions.some((option) => option.text === nextDefinition)) {
          nextOptions.push({ opredId: null, text: nextDefinition, difficulty: nextDifficulty });
        }
        return {
          ...slot,
          definition: nextDefinition,
          opredId: null,
          definitionOptions: nextOptions,
        };
      });
    },
    [updateSlot],
  );

  const sendModerationCards = useCallback(async () => {
    if (!reviewData) return;
    const requests: Array<Promise<Response>> = [];
    const newWordKeys = new Set<string>();
    const newDefKeys = new Set<string>();

    for (const template of reviewData.templates) {
      const rows = slotsByTemplate[template.key] ?? [];
      for (const row of rows) {
        const word = normalizeWordInput(row.word);
        const definition = (row.definition ?? "").trim();
        if (!word || !definition) continue;
        const selectedDefinitionOption =
          row.definitionOptions.find((option) => option.text === definition && option.opredId === row.opredId) ??
          row.definitionOptions.find((option) => option.text === definition);
        const definitionDifficulty = Number.isFinite(selectedDefinitionOption?.difficulty as number)
          ? Math.trunc(selectedDefinitionOption?.difficulty as number)
          : PENDING_DEFAULT_DEFINITION_DIFFICULTY;
        const definitionPayload = { definition, difficulty: definitionDifficulty };

        if (!row.wordId) {
          const key = `${template.language}:${word}:${definition}`;
          if (moderationCreatedRef.current.newWords.has(key)) continue;
          if (newWordKeys.has(key)) continue;
          newWordKeys.add(key);
          requests.push(
            fetch("/api/pending/create-new", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                word,
                language: template.language,
                definitions: [definitionPayload],
              }),
            }),
          );
          continue;
        }

        const knownDefinition = row.definitionOptions.some((option) => option.text === definition);
        if (!knownDefinition) {
          const key = `${row.wordId}:${definition}`;
          if (moderationCreatedRef.current.newDefinitions.has(key)) continue;
          if (newDefKeys.has(key)) continue;
          newDefKeys.add(key);
          requests.push(
            fetch("/api/pending/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                wordId: row.wordId,
                language: template.language,
                definitions: [definitionPayload],
              }),
            }),
          );
        }
      }
    }

    if (!requests.length) return;
    const results = await Promise.allSettled(requests);
    const failed = results.filter((result) => result.status === "rejected");
    const badResponses = await Promise.all(
      results
        .filter((result): result is PromiseFulfilledResult<Response> => result.status === "fulfilled")
        .map(async (result) => {
          if (result.value.ok) return null;
          return result.value.status;
        }),
    );
    const failedCount = failed.length + badResponses.filter((value) => value != null).length;
    if (failedCount > 0) {
      toast.error(t("scanwordsReviewModerationWarn", { count: failedCount }));
    }
  }, [reviewData, slotsByTemplate, t]);

  const handleFinalize = useCallback(async () => {
    if (!reviewData) return;
    if (validation.messages.length > 0) {
      const firstTemplateWithErrors = templates.find(
        (template) => (validation.templateMessages.get(template.key)?.length ?? 0) > 0,
      );
      if (firstTemplateWithErrors?.key && firstTemplateWithErrors.key !== selectedTemplateKey) {
        setSelectedTemplateKey(firstTemplateWithErrors.key);
      }
      toast.error(t("scanwordsReviewValidationError"));
      return;
    }
    const payload: FillFinalizePayload = {
      templates: reviewData.templates.map((template) => ({
        key: template.key,
        slots: (slotsByTemplate[template.key] ?? []).map((slot) => ({
          slotId: slot.slotId,
          word: normalizeWordInput(slot.word),
          definition: (slot.definition ?? "").trim(),
          wordId: slot.wordId ?? null,
          opredId: slot.opredId ?? null,
        })),
      })),
    };

    setSubmitting(true);
    try {
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current);
        draftPersistTimeoutRef.current = null;
      }
      await sendModerationCards();
      await onFinalize(payload);
      if (reviewJobId) {
        await deleteServerReviewDraft(reviewJobId);
      }
      if (draftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      toast.success(t("scanwordsReviewFinalizeSuccess"));
    } catch {
      // error toast is handled by hook
    } finally {
      setSubmitting(false);
    }
  }, [
    onFinalize,
    reviewData,
    selectedTemplateKey,
    sendModerationCards,
    slotsByTemplate,
    draftStorageKey,
    reviewJobId,
    t,
    templates,
    validation.messages.length,
    validation.templateMessages,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[1100px]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t("scanwordsReviewTitle")}</DialogTitle>
          <DialogDescription>{t("scanwordsReviewDescription")}</DialogDescription>
        </DialogHeader>

        <div className="pr-1">
          {reviewLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>{t("loading")}</span>
            </div>
          )}
          {!reviewLoading && !reviewData && <div className="text-sm text-muted-foreground">{t("noData")}</div>}
          {!reviewLoading && reviewData && (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("scanwordsReviewTemplate")}</span>
                <Select
                  value={selectedTemplate?.key ?? undefined}
                  onValueChange={(value) => setSelectedTemplateKey(value)}
                  disabled={reviewLoading || finalizing || submitting}
                >
                  <SelectTrigger className="h-8 min-w-[220px] max-w-[420px] px-2 text-sm">
                    {selectedTemplate ? (
                      <span className="inline-flex w-full items-center gap-2">
                        {selectedTemplateHasErrors ? (
                          <CircleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
                        ) : (
                          <CircleCheckBig className="size-4 shrink-0 text-emerald-500" aria-hidden />
                        )}
                        <span className="truncate">{selectedTemplate.sourceName ?? selectedTemplate.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("scanwordsReviewTemplate")}</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => {
                      const hasErrors = (validation.templateMessages.get(template.key)?.length ?? 0) > 0;
                      return (
                        <SelectItem key={template.key} value={template.key}>
                          <span className="inline-flex w-full items-center gap-2">
                            {hasErrors ? (
                              <CircleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
                            ) : (
                              <CircleCheckBig className="size-4 shrink-0 text-emerald-500" aria-hidden />
                            )}
                            <span className="truncate">{template.sourceName ?? template.name}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              {selectedValidationMessages.length > 0 && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  <div className="font-medium">{t("scanwordsReviewErrorsTitle")}</div>
                  <ul className="mt-1 grid gap-1">
                    {selectedValidationMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTemplate && (
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-2 py-2 font-medium">{t("word")}</th>
                        <th className="px-2 py-2 font-medium">{t("definition")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTemplateSlots.map((slot) => {
                        const row = selectedSlotById.get(slot.slotId);
                        if (!row) return null;
                        const rowKey = keyForRow(selectedTemplate.key, slot.slotId);
                        const isCandidateLoading = candidateLoadingKey === rowKey;
                        const rowHasError = (validation.rowMessages.get(rowKey)?.length ?? 0) > 0;
                        const candidates = candidateMap[rowKey] ?? [];
                        const wordOptions = buildWordOptions(row, candidates);
                        const currentWordValue = keyForWordOption(row.wordId, row.word);
                        const selectedWordValue = wordOptions.some((option) => option.value === currentWordValue)
                          ? currentWordValue
                          : "";
                        const selectedWordOption =
                          wordOptions.find((option) => option.value === selectedWordValue) ?? null;
                        const currentDefinition = (row.definition ?? "").trim();
                        const currentDefinitionKey = normalizeDefinitionKey(currentDefinition);
                        const filteredDefinitionOptions = row.definitionOptions.filter((option) => {
                          const text = (option.text ?? "").trim();
                          if (!text) return false;
                          const key = normalizeDefinitionKey(text);
                          const isCurrent = text === currentDefinition;
                          if (isCurrent) return true;
                          const totalUsed = definitionUsageCountByKey.get(key) ?? 0;
                          const usedByCurrentRow = key === currentDefinitionKey && currentDefinition.length > 0 ? 1 : 0;
                          return totalUsed - usedByCurrentRow <= 0;
                        });
                        const selectedDefIndex = filteredDefinitionOptions.findIndex(
                          (option) => option.text === row.definition && option.opredId === row.opredId,
                        );
                        const selectedDefIndexByText =
                          selectedDefIndex >= 0
                            ? selectedDefIndex
                            : filteredDefinitionOptions.findIndex((option) => option.text === row.definition);
                        const intersectionIndexes = new Set(slot.intersections.map((item) => item.index));
                        const templateLang = toSupportedLanguage(selectedTemplate.language);
                        return (
                          <tr key={rowKey} className={rowHasError ? "bg-destructive/5" : ""}>
                            <td className="align-top px-2 py-2">
                              <div className="grid gap-2">
                                <div className="text-[11px] text-muted-foreground">
                                  #{slot.slotId} · {slot.dir} · {slot.r}:{slot.c} ·{" "}
                                  {t("scanwordsReviewLength", { count: slot.len })}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={selectedWordValue || undefined}
                                    disabled={isCandidateLoading || finalizing || submitting}
                                    onOpenChange={(isOpen) => {
                                      if (!isOpen) return;
                                      if (isCandidateLoading) return;
                                      void requestCandidates(selectedTemplate, slot);
                                    }}
                                    onValueChange={(value) => {
                                      if (!value) return;
                                      const selectedOption = wordOptions.find((option) => option.value === value);
                                      if (!selectedOption) return;
                                      updateSlot(selectedTemplate.key, slot.slotId, (prev) => {
                                        const nextDefinitions = selectedOption.definitions;
                                        const selectedDefinition =
                                          nextDefinitions.find(
                                            (option) =>
                                              option.text === prev.definition && option.opredId === prev.opredId,
                                          ) ??
                                          nextDefinitions.find((option) => option.text === prev.definition) ??
                                          nextDefinitions[0];
                                        return {
                                          ...prev,
                                          word: selectedOption.word,
                                          wordId: selectedOption.wordId,
                                          definition: selectedDefinition?.text ?? "",
                                          opredId: selectedDefinition?.opredId ?? null,
                                          definitionOptions: nextDefinitions,
                                        };
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-full px-2 text-sm">
                                      {isCandidateLoading ? (
                                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                          <span>{t("loading")}</span>
                                        </span>
                                      ) : selectedWordOption ? (
                                        <span className="inline-flex font-sans text-[12px] tracking-[0.12em]">
                                          {Array.from({ length: slot.len }, (_, index) => {
                                            const letter = selectedWordOption.word[index] ?? ".";
                                            const cell = slot.cells[index];
                                            const letterKey = `${selectedWordOption.value}:${cell?.[0] ?? slot.r}:${cell?.[1] ?? slot.c}`;
                                            return (
                                              <span
                                                key={letterKey}
                                                className={
                                                  intersectionIndexes.has(index)
                                                    ? "font-bold text-blue-600 dark:text-blue-400"
                                                    : "font-normal"
                                                }
                                              >
                                                {letter}
                                              </span>
                                            );
                                          })}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          {t("scanwordsReviewSelectCandidate")}
                                        </span>
                                      )}
                                    </SelectTrigger>
                                    <SelectContent>
                                      {isCandidateLoading && (
                                        <SelectItem value={`${rowKey}:loading`} disabled>
                                          <span className="inline-flex items-center gap-2">
                                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                            <span>{t("loading")}</span>
                                          </span>
                                        </SelectItem>
                                      )}
                                      {wordOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          <span className="inline-flex font-sans text-[12px] tracking-[0.12em]">
                                            {Array.from({ length: slot.len }, (_, index) => {
                                              const letter = option.word[index] ?? ".";
                                              const cell = slot.cells[index];
                                              const letterKey = `${option.value}:${cell?.[0] ?? slot.r}:${cell?.[1] ?? slot.c}`;
                                              return (
                                                <span
                                                  key={letterKey}
                                                  className={
                                                    intersectionIndexes.has(index)
                                                      ? "font-bold text-blue-600 dark:text-blue-400"
                                                      : "font-normal"
                                                  }
                                                >
                                                  {letter}
                                                </span>
                                              );
                                            })}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-8 shrink-0"
                                    onClick={() => {
                                      const mask = buildMask(selectedTemplate, slot);
                                      const fixedLetters = Array.from(mask)
                                        .map((letter, index) => {
                                          if (letter === ".") return null;
                                          return { index, letter };
                                        })
                                        .filter((item): item is { index: number; letter: string } => item != null);
                                      setWordCreateTarget({
                                        templateKey: selectedTemplate.key,
                                        slotId: slot.slotId,
                                        language: selectedTemplate.language,
                                        length: slot.len,
                                        fixedLetters,
                                      });
                                    }}
                                    aria-label={t("new")}
                                  >
                                    <CirclePlus className="size-4" aria-hidden />
                                    <span className="sr-only">{t("new")}</span>
                                  </Button>
                                </div>
                              </div>
                            </td>
                            <td className="align-top px-2 py-2">
                              <div className="grid gap-2">
                                <div className="text-[11px] text-muted-foreground">
                                  {t("scanwordsReviewDefinitionLen", { count: row.definition.trim().length })}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={selectedDefIndexByText >= 0 ? String(selectedDefIndexByText) : undefined}
                                    disabled={isCandidateLoading || finalizing || submitting}
                                    onValueChange={(value) => {
                                      if (!value) return;
                                      const index = Number.parseInt(value, 10);
                                      if (!Number.isFinite(index) || index < 0) return;
                                      const option = filteredDefinitionOptions[index];
                                      if (!option) return;
                                      updateSlot(selectedTemplate.key, slot.slotId, (prev) => ({
                                        ...prev,
                                        definition: option.text,
                                        opredId: option.opredId,
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-full px-2 text-sm">
                                      {isCandidateLoading ? (
                                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                          <span>{t("loading")}</span>
                                        </span>
                                      ) : (
                                        <span className={row.definition ? "" : "text-muted-foreground"}>
                                          {row.definition || t("definition")}
                                        </span>
                                      )}
                                    </SelectTrigger>
                                    <SelectContent>
                                      {isCandidateLoading && (
                                        <SelectItem value={`${rowKey}:definition-loading`} disabled>
                                          <span className="inline-flex items-center gap-2">
                                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                            <span>{t("loading")}</span>
                                          </span>
                                        </SelectItem>
                                      )}
                                      {filteredDefinitionOptions.length === 0 && (
                                        <SelectItem value={`${rowKey}:definition-empty`} disabled>
                                          {t("noData")}
                                        </SelectItem>
                                      )}
                                      {filteredDefinitionOptions.map((option, index) => {
                                        const definitionLength = option.text.trim().length;
                                        return (
                                          <SelectItem
                                            key={`${option.opredId ?? "custom"}:${option.text}`}
                                            value={String(index)}
                                          >
                                            <div className="flex w-full items-center gap-2 pr-1">
                                              <span className="min-w-0 flex-1 truncate leading-snug">
                                                {option.text}
                                              </span>
                                              <div className="ml-auto flex items-center gap-1">
                                                <Badge
                                                  variant="secondary"
                                                  size="sm"
                                                  className="px-1.5 text-[10px] font-normal"
                                                  title={t("scanwordsReviewDefinitionLen", {
                                                    count: definitionLength,
                                                  })}
                                                >
                                                  {t("scanwordsReviewLength", { count: definitionLength })}
                                                </Badge>
                                                {Number.isFinite(option.difficulty as number) && (
                                                  <Badge
                                                    variant="outline"
                                                    size="sm"
                                                    className="px-1.5 text-[10px] font-normal"
                                                  >
                                                    {`${t("difficultyFilterLabel")} ${option.difficulty}`}
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-8 shrink-0"
                                    onClick={() => {
                                      if (!row.wordId) return;
                                      const existing = row.definitionOptions.map((option, index) => ({
                                        id: option.opredId ?? `custom-${slot.slotId}-${index}`,
                                        text: option.text,
                                        ...(templateLang ? { lang: templateLang } : {}),
                                      }));
                                      setDefinitionCreateTarget({
                                        templateKey: selectedTemplate.key,
                                        slotId: slot.slotId,
                                        wordId: row.wordId,
                                        word: row.word,
                                        language: selectedTemplate.language,
                                        existing,
                                      });
                                    }}
                                    disabled={!row.wordId}
                                    aria-label={t("addDefinition")}
                                  >
                                    <CirclePlus className="size-4" aria-hidden />
                                    <span className="sr-only">{t("addDefinition")}</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-8 shrink-0"
                                    onClick={() => {
                                      if (!row.opredId || !row.wordId) return;
                                      setDefinitionEditTarget({
                                        templateKey: selectedTemplate.key,
                                        slotId: slot.slotId,
                                        wordId: row.wordId,
                                        opredId: row.opredId,
                                        definition: row.definition,
                                      });
                                    }}
                                    disabled={!row.opredId || !row.wordId}
                                    aria-label={t("editDefinition")}
                                  >
                                    <SquarePen className="size-4" aria-hidden />
                                    <span className="sr-only">{t("editDefinition")}</span>
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <NewWordModal
          open={wordCreateTarget != null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setWordCreateTarget(null);
          }}
          languageOverride={wordCreateTarget?.language}
          wordConstraint={
            wordCreateTarget
              ? {
                  length: wordCreateTarget.length,
                  fixedLetters: wordCreateTarget.fixedLetters,
                }
              : undefined
          }
          onCreated={(payload) => {
            if (!wordCreateTarget) return;
            applyNewWord(wordCreateTarget, payload);
          }}
        />
        <AddDefinitionModal
          wordId={definitionCreateTarget?.wordId ?? ""}
          open={definitionCreateTarget != null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDefinitionCreateTarget(null);
          }}
          wordText={definitionCreateTarget?.word}
          existing={definitionCreateTarget?.existing}
          languageOverride={definitionCreateTarget?.language}
          onCreated={(payload) => {
            if (!definitionCreateTarget) return;
            applyAddedDefinitions(definitionCreateTarget, payload);
          }}
        />
        <EditDefinitionModal
          open={definitionEditTarget != null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDefinitionEditTarget(null);
          }}
          defId={definitionEditTarget?.opredId ?? ""}
          initialValue={definitionEditTarget?.definition ?? ""}
          pendingOnly
          onSaved={({ pendingCreated, text }) => {
            if (pendingCreated && definitionEditTarget) {
              applyEditedDefinition(definitionEditTarget, text);
              toast.success(t("definitionChangeQueued"));
            }
            setDefinitionEditTarget(null);
          }}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={finalizing || submitting}
          >
            {t("close")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={reviewLoading || !reviewData || finalizing || submitting}
          >
            {finalizing || submitting ? t("loading") : t("scanwordsReviewFinalize")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

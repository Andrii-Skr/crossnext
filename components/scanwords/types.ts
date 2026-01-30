export type Issue = {
  id: string;
  label: string;
  filterTemplateId: number | null;
  hidden: boolean;
};

export type Edition = {
  id: number;
  name: string;
  code: string;
  issues: Issue[];
  hidden: boolean;
};

export type ContextTarget =
  | { kind: "edition"; id: number; label: string; hidden: boolean }
  | { kind: "issue"; id: string; label: string; hidden: boolean };

export type DeleteTarget =
  | { kind: "edition"; id: number; label: string }
  | { kind: "issue"; id: string; label: string };

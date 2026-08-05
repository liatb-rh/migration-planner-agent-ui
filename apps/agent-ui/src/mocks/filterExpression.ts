/**
 * Mock implementation of the backend `byExpression` filter DSL (pkg/filter).
 *
 * Grammar (subset actually emitted by the UI — see vmFilters.ts / groupFilters.ts):
 *   expr       := andExpr (OR andExpr)*
 *   andExpr    := comparison (AND comparison)*
 *   comparison := '(' expr ')' | field op value
 *   field      := identifier ('.' identifier)*
 *   op         := '=' | '!=' | '>=' | '<=' | '>' | '<' | 'like' | 'in' | 'not in' | 'contains'
 *   value      := string | number | boolean | '[' value (',' value)* ']'
 */
import type { MockVm } from "./types";

type Token =
  | { type: "ident"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbracket" }
  | { type: "rbracket" }
  | { type: "comma" };

const KEYWORD_OPS = new Set(["and", "or", "in", "like", "contains", "not"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === "[") {
      tokens.push({ type: "lbracket" });
      i++;
      continue;
    }
    if (c === "]") {
      tokens.push({ type: "rbracket" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < n && input[j] !== quote) {
        if (input[j] === "\\" && j + 1 < n) {
          value += input[j + 1];
          j += 2;
          continue;
        }
        value += input[j];
        j++;
      }
      tokens.push({ type: "string", value });
      i = j + 1;
      continue;
    }
    if (c === "!" && input[i + 1] === "=") {
      tokens.push({ type: "op", value: "!=" });
      i += 2;
      continue;
    }
    if (c === ">" && input[i + 1] === "=") {
      tokens.push({ type: "op", value: ">=" });
      i += 2;
      continue;
    }
    if (c === "<" && input[i + 1] === "=") {
      tokens.push({ type: "op", value: "<=" });
      i += 2;
      continue;
    }
    if (c === "=") {
      tokens.push({ type: "op", value: "=" });
      i++;
      continue;
    }
    if (c === ">") {
      tokens.push({ type: "op", value: ">" });
      i++;
      continue;
    }
    if (c === "<") {
      tokens.push({ type: "op", value: "<" });
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      let j = i;
      if (input[j] === "-") j++;
      while (j < n && /[0-9.]/.test(input[j])) j++;
      tokens.push({ type: "number", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_0-9.]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z_0-9.]/.test(input[j])) j++;
      const word = input.slice(i, j);
      const lower = word.toLowerCase();
      if (lower === "true" || lower === "false") {
        tokens.push({ type: "bool", value: lower === "true" });
      } else if (KEYWORD_OPS.has(lower)) {
        tokens.push({ type: "op", value: lower });
      } else {
        tokens.push({ type: "ident", value: word });
      }
      i = j;
      continue;
    }
    // Unrecognized character — skip defensively rather than throwing.
    i++;
  }

  return tokens;
}

type FilterValue = string | number | boolean | Array<string | number>;

type Ast =
  | { kind: "and"; left: Ast; right: Ast }
  | { kind: "or"; left: Ast; right: Ast }
  | { kind: "not"; expr: Ast }
  | { kind: "compare"; field: string; op: string; value: FilterValue };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): Ast | null {
    if (this.tokens.length === 0) return null;
    const ast = this.parseOr();
    return ast;
  }

  private peekOp(value: string): boolean {
    const tok = this.peek();
    return tok?.type === "op" && tok.value === value;
  }

  private parseOr(): Ast {
    let left = this.parseAnd();
    while (this.peekOp("or")) {
      this.next();
      const right = this.parseAnd();
      left = { kind: "or", left, right };
    }
    return left;
  }

  private parseAnd(): Ast {
    let left = this.parseNot();
    while (this.peekOp("and")) {
      this.next();
      const right = this.parseNot();
      left = { kind: "and", left, right };
    }
    return left;
  }

  private parseNot(): Ast {
    if (this.peekOp("not")) {
      this.next();
      return { kind: "not", expr: this.parseNot() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Ast {
    const tok = this.peek();
    if (tok?.type === "lparen") {
      this.next();
      const inner = this.parseOr();
      if (this.peek()?.type === "rparen") this.next();
      return inner;
    }
    return this.parseComparison();
  }

  private parseValue(): FilterValue {
    const tok = this.next();
    if (!tok) return "";
    if (tok.type === "lbracket") {
      const values: Array<string | number> = [];
      while (this.peek() && this.peek()?.type !== "rbracket") {
        const item = this.next();
        if (item?.type === "string") values.push(item.value);
        else if (item?.type === "number") values.push(item.value);
        else if (item?.type === "ident") values.push(item.value);
        if (this.peek()?.type === "comma") this.next();
      }
      if (this.peek()?.type === "rbracket") this.next();
      return values;
    }
    if (tok.type === "string") return tok.value;
    if (tok.type === "number") return tok.value;
    if (tok.type === "bool") return tok.value;
    if (tok.type === "ident") return tok.value;
    return "";
  }

  private parseComparison(): Ast {
    const fieldTok = this.next();
    const field = fieldTok?.type === "ident" ? fieldTok.value : "";

    const opTok = this.next();
    let op = opTok?.type === "op" ? opTok.value : "=";
    if (op === "not" && this.peekOp("in")) {
      this.next();
      op = "not in";
    }

    const value = this.parseValue();
    return { kind: "compare", field, op, value };
  }
}

export function parseFilterExpression(expression: string): Ast | null {
  const tokens = tokenize(expression);
  return new Parser(tokens).parse();
}

type FieldResolver = (
  vm: MockVm,
) => string | number | boolean | string[] | undefined;

const FIELD_RESOLVERS: Record<string, FieldResolver> = {
  id: (vm) => vm.id,
  name: (vm) => vm.name,
  status: (vm) => vm.powerState,
  vCenterState: (vm) => vm.powerState,
  cluster: (vm) => vm.cluster,
  datacenter: (vm) => vm.datacenter,
  "net.network": (vm) => vm.networks,
  "concern.category": (vm) => vm.issues.map((issue) => issue.category),
  "concern.label": (vm) => vm.issues.map((issue) => issue.label),
  issues_count: (vm) => vm.issues.length,
  issueCount: (vm) => vm.issues.length,
  total_disk_capacity: (vm) => vm.diskSizeMB,
  diskSize: (vm) => vm.diskSizeMB,
  memory: (vm) => vm.memoryMB,
  "utilization.cpu_max": (vm) => vm.utilization?.cpu_max,
  "utilization.mem_max": (vm) => vm.utilization?.mem_max,
  "utilization.disk": (vm) => vm.utilization?.disk,
  "utilization.cpu_p95": (vm) => vm.utilization?.cpu_p95,
  "utilization.mem_p95": (vm) => vm.utilization?.mem_p95,
  labels: (vm) => vm.labels,
  groups: (vm) => vm.groups,
  application: (vm) => vm.applications,
  migratable: (vm) => vm.migratable,
  migration_excluded: (vm) => vm.migrationExcluded,
  migrationExcluded: (vm) => vm.migrationExcluded,
  template: (vm) => vm.template,
  "inspection.status": (vm) => vm.inspectionState ?? "none",
};

function toComparableString(value: string | number | boolean): string {
  return String(value).toLowerCase();
}

function evalCompare(
  vm: MockVm,
  field: string,
  op: string,
  value: FilterValue,
): boolean {
  const resolver = FIELD_RESOLVERS[field];
  const resolved = resolver ? resolver(vm) : undefined;

  if (op === "like") {
    if (typeof resolved !== "string" || typeof value !== "string") return false;
    return resolved.toLowerCase().includes(value.toLowerCase());
  }

  if (op === "contains") {
    if (!Array.isArray(resolved)) return false;
    return resolved.some(
      (item) => toComparableString(item) === toComparableString(String(value)),
    );
  }

  if (op === "in" || op === "not in") {
    const list = Array.isArray(value) ? value : [value];
    const listSet = new Set(list.map((item) => toComparableString(item)));
    let matches: boolean;
    if (Array.isArray(resolved)) {
      matches = resolved.some((item) => listSet.has(toComparableString(item)));
    } else if (resolved === undefined) {
      matches = false;
    } else {
      matches = listSet.has(toComparableString(resolved as string | number));
    }
    return op === "in" ? matches : !matches;
  }

  if (op === "=" || op === "!=") {
    let matches: boolean;
    if (Array.isArray(resolved)) {
      matches = resolved.some(
        (item) =>
          toComparableString(item) === toComparableString(String(value)),
      );
    } else if (typeof resolved === "boolean") {
      matches = resolved === Boolean(value);
    } else if (resolved === undefined) {
      matches = false;
    } else {
      matches =
        toComparableString(resolved as string | number) ===
        toComparableString(String(value));
    }
    return op === "=" ? matches : !matches;
  }

  if (op === ">=" || op === "<=" || op === ">" || op === "<") {
    const numResolved =
      typeof resolved === "number" ? resolved : Number(resolved);
    const numValue = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(numResolved) || Number.isNaN(numValue)) return false;
    if (op === ">=") return numResolved >= numValue;
    if (op === "<=") return numResolved <= numValue;
    if (op === ">") return numResolved > numValue;
    return numResolved < numValue;
  }

  return false;
}

function evalAst(vm: MockVm, ast: Ast): boolean {
  switch (ast.kind) {
    case "and":
      return evalAst(vm, ast.left) && evalAst(vm, ast.right);
    case "or":
      return evalAst(vm, ast.left) || evalAst(vm, ast.right);
    case "not":
      return !evalAst(vm, ast.expr);
    case "compare":
      return evalCompare(vm, ast.field, ast.op, ast.value);
    default:
      return true;
  }
}

/** Evaluate a `byExpression` filter string against a VM. Empty/invalid expressions match everything. */
export function matchesExpression(
  vm: MockVm,
  expression: string | undefined | null,
): boolean {
  if (!expression || !expression.trim()) return true;
  try {
    const ast = parseFilterExpression(expression);
    if (!ast) return true;
    return evalAst(vm, ast);
  } catch {
    return true;
  }
}

export function filterVms<T extends MockVm>(
  vms: T[],
  expression: string | undefined | null,
): T[] {
  return vms.filter((vm) => matchesExpression(vm, expression));
}

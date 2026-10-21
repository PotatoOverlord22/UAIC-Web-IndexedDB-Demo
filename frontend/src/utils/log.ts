const LABEL_STYLE = "background: #c8102e; color: #fff; border-radius: 3px; padding: 1px 6px; font-weight: 600";
const CODE_STYLE = "color: #6b6b72; font-family: ui-monospace, Menlo, monospace";

const logged = new Set<string>();

export function firstTime(kind: string): boolean {
  if (logged.has(kind)) return false;
  logged.add(kind);
  return true;
}

function format(message: string, code: string): string[] {
  return ["%cIndexedDB%c %s\n%c%s", LABEL_STYLE, "", message, CODE_STYLE, code.replace(/^/gm, "  ")];
}

export function logIndexedDb(message: string, code: string, ...values: unknown[]): void {
  console.log(...format(message, code), ...values);
}

export function warnIndexedDb(message: string, code: string, ...values: unknown[]): void {
  console.warn(...format(message, code), ...values);
}

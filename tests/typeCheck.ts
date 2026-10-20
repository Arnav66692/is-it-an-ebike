// Type-checks a short snippet against the project's own types, so a test can show that the
// compiler rejects a bad value. The snippet is never written to disk.

import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");

/** The compiler's error messages for `code`, checked as if it were a file in tests/. */
export function typeErrors(code: string): string[] {
  const configPath = join(ROOT, "tsconfig.json");
  const config = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const options: ts.CompilerOptions = { ...parsed.options, incremental: false, noEmit: true, plugins: [] };
  const file = join(ROOT, "tests", "__snippet__.ts");
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (p) => p === file || ts.sys.fileExists(p);
  host.readFile = (p) => (p === file ? code : readFile(p));
  host.getSourceFile = (p, lang, onError, fresh) =>
    p === file ? ts.createSourceFile(p, code, lang, true) : getSourceFile(p, lang, onError, fresh);
  const program = ts.createProgram([file], options, host);
  const source = program.getSourceFile(file);
  return ts.getPreEmitDiagnostics(program, source).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

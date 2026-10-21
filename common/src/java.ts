export interface JavaCatalog {
  platform: "windows" | "linux" | "mac";
  arch: "x64" | "arm64";
  versions: string[];
}

export interface PreparedJava {
  id: string;
  /** An executable path, or the managed-runtime placeholder. */
  path: string;
}

export function javaExecutableCommand(executable = "java") {
  return executable === "{mcsm_java}" ? executable : `"${executable || "java"}"`;
}

function javaCommandPrefix(command: string) {
  const first = /^(\s*)(?:"([^"]+)"|(\S+))/.exec(command);
  if (!first) return null;
  const name = (first[2] || first[3]).split(/[\\/]/).pop()!;
  return /^(?:java(?:\.exe)?|\{mcsm_java\})$/i.test(name) ? first : null;
}

export function isJavaCommand(command: string) {
  return javaCommandPrefix(command) !== null;
}

/** Replace only a Java executable, preserving quoted arguments and scripts. */
export function bindJavaCommand(command: string, executable: string) {
  const first = javaCommandPrefix(command);
  if (!first) return command;
  return first[1] + javaExecutableCommand(executable) + command.slice(first[0].length);
}

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

/** Replace only a Java executable, preserving quoted arguments and scripts. */
export function bindJavaCommand(command: string, executable: string) {
  const first = /^(\s*)(?:"([^"]+)"|(\S+))/.exec(command);
  if (!first) return command;
  const name = (first[2] || first[3]).split(/[\\/]/).pop()!;
  if (!/^(?:java(?:\.exe)?|\{mcsm_java\})$/i.test(name)) return command;
  return first[1] + javaExecutableCommand(executable) + command.slice(first[0].length);
}

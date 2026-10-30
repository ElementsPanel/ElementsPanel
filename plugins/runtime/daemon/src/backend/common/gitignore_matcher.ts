import path from "path";

export class GitignoreMatcher {
  private rules: { pattern: string; negate: boolean; dirOnly: boolean; anchored: boolean; hasSlash: boolean; regex: RegExp }[] = [];
  private whitelistMode: boolean;

  constructor(content: string, private baseDir: string, whitelistMode: boolean = false) {
    this.whitelistMode = whitelistMode;

    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) continue;

      let pattern = line;
      let negate = false;

      if (pattern.startsWith('!')) {
        negate = true;
        pattern = pattern.slice(1);
      }

      pattern = pattern.replace(/\s+$/, '');

      if (!pattern) continue;

      const dirOnly = pattern.endsWith('/');
      if (dirOnly) {
        pattern = pattern.slice(0, -1);
      }

      let anchored = false;
      if (pattern.startsWith('/')) {
        anchored = true;
        pattern = pattern.slice(1);
      }

      const hasSlash = pattern.includes('/');

      const regexStr = this.patternToRegex(pattern);
      const regex = new RegExp(`^${regexStr}$`);

      this.rules.push({ pattern, negate, dirOnly, anchored, hasSlash, regex });
    }
  }

  private patternToRegex(pattern: string): string {
    let result = '';
    let i = 0;
    while (i < pattern.length) {
      const ch = pattern[i];
      if (ch === '\\') {
        if (i + 1 < pattern.length) {
          result += '\\' + pattern[i + 1];
          i += 2;
        } else {
          result += '\\\\';
          i++;
        }
      } else if (ch === '*') {
        if (i + 1 < pattern.length && pattern[i + 1] === '*') {
          if (i + 2 < pattern.length && pattern[i + 2] === '/') {
            result += '(.*/)?';
            i += 3;
          } else {
            result += '.*';
            i += 2;
          }
        } else {
          result += '[^/]*';
          i++;
        }
      } else if (ch === '?') {
        result += '[^/]';
        i++;
      } else if (ch === '[') {
        let classEnd = i + 1;
        let escaped = false;
        while (classEnd < pattern.length) {
          if (pattern[classEnd] === '\\') {
            escaped = true;
            classEnd += 2;
            continue;
          }
          if (pattern[classEnd] === ']' && classEnd > i + 1) break;
          classEnd++;
        }
        const charClass = pattern.slice(i + 1, classEnd);
        result += '[' + charClass.replace(/[.+^${}()|]/g, '\\$&') + ']';
        i = (classEnd < pattern.length ? classEnd + 1 : classEnd);
      } else {
        result += ch.match(/[.+^${}()|\\]/) ? '\\' + ch : ch;
        i++;
      }
    }
    return result;
  }

  public isIgnored(filePath: string, isDirectory: boolean = false): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');

    let ignored = this.whitelistMode;

    for (const rule of this.rules) {
      if (rule.dirOnly && !isDirectory) continue;

      let testPath: string;

      if (rule.anchored) {
        testPath = normalizedPath;
      } else if (rule.hasSlash) {
        testPath = normalizedPath;
      } else {
        const basename = path.basename(normalizedPath);
        if (rule.regex.test(basename)) {
          ignored = this.whitelistMode ? rule.negate : !rule.negate;
          continue;
        }
        testPath = normalizedPath;
      }

      if (rule.regex.test(testPath)) {
        ignored = this.whitelistMode ? rule.negate : !rule.negate;
      }
    }

    return ignored;
  }

  public isWhitelistMode(): boolean {
    return this.whitelistMode;
  }

  public getRules(): { pattern: string; negate: boolean; dirOnly: boolean; anchored: boolean }[] {
    return this.rules.map(r => ({
      pattern: r.pattern,
      negate: r.negate,
      dirOnly: r.dirOnly,
      anchored: r.anchored
    }));
  }
}

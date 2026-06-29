export interface LanguageRule {
  supportedExtensions: string[];
  importantKeywords: string[];
  blockSelectors: RegExp;
}

export class LanguageConfig {
  private static rules: Record<string, LanguageRule> = {
    typescript: {
      supportedExtensions: [".ts", ".tsx"],
      importantKeywords: [
        "class",
        "interface",
        "function",
        "async",
        "export",
        "import",
      ],
      blockSelectors:
        /(function\s+\w+|class\s+\w+|interface\s+\w+|async\s+function)/g,
    },
    javascript: {
      supportedExtensions: [".js", ".jsx"],
      importantKeywords: ["class", "function", "const", "let", "async"],
      blockSelectors: /(function\s+\w+|class\s+\w+|async\s+function)/g,
    },
    python: {
      supportedExtensions: [".py"],
      importantKeywords: ["def", "class", "import", "from", "async"],
      blockSelectors: /(def\s+\w+|class\s+\w+)/g,
    },
  };

  public static getRuleForLanguage(
    languageId: string,
  ): LanguageRule | undefined {
    return this.rules[languageId.toLowerCase()];
  }

  public static isSupported(languageId: string): boolean {
    return languageId.toLowerCase() in this.rules;
  }
}

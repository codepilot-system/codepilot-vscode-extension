import * as crypto from "crypto";
import { LanguageConfig } from "../config/LanguageConfig";

export interface AstNodeContext {
  type: string;
  name: string;
  startLine: number;
  endLine: number;
  contentCheckSum: string;
}

export interface ExtractedAstPayload {
  languageId: string;
  totalLines: number;
  nodes: AstNodeContext[];
  globalFingerprint: string;
}

export class AstContextExtractor {
  /**
   * Extracts structural AST nodes and computes precise cryptographic fingerprints.
   */
  public static extractContext(
    content: string,
    languageId: string,
  ): ExtractedAstPayload {
    const lines = content.split(/\r?\n/);
    const nodes: AstNodeContext[] = [];
    const rule = LanguageConfig.getRuleForLanguage(languageId);

    if (!rule) {
      // Fallback unique hash if language is not explicitly configured
      const globalHash = crypto
        .createHash("sha256")
        .update(content, "utf8")
        .digest("hex");
      return {
        languageId,
        totalLines: lines.length,
        nodes: [],
        globalFingerprint: globalHash,
      };
    }

    // Basic Lexical Structural Block Parsing Simulation
    lines.forEach((line, index) => {
      rule.blockSelectors.lastIndex = 0; // Reset regex state
      const match = rule.blockSelectors.exec(line);

      if (match) {
        const declaration = match[0];
        const parts = declaration.split(/\s+/);
        const nodeType = parts[0] === "async" ? "async_function" : parts[0];
        const nodeName = parts[parts.length - 1] || `anonymous_block_${index}`;

        // Create localized block checksum context
        const blockContent = lines.slice(index, index + 15).join("\n"); // Look ahead window
        const nodeHash = crypto
          .createHash("sha256")
          .update(blockContent, "utf8")
          .digest("hex");

        nodes.push({
          type: nodeType,
          name: nodeName,
          startLine: index + 1,
          endLine: Math.min(index + 15, lines.length),
          contentCheckSum: nodeHash,
        });
      }
    });

    // Generate the global structural fingerprint
    const combinedStructureString = nodes
      .map((n) => n.contentCheckSum)
      .join("-");
    const globalFingerprint = crypto
      .createHash("sha256")
      .update(combinedStructureString || content, "utf8")
      .digest("hex");

    return {
      languageId,
      totalLines: lines.length,
      nodes,
      globalFingerprint,
    };
  }
}

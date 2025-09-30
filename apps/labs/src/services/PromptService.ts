import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import Handlebars from "handlebars";

export class PromptService {
  private readonly promptsDir: string;

  constructor() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    this.promptsDir = path.resolve(here, "../../prompts");

    // Register common helpers used in prompt templates
    Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper("ne", (a: unknown, b: unknown) => a !== b);
    Handlebars.registerHelper("json", (ctx: unknown) =>
      JSON.stringify(ctx, null, 2),
    );
  }

  async load(name: string): Promise<string> {
    const filePath = path.resolve(this.promptsDir, `${name}.md`);
    try {
      const buf = await fs.readFile(filePath);
      return buf.toString("utf8");
    } catch (err) {
      throw new Error(`Prompt not found: ${name} (${filePath})`);
    }
  }

  async render(name: string, data?: Record<string, unknown>): Promise<string> {
    const raw = await this.load(name);
    const tmpl = Handlebars.compile(raw, { noEscape: true });
    return tmpl(data ?? {});
  }
}

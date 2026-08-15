import type { PipelineStep } from "@ai-book/shared";
import type { GeminiClient } from "./client.js";

interface FakeGeminiClientOptions {
  delayMs?: number;
  failStep?: PipelineStep;
}

const MOCK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlKpZkAAAAASUVORK5CYII=",
  "base64",
);

function configuredDelay() {
  const value = Number(process.env.MOCK_GEMINI_DELAY_MS ?? 750);
  return Number.isFinite(value) && value >= 0 ? value : 750;
}

function configuredFailure(): PipelineStep | undefined {
  const value = process.env.MOCK_GEMINI_FAIL_STEP;
  if (
    value === "style" ||
    value === "characters" ||
    value === "portraits" ||
    value === "chapters" ||
    value === "illustrations"
  ) {
    return value;
  }
  return undefined;
}

export function createFakeGeminiClient(
  options: FakeGeminiClientOptions = {},
): GeminiClient {
  const delayMs = options.delayMs ?? configuredDelay();
  const failStep = options.failStep ?? configuredFailure();

  async function complete(step: PipelineStep) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (failStep === step) {
      throw new Error(`Mock Gemini failure for ${step}.`);
    }
  }

  return {
    async generateStyle(_bookPath, customStyle) {
      await complete("style");
      return customStyle?.trim() || "Luminous watercolor storybook art with ink details";
    },

    async generateCharacters() {
      await complete("characters");
      return [
        {
          name: "Rowan Vale",
          prompt:
            "An adult river keeper in a moss-green coat, weathered boots, and a soft felt hat, with a calm observant expression and practical field tools.",
        },
        {
          name: "Mira Bell",
          prompt:
            "An adult naturalist carrying a leather journal and brass compass, dressed in a rust-red jacket, with thoughtful eyes and an adventurous bearing.",
        },
      ];
    },

    async generatePortrait() {
      await complete("portraits");
      return Buffer.from(MOCK_PNG);
    },

    async generateChapters() {
      await complete("chapters");
      return [
        {
          title: "Lanterns on the River",
          prompt:
            "At twilight, Rowan and Mira guide a small wooden boat through reeds while warm lantern light reflects across the river and a distant storm gathers.",
        },
      ];
    },

    async generateIllustration() {
      await complete("illustrations");
      return Buffer.from(MOCK_PNG);
    },
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { redact } from '../domain';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  enabled(): boolean {
    return config.openRouterKey.length > 0;
  }

  async complete(system: string, user: string, secrets: string[] = []): Promise<string | null> {
    if (!this.enabled()) return null;
    const safeUser = redact(user, secrets);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.openRouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.openRouterModel,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: safeUser },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        this.logger.warn(`OpenRouter returned ${response.status}`);
        return null;
      }
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      this.logger.warn(`OpenRouter request failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  async json<T>(system: string, user: string, secrets: string[] = []): Promise<T | null> {
    const text = await this.complete(`${system}\nReply with JSON only.`, user, secrets);
    if (!text) return null;
    const stripped = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '');
    try {
      return JSON.parse(stripped) as T;
    } catch {
      return null;
    }
  }
}

import { claudeProvider } from '../adapters/claude';
import { codexProvider } from '../adapters/codex';
import type { readConfig } from './config';
type LiveConfig = Extract<ReturnType<typeof readConfig>, { mode: 'live' }>;
export function modelProvider(config: LiveConfig) {
  return config.provider === 'codex'
    ? codexProvider({ model: config.CODEX_MODEL, effort: config.CODEX_EFFORT })
    : claudeProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL);
}
export function modelId(config: LiveConfig) {
  return config.provider === 'codex'
    ? config.CODEX_MODEL
    : config.ANTHROPIC_MODEL;
}

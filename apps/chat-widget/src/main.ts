import './widget';
import { ChatWidget } from './widget';
import type { ChatWidgetConfig } from './widget';

export { ChatWidget };
export type { ChatWidgetConfig };

export function initializeChatWidget(config: ChatWidgetConfig): ChatWidget {
  let existing = document.querySelector('chat-widget') as ChatWidget | null;
  if (existing) {
    existing.apiUrl = config.apiUrl;
    existing.agent = config.agent;
    existing.threadParameters = config.parameters ?? null;
    if (config.theme) existing.theme = config.theme;
    if (config.position) existing.position = config.position;
    if (config.width) existing.width = config.width;
    if (config.height) existing.height = config.height;
    return existing;
  }

  const el = document.createElement('chat-widget') as ChatWidget;
  el.apiUrl = config.apiUrl;
  el.agent = config.agent;
  el.threadParameters = config.parameters ?? null;
  if (config.theme) el.theme = config.theme;
  if (config.position) el.position = config.position;
  if (config.width) el.width = config.width;
  if (config.height) el.height = config.height;
  document.body.appendChild(el);
  return el;
}

document.addEventListener('DOMContentLoaded', () => {
  const script = document.currentScript || document.querySelector('script[data-chat-widget]');
  if (!script) return;
  const paramsAttr = script.getAttribute('data-parameters');
  let parsedParams: Record<string, unknown> | undefined;
  if (paramsAttr) {
    try { parsedParams = JSON.parse(paramsAttr); } catch { /* ignore */ }
  }
  const config: ChatWidgetConfig = {
    apiUrl: script.getAttribute('data-api-url') || '',
    agent: script.getAttribute('data-agent') || '',
    parameters: parsedParams,
    theme: (script.getAttribute('data-theme') as any) || 'light',
    position: (script.getAttribute('data-position') as any) || 'bottom-right',
    width: parseInt(script.getAttribute('data-width') || '400', 10),
    height: parseInt(script.getAttribute('data-height') || '600', 10),
  };
  if (config.apiUrl && config.agent) initializeChatWidget(config);
});

declare global {
  interface Window {
    ChatWidget: typeof ChatWidget;
    initializeChatWidget: typeof initializeChatWidget;
  }
}

// @ts-expect-error attach globals for manual use
window.ChatWidget = customElements.get('chat-widget') || ChatWidget;
// @ts-expect-error attach globals for manual use
window.initializeChatWidget = initializeChatWidget;



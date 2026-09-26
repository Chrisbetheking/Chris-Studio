import type { AttachmentDraft, ProviderProfile, RoutingRule } from '../../app/types';

export interface RoutingDecision {
  profile: ProviderProfile;
  model: string;
  rule?: RoutingRule;
  reason: string;
}

export function routeAttachments(
  attachments: AttachmentDraft[],
  profiles: ProviderProfile[],
  rules: RoutingRule[],
  fallbackProfileId: string,
  language: 'en' | 'zh-CN',
): RoutingDecision | null {
  const available = profiles.filter((profile) => profile.enabled);
  const fallback = available.find((profile) => profile.id === fallbackProfileId) ?? available[0];
  if (!fallback) return null;
  const priorities = ['image', 'pdf', 'spreadsheet', 'code', 'document', 'text', 'unknown'] as const;
  const kind = priorities.find((candidate) => attachments.some((attachment) => attachment.kind === candidate));
  const rule = rules.find((item) => item.enabled && item.kind === kind)
    ?? rules.find((item) => item.enabled && item.kind === 'default');
  const profile = available.find((item) => item.id === rule?.providerProfileId) ?? fallback;
  return {
    profile,
    model: rule?.modelOverride?.trim() || profile.model,
    rule,
    reason: rule ? (language === 'zh-CN' ? rule.reasonZh : rule.reasonEn) : (language === 'zh-CN' ? '当前默认模型' : 'Current default model'),
  };
}

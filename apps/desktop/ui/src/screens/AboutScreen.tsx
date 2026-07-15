import type { Language } from '../app/types';
import { Icon } from '../components/Icon';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function AboutScreen({ language }: { language: Language }) {
  return (
    <main className="page-scroll about-page">
      <section className="about-hero">
        <div className="brand-mark large"><Icon name="shield" size={32} /></div>
        <span className="eyebrow">TOKENFENCE STUDIO 1.6.0</span>
        <h1>Safe AI Workspace</h1>
        <p>{copy(language, 'A local-first safety layer between your data and AI models.', '位于你的数据与 AI 模型之间的一道本地优先安全防线。')}</p>
      </section>
      <section className="about-grid">
        <article><Icon name="shield" /><h2>{copy(language, 'Review before send', '发送前审查')}</h2><p>{copy(language, 'Prompts and supported text files are scanned together before any provider request is approved.', '提示词与支持的文本文件会在 Provider 请求获批前统一扫描。')}</p></article>
        <article><Icon name="lock" /><h2>{copy(language, 'Local-first records', '本地优先记录')}</h2><p>{copy(language, 'History stores redacted prompts. Safety receipts keep metadata, not detected raw secrets.', '历史仅保存脱敏提示词；安全回执只保存元数据，不保存敏感原文。')}</p></article>
        <article><Icon name="server" /><h2>{copy(language, 'Explicit destination', '明确发送目标')}</h2><p>{copy(language, 'The selected Provider, model and connection state remain visible before every send.', '每次发送前都会明确展示 Provider、模型与连接状态。')}</p></article>
      </section>
      <section className="about-details">
        <div><span>{copy(language, 'Repository', '代码仓库')}</span><a href="https://github.com/Chrisbetheking/tokenfence-studio" target="_blank" rel="noreferrer">Chrisbetheking/tokenfence-studio</a></div>
        <div><span>License</span><strong>MIT</strong></div>
        <div><span>{copy(language, 'Runtime', '运行环境')}</span><strong>React + TypeScript + Tauri</strong></div>
        <div><span>{copy(language, 'Report an issue', '反馈问题')}</span><a href="https://github.com/Chrisbetheking/tokenfence-studio/issues" target="_blank" rel="noreferrer">GitHub Issues</a></div>
      </section>
    </main>
  );
}

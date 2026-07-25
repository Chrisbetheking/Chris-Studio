import { useMemo, useRef, useState } from 'react';
import type { AttachmentDraft, Language, KnowledgeSearchHit } from '../app/types';
import { clearKnowledgeIndex, loadKnowledgeIndex, loadSettings, saveKnowledgeIndex } from '../app/store';
import { processFile } from '../features/files/fileProcessor';
import { buildKnowledgeIndex, searchKnowledge } from '../features/files/knowledge';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

const processors = [
  { id: 'pdf', icon: 'fileText', name: 'PDF + OCR', formats: 'PDF', noteEn: 'Text layer first, scanned pages fall back to OCR', noteZh: '优先读取文本层，扫描页自动转 OCR' },
  { id: 'ocr', icon: 'scanText', name: 'Multilingual OCR', formats: 'PNG · JPG · WEBP', noteEn: 'English, Simplified Chinese or mixed recognition', noteZh: '支持英文、简体中文和中英混合识别' },
  { id: 'docx', icon: 'file', name: 'Document Reader', formats: 'DOCX', noteEn: 'Raw text extraction', noteZh: '提取文档原始文本' },
  { id: 'sheet', icon: 'table', name: 'Sheet Reader', formats: 'XLSX · XLS', noteEn: 'Every sheet converted to CSV context', noteZh: '每个工作表转换为 CSV 上下文' },
  { id: 'rag', icon: 'brain', name: 'Local RAG Index', formats: 'ALL TEXT', noteEn: 'Chunk and retrieve evidence without a cloud vector database', noteZh: '无需云端向量库，本地切分与证据检索' },
] as const;

export function FilesScreen({ language, onUseInWorkspace }: { language: Language; onUseInWorkspace: () => void }) {
  const [files, setFiles] = useState<AttachmentDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrLanguage, setOcrLanguage] = useState<'eng' | 'chi_sim' | 'eng+chi_sim'>('eng+chi_sim');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeSearchHit[]>([]);
  const [indexCount, setIndexCount] = useState(() => loadKnowledgeIndex().length);
  const input = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  const active = files.find((file) => file.id === activeId) ?? files[0];
  const totalTokens = useMemo(() => files.reduce((sum, file) => sum + Math.ceil(file.content.length / 4), 0), [files]);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const next: AttachmentDraft[] = [];
    for (const file of Array.from(list)) {
      try {
        next.push(await processFile(file, loadSettings().maxFileScanSize, setProgress, {
          ocrLanguage,
          ocrScannedPdf: true,
          maxPdfOcrPages: 16,
        }));
      } catch (error) {
        toast.show(error instanceof Error ? error.message : copy(language, 'File processing failed.', '文件处理失败。'), 'error');
      }
    }
    setFiles((current) => [...current, ...next]);
    if (next[0]) setActiveId(next[0].id);
    setBusy(false); setProgress(0);
  };

  const indexFiles = () => {
    if (!files.length) return toast.show(copy(language, 'Add files before building an index.', '请先添加文件再建立索引。'), 'warning');
    const chunks = buildKnowledgeIndex(files);
    saveKnowledgeIndex(chunks);
    setIndexCount(chunks.length);
    toast.show(copy(language, `Indexed ${chunks.length} local chunks.`, `已建立 ${chunks.length} 个本地知识块。`), 'success');
  };

  const search = () => {
    const result = searchKnowledge(loadKnowledgeIndex(), query, 8);
    setHits(result);
    if (!result.length) toast.show(copy(language, 'No matching local evidence found.', '没有找到匹配的本地证据。'), 'warning');
  };

  return <main className="modern-page files-page">
    <header className="compact-page-header"><div><span className="section-kicker">CONTEXT + LOCAL RAG</span><h1>{copy(language, 'Document intelligence', '文档智能')}</h1><p>{copy(language, 'Extract, OCR, index and retrieve files locally before any model request.', '在任何模型请求前，先在本地完成提取、OCR、索引与检索。')}</p></div><div className="header-actions"><select value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value as typeof ocrLanguage)}><option value="eng+chi_sim">中文 + English</option><option value="chi_sim">简体中文</option><option value="eng">English</option></select><button className="button primary" onClick={() => input.current?.click()}><Icon name="plus" />{copy(language, 'Add files', '添加文件')}</button><button className="button secondary" onClick={onUseInWorkspace}><Icon name="workspace" />{copy(language, 'Open workspace', '进入工作台')}</button></div></header>
    <input ref={input} hidden type="file" multiple accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.html,.css,.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp" onChange={(event) => { void add(event.target.files); event.currentTarget.value = ''; }} />
    <section className="processor-grid">{processors.map((processor) => <article key={processor.id}><span><Icon name={processor.icon} /></span><div><strong>{processor.name}</strong><small>{processor.formats}</small><p>{copy(language, processor.noteEn, processor.noteZh)}</p></div><em>{copy(language, 'Built in', '内置')}</em></article>)}</section>
    {busy && <div className="processing-banner"><Icon name="cpu" /><div><strong>{copy(language, 'Processing locally', '正在本地处理')}</strong><div><span style={{ width: `${Math.max(6, progress * 100)}%` }} /></div></div></div>}

    <section className="knowledge-toolbar"><div><Icon name="brain" /><span><strong>{copy(language, 'Local knowledge index', '本地知识索引')}</strong><small>{indexCount} chunks · {totalTokens} source tokens</small></span></div><button className="button secondary" onClick={indexFiles}>{copy(language, 'Index current files', '索引当前文件')}</button><button className="icon-button danger" onClick={() => { clearKnowledgeIndex(); setIndexCount(0); setHits([]); }}><Icon name="trash" /></button><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') search(); }} placeholder={copy(language, 'Search local evidence…', '搜索本地证据…')} /><button className="button primary" onClick={search}><Icon name="search" />{copy(language, 'Retrieve', '检索')}</button></section>
    {hits.length > 0 && <section className="knowledge-results">{hits.map((hit) => <article key={hit.chunk.id}><header><strong>{hit.chunk.sourceName}</strong><span>{hit.score.toFixed(2)}</span></header><p>{hit.chunk.text.slice(0, 420)}</p></article>)}</section>}

    <div className="file-workbench">
      <aside><div className="panel-title"><span>{copy(language, 'Processed files', '已处理文件')}</span><small>{files.length}</small></div>{files.length ? files.map((file) => <button key={file.id} className={active?.id === file.id ? 'selected' : ''} onClick={() => setActiveId(file.id)}><Icon name={file.kind === 'image' ? 'image' : file.kind === 'spreadsheet' ? 'table' : file.kind === 'code' ? 'code' : 'file'} /><span><strong>{file.name}</strong><small>{file.processor} · {Math.ceil(file.content.length / 4)} tokens</small></span></button>) : <div className="file-empty-small"><Icon name="folder" /><p>{copy(language, 'Add a supported file to test the local pipeline.', '添加支持的文件来测试本地处理链路。')}</p></div>}</aside>
      <section>{active ? <><header><div><span className="file-kind-pill">{active.kind}</span><h2>{active.name}</h2><p>{active.processor} · {(active.size / 1024).toFixed(1)} KB {active.pageCount ? `· ${active.pageCount} pages` : ''} {active.ocrLanguage ? `· OCR ${active.ocrLanguage}` : ''}</p></div><button className="icon-button danger" onClick={() => { setFiles((current) => current.filter((file) => file.id !== active.id)); setActiveId(null); }}><Icon name="trash" /></button></header>{active.warnings?.map((warning) => <div className="inline-alert warning" key={warning}><Icon name="alert" />{warning}</div>)}<pre className="file-preview">{active.content || copy(language, 'No text extracted.', '未提取到文本。')}</pre></> : <div className="file-preview-empty"><Icon name="fileText" size={34} /><h2>{copy(language, 'Preview extracted context', '预览提取后的上下文')}</h2><p>{copy(language, 'The original file stays on your device. Only the reviewed extracted text can be sent to a provider.', '原文件保留在你的设备上，只有经过审查的提取文本才可发送给模型。')}</p></div>}</section>
    </div>
  </main>;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { isEqual } from 'lodash';
import * as fuzz from 'fuzzball';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Highlighter, ArrowLeftRight, Upload, Folder, Trash2, Download, 
  FileText, CheckCircle, Menu, X, Bold, Italic, Underline, 
  RefreshCw, Link as LinkIcon, Layers, Layout, Info, ChevronLeft,
  ChevronRight, Settings, Save, History, Search, Type, Maximize2,
  MoreVertical, Command, MousePointer2, Undo2, ListChecks, Minus, Plus
} from 'lucide-react';
import { ProcessedFile, TabId, ReviewItem } from './types';
import { EMBEDDED_SOURCES } from './embeddedSources';

// --- Components ---

const IconButton = ({ icon: Icon, onClick, active, disabled, title, variant = 'ghost' }: any) => {
  const variants: any = {
    ghost: 'hover:bg-slate-100 text-slate-600',
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100',
    danger: 'hover:bg-red-50 text-red-500',
    outline: 'border border-slate-200 hover:bg-slate-50 text-slate-600'
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-30 ${variants[variant]} ${active ? 'bg-blue-50 text-blue-600' : ''}`}
    >
      <Icon size={20} />
    </button>
  );
};

const ToolCard = ({ title, description, icon: Icon, onClick, color = "blue" }: any) => (
  <button 
    onClick={onClick}
    className="group w-full p-4 bg-white border border-slate-200 rounded-2xl text-right transition-all hover:border-blue-400 hover:shadow-md active:scale-[0.98]"
  >
    <div className="flex items-start gap-4">
      <div className={`p-3 rounded-xl bg-${color}-50 text-${color}-600 group-hover:bg-${color}-600 group-hover:text-white transition-colors`}>
        <Icon size={20} />
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-black text-slate-800 mb-1">{title}</h4>
        <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  </button>
);

const Modal = ({ isOpen, onClose, title, icon: Icon, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden border border-white/20"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Icon size={20} />
            </div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">{title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [loadedFiles, setLoadedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [history, setHistory] = useState<ProcessedFile[][]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('preview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [terminatorChar, setTerminatorChar] = useState('.:-');
  const [generateLinks, setGenerateLinks] = useState(true);
  const [currentLine, setCurrentLine] = useState(1);
  
  // Review States
  const [reviewHeaders, setReviewHeaders] = useState<string[]>([]);
  const [currentHeaderIdx, setCurrentHeaderIdx] = useState(0);
  const [reviewGroups, setReviewGroups] = useState<Record<string, { fileIdx: number, pIdx: number, text: string }[]>>({});
  const [currentReviewBatch, setCurrentReviewBatch] = useState<ReviewItem[]>([]);
  const [sourceSections, setSourceSections] = useState<{ header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[]>([]);

  // Highlighting States
  const sources = Object.keys(EMBEDDED_SOURCES);
  const [selectedSource, setSelectedSource] = useState<string>(sources[0] || '');
  const [localSource, setLocalSource] = useState<string>('');

  const activeSourceContent = localSource || EMBEDDED_SOURCES[selectedSource] || '';
  const currentFile = loadedFiles[previewIdx];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      if (prev.length > 0 && isEqual(prev[0], loadedFiles)) return prev;
      return [loadedFiles, ...prev].slice(0, 20);
    });
  }, [loadedFiles]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    pushToHistory();
    const newFiles: ProcessedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const content = await f.text();
      newFiles.push({ name: f.name.replace(/\.[^/.]+$/, ""), content, originalName: f.name });
    }
    setLoadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleContentChange = (newContent: string) => {
    const nextFiles = [...loadedFiles];
    if (nextFiles[previewIdx]) {
      nextFiles[previewIdx] = { ...nextFiles[previewIdx], content: newContent };
      setLoadedFiles(nextFiles);
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const previousState = history[0];
    setHistory(history.slice(1));
    setLoadedFiles(previousState);
  };

  const insertTag = (openTag: string, closeTag: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    pushToHistory();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const replacement = `${openTag}${text.substring(start, end)}${closeTag}`;
    handleContentChange(text.substring(0, start) + replacement + text.substring(end));
  };

  const normalize = (text: string, isHeader: boolean = false) => {
    if (!text) return '';
    let processed = text.replace(/[\u0591-\u05C7]/g, '');
    if (!isHeader) processed = processed.replace(/[.,:;?!\-()]/g, ' ');
    return processed.split(/\s+/).map(word => !isHeader ? word.replace(/[וי]/g, '') : word).join(' ').replace(/\s+/g, ' ').trim();
  };

  const processWithRegex = () => {
    if (loadedFiles.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    setTimeout(async () => {
      pushToHistory();
      const regex = new RegExp(`^([^${terminatorChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]*[${terminatorChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}])`);
      const nextFiles = loadedFiles.map((f, i) => {
        setProcessingProgress(Math.round((i / loadedFiles.length) * 100));
        return { ...f, content: f.content.split('\n').map(p => {
          const match = p.match(regex);
          return match ? `<b>${match[1]}</b>${p.substring(match[1].length)}` : p;
        }).join('\n') };
      });
      setLoadedFiles(nextFiles);
      setIsModalOpen(false);
      setIsProcessing(false);
    }, 100);
  };

  const processWithFuzzy = (mode: 'auto' | 'review' = 'auto') => {
    if (!activeSourceContent || loadedFiles.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    
    setTimeout(async () => {
      if (mode === 'auto') pushToHistory();
      const explode = (text: string, startLine: number) => {
        return text.split('\n').flatMap((line, i) => {
          const words = normalize(line.replace(/<[^>]*>/g, '')).split(/\s+/).filter(w => w.length > 0);
          return words.flatMap(w => w.includes('"') ? w.replace(/"/g, '').split('').map(char => ({ text: char, lineIdx: startLine + i })) : [{ text: w, lineIdx: startLine + i }]);
        });
      };

      const sections: any[] = [];
      const headerRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
      let match, currentHierarchy: string[] = [];
      let lastIndex = 0;

      while ((match = headerRegex.exec(activeSourceContent)) !== null) {
        if (sections.length === 0 && match.index > 0) sections.push({ header: "_initial_", fullHeader: "", words: explode(activeSourceContent.substring(0, match.index), 1) });
        const level = parseInt(match[1]);
        const rawHeader = match[2].replace(/<[^>]*>/g, '').trim();
        currentHierarchy[level - 1] = rawHeader;
        for (let i = level; i < 6; i++) currentHierarchy[i] = '';
        const start = headerRegex.lastIndex;
        const nextMatch = headerRegex.exec(activeSourceContent);
        const end = nextMatch ? nextMatch.index : activeSourceContent.length;
        headerRegex.lastIndex = nextMatch ? nextMatch.index - nextMatch[0].length : activeSourceContent.length;
        sections.push({ header: normalize(rawHeader, true), fullHeader: currentHierarchy.filter(h => h).join(' '), words: explode(activeSourceContent.substring(start, end), activeSourceContent.substring(0, match.index).split('\n').length + 1) });
        if (!nextMatch) break;
      }
      if (sections.length === 0) sections.push({ header: "_initial_", fullHeader: "", words: explode(activeSourceContent, 1) });
      setSourceSections(sections);

      if (mode === 'review') {
        const groups: Record<string, any[]> = { "_initial_": [] };
        const headersOrder = ["_initial_"];
        loadedFiles.forEach((f, fileIdx) => {
          let currentHeader = "_initial_";
          f.content.split('\n').forEach((p, pIdx) => {
            const hMatch = p.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
            if (hMatch) {
              currentHeader = normalize(hMatch[1].replace(/<[^>]*>/g, ''), true);
              if (!groups[currentHeader]) { groups[currentHeader] = []; headersOrder.push(currentHeader); }
            } else if (p.trim()) groups[currentHeader].push({ fileIdx, pIdx, text: p });
          });
        });
        const finalHeaders = headersOrder.filter(h => groups[h].length > 0);
        setReviewGroups(groups); setReviewHeaders(finalHeaders); setCurrentHeaderIdx(0);
        if (finalHeaders.length > 0) processHeaderGroup(0, groups, finalHeaders, sections);
        else setIsProcessing(false);
      } else {
        const nextFiles = loadedFiles.map((f, fileIdx) => {
          setProcessingProgress(Math.round((fileIdx / loadedFiles.length) * 100));
          let currentSection = sections[0], lastMatchIdx = 0, fileLinks: any[] = [];
          const newContent = f.content.split('\n').map((p, pIdx) => {
            const hMatch = p.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
            if (hMatch) {
              const match = sections.find(s => s.header === normalize(hMatch[1].replace(/<[^>]*>/g, ''), true));
              if (match) { currentSection = match; lastMatchIdx = 0; }
              return p;
            }
            const words = p.replace(/<[^>]*>/g, '').split(/\s+/);
            let bestIdx = -1, maxMatch = 0, bestScore = -Infinity;
            for (let j = 0; j < currentSection.words.length; j++) {
              let matchCount = 0;
              for (let k = 0; k < words.length; k++) {
                if (j + k >= currentSection.words.length) break;
                if (fuzz.ratio(normalize(words[k]), normalize(currentSection.words[j + k].text)) >= 85) matchCount++; else break;
              }
              if (matchCount > 0) {
                let score = matchCount - (Math.abs(j - lastMatchIdx) * 0.005);
                if (score > bestScore) { bestScore = score; bestIdx = j; maxMatch = matchCount; }
              }
            }
            if (maxMatch >= 1) {
              if (maxMatch < words.length && ["כו'", "וכו'"].includes(words[maxMatch].replace(/[.,:;?!]/g, ''))) maxMatch++;
              const lineIdx = currentSection.words[bestIdx].lineIdx;
              if (generateLinks) fileLinks.push({ line_index_1: pIdx + 1, line_index_2: lineIdx, heRef_2: currentSection.fullHeader, path_2: selectedSource + ".txt", "Conection Type": "commentary" });
              lastMatchIdx = bestIdx + maxMatch;
              let wordCount = -1, inWord = false, endPos = 0, inTag = false;
              for (let i = 0; i < p.length; i++) {
                if (p[i] === '<') inTag = true;
                if (!inTag) { if (/\S/.test(p[i]) && !inWord) { inWord = true; wordCount++; } else if (/\s/.test(p[i])) inWord = false; }
                if (wordCount < maxMatch) endPos = i + 1; else break;
                if (p[i] === '>') inTag = false;
              }
              while (endPos < p.length && /[.:\-]/.test(p[endPos])) endPos++;
              return `<b>${p.substring(0, endPos)}</b>${p.substring(endPos)}`;
            }
            return p;
          }).join('\n');
          return { ...f, content: newContent, links: generateLinks ? fileLinks : undefined };
        });
        setLoadedFiles(nextFiles); setIsModalOpen(false); setIsProcessing(false);
      }
    }, 100);
  };

  const processHeaderGroup = async (idx: number, groups: any, headers: string[], sections: any) => {
    const header = headers[idx], paragraphs = groups[header], section = sections.find((s:any) => s.header === header) || sections[0];
    const batch: ReviewItem[] = [], lastIndices: Record<number, number> = {};
    paragraphs.forEach((item: any) => {
      const words = item.text.replace(/<[^>]*>/g, '').split(/\s+/), lastIdx = lastIndices[item.fileIdx] || 0;
      let bestIdx = -1, maxMatch = 0, bestScore = -Infinity;
      for (let j = 0; j < section.words.length; j++) {
        let matchCount = 0;
        for (let k = 0; k < words.length; k++) {
          if (j + k >= section.words.length) break;
          if (fuzz.ratio(normalize(words[k]), normalize(section.words[j + k].text)) >= 85) matchCount++; else break;
        }
        if (matchCount > 0) {
          let score = matchCount - (Math.abs(j - lastIdx) * 0.005);
          if (score > bestScore) { bestScore = score; bestIdx = j; maxMatch = matchCount; }
        }
      }
      if (maxMatch >= 1) {
        if (maxMatch < words.length && ["כו'", "וכו'"].includes(words[maxMatch].replace(/[.,:;?!]/g, ''))) maxMatch++;
        lastIndices[item.fileIdx] = bestIdx + maxMatch;
        batch.push({
          fileIdx: item.fileIdx, paragraphIdx: item.pIdx, originalText: item.text,
          sourceText: section.words.slice(bestIdx, bestIdx + maxMatch).map((w:any) => w.text).join(' '),
          sourceContext: section.words.slice(bestIdx + maxMatch, bestIdx + maxMatch + 5).map((w:any) => w.text).join(' '),
          explodedWordCount: maxMatch, wordMap: [], originalWords: words, headerText: header, fullHeader: section.fullHeader, sourceLineIndex: section.words[bestIdx].lineIdx
        });
      }
    });
    setCurrentReviewBatch(batch); setActiveTab('review'); setIsProcessing(false);
  };

  const applyReviewBatch = () => {
    pushToHistory();
    const nextFiles = [...loadedFiles];
    currentReviewBatch.forEach(item => {
      const f = nextFiles[item.fileIdx], paragraphs = f.content.split('\n'), p = item.originalText;
      let wordCount = -1, inWord = false, endPos = 0, inTag = false;
      for (let i = 0; i < p.length; i++) {
        if (p[i] === '<') inTag = true;
        if (!inTag) { if (/\S/.test(p[i]) && !inWord) { inWord = true; wordCount++; } else if (/\s/.test(p[i])) inWord = false; }
        if (wordCount < item.explodedWordCount) endPos = i + 1; else break;
        if (p[i] === '>') inTag = false;
      }
      while (endPos < p.length && /[.:\-]/.test(p[endPos])) endPos++;
      paragraphs[item.paragraphIdx] = `<b>${p.substring(0, endPos)}</b>${p.substring(endPos)}`;
      if (generateLinks) {
        if (!f.links) f.links = [];
        f.links.push({ line_index_1: item.paragraphIdx + 1, line_index_2: item.sourceLineIndex, heRef_2: item.fullHeader, path_2: selectedSource + ".txt", "Conection Type": "commentary" });
      }
      nextFiles[item.fileIdx] = { ...f, content: paragraphs.join('\n') };
    });
    setLoadedFiles(nextFiles);
    const nextIdx = currentHeaderIdx + 1;
    if (nextIdx < reviewHeaders.length) {
      setCurrentHeaderIdx(nextIdx); setIsProcessing(true);
      setTimeout(() => processHeaderGroup(nextIdx, reviewGroups, reviewHeaders, sourceSections), 100);
    } else {
      setActiveTab('preview'); setReviewGroups({}); setReviewHeaders([]); setCurrentReviewBatch([]);
    }
  };

  const downloadAll = async () => {
    if (loadedFiles.length === 0) return;
    const zip = new JSZip();
    loadedFiles.forEach(f => {
      zip.file(`${f.name}.txt`, f.content);
      if (f.links?.length) zip.file(`${f.name}_links.json`, JSON.stringify(f.links, null, 2));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `TextFlow_${new Date().toISOString().split('T')[0]}.zip`; a.click();
  };

  const previewHeaders = React.useMemo(() => {
    if (!currentFile?.content) return [];
    const headers: any[] = [], regex = /<(h[1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    let match; while ((match = regex.exec(currentFile.content)) !== null) headers.push({ tagName: match[1].toUpperCase(), textContent: match[2].replace(/<[^>]*>/g, ''), startIndex: match.index, length: match[0].length });
    return headers;
  }, [currentFile?.content]);

  const scrollToHeader = useCallback((start: number, len: number) => {
    const el = textareaRef.current; if (!el) return;
    el.focus(); el.setSelectionRange(start, start + len);
    setTimeout(() => { el.setSelectionRange(start, start); el.blur(); el.focus(); }, 0);
  }, []);

  const handleCursorMove = () => {
    if (!textareaRef.current) return;
    setCurrentLine(textareaRef.current.value.substring(0, textareaRef.current.selectionStart).split('\n').length);
  };

  const currentLineLinks = React.useMemo(() => {
    return currentFile?.links?.filter(l => l.line_index_1 === currentLine) || [];
  }, [currentFile?.links, currentLine]);

  const currentBreadcrumb = React.useMemo(() => {
    if (!currentFile) return "";
    const lastHeader = previewHeaders.filter(h => h.startIndex < (textareaRef.current?.selectionStart || 0)).pop();
    return lastHeader ? lastHeader.textContent : "תחילת הקובץ";
  }, [currentFile, currentLine, previewHeaders]);

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans selection:bg-blue-100 selection:text-blue-900 text-slate-900" dir="rtl">
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-xl"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-8">
              <RefreshCw size={48} className="text-blue-600" />
            </motion.div>
            <h2 className="text-xl font-black mb-4 tracking-tight">מעבד נתונים...</h2>
            <div className="w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div className="h-full bg-blue-600" initial={{ width: 0 }} animate={{ width: `${processingProgress}%` }} />
            </div>
            <div className="mt-4 text-sm font-black text-blue-600">{processingProgress}%</div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <input ref={folderInputRef} type="file" {...({ webkitdirectory: "", directory: "" } as any)} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {/* Sidebar - Right */}
      <aside className={`bg-white border-l border-slate-200 transition-all duration-500 flex flex-col z-30 shadow-2xl shadow-slate-200/50 ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <div className="p-8 flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl text-white shadow-xl shadow-blue-200">
            <Highlighter size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">TextFlow</h1>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Pro Edition</span>
          </div>
        </div>
        
        <div className="flex-1 p-6 space-y-8 overflow-y-auto">
          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">פעולות חכמות</h3>
            <div className="space-y-3">
              <ToolCard 
                title="הדגשת תוי סיום" 
                description="הדגשה אוטומטית עד לתו סיום מוגדר (. או :)"
                icon={Type}
                onClick={() => { setActiveTab('highlight_regex'); setIsModalOpen(true); }}
              />
              <ToolCard 
                title="הדגשת השוואה" 
                description="הדגשה חכמה מול טקסט מקור (דיבור המתחיל)"
                icon={ArrowLeftRight}
                color="indigo"
                onClick={() => { setActiveTab('highlight_fuzzy'); setIsModalOpen(true); }}
              />
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">ניהול קבצים ({loadedFiles.length})</h3>
            <div className="space-y-2">
              {loadedFiles.map((f, i) => (
                <button 
                  key={i} 
                  onClick={() => setPreviewIdx(i)}
                  className={`w-full text-right px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${previewIdx === i ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <FileText size={14} className={previewIdx === i ? 'text-blue-600' : 'text-slate-300'} />
                  <span className="truncate flex-1">{f.name}</span>
                  {f.links?.length ? <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{f.links.length}</span> : null}
                </button>
              ))}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-blue-600 hover:bg-blue-50 transition-all text-xs font-black border border-dashed border-blue-200 mt-4"
              >
                <Upload size={14} />
                הוסף קבצים...
              </button>
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <button 
            disabled={loadedFiles.length === 0}
            onClick={downloadAll}
            className="w-full flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-20"
          >
            <Download size={18} />
            ייצוא ZIP סופי
          </button>
        </div>
      </aside>

      {/* Main Content - Center */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-white">
        <header className="px-10 py-6 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-6">
            <IconButton icon={isSidebarOpen ? ChevronRight : Menu} onClick={() => setIsSidebarOpen(!isSidebarOpen)} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>{currentFile?.name || "אין קובץ"}</span>
                <ChevronLeft size={10} />
                <span className="text-blue-600">{currentBreadcrumb}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <IconButton icon={Undo2} onClick={undo} disabled={history.length === 0} title="ביטול פעולה" />
            <div className="w-px h-6 bg-slate-100 mx-2" />
            <IconButton icon={isInspectorOpen ? ChevronLeft : Layout} onClick={() => setIsInspectorOpen(!isInspectorOpen)} title="תצוגת מפה וקישורים" />
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden flex flex-col">
          <textarea
            ref={textareaRef}
            value={currentFile?.content || ''}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyUp={handleCursorMove}
            onMouseUp={handleCursorMove}
            className="flex-1 w-full p-12 md:p-20 font-sans text-xl leading-[2] text-slate-800 outline-none resize-none overflow-auto scrollbar-hide"
            dir="rtl"
            placeholder="התחל להקליד או טען קובץ..."
          />
          
          {/* Floating Toolbar */}
          <motion.div 
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-2xl z-20"
          >
            <div className="flex items-center gap-1 px-2 border-l border-slate-100">
              {['H1', 'H2', 'H3'].map(h => (
                <button key={h} onClick={() => insertTag(`<${h.toLowerCase()}>`, `</${h.toLowerCase()}>`)} className="px-3 py-1.5 text-[10px] font-black hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all">{h}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 px-2">
              <IconButton icon={Bold} onClick={() => insertTag('<b>', '</b>')} />
              <IconButton icon={Italic} onClick={() => insertTag('<i>', '</i>')} />
              <IconButton icon={Underline} onClick={() => insertTag('<u>', '</u>')} />
            </div>
            <div className="w-px h-6 bg-slate-100 mx-1" />
            <div className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">שורה {currentLine}</div>
          </motion.div>
        </div>
      </main>

      {/* Inspector - Left */}
      <aside className={`bg-white border-r border-slate-200 transition-all duration-500 flex flex-col z-30 ${isInspectorOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-8 flex flex-col h-1/2 min-h-0 border-b border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">מפת מסמך</h3>
              <Layers size={14} className="text-slate-300" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {previewHeaders.map((h, i) => (
                <button
                  key={i} onClick={() => scrollToHeader(h.startIndex, h.length)}
                  className={`w-full text-right p-3 rounded-xl transition-all flex flex-col gap-1 group ${h.tagName === 'H1' ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="text-[8px] font-black text-blue-500 uppercase opacity-0 group-hover:opacity-100 transition-opacity">{h.tagName}</span>
                  <span className={`text-xs font-bold leading-relaxed ${h.tagName === 'H1' ? 'text-slate-900' : 'text-slate-500'}`}>{h.textContent}</span>
                </button>
              ))}
              {previewHeaders.length === 0 && <div className="text-center py-12 text-slate-300 text-xs italic">אין כותרות במסמך</div>}
            </div>
          </div>

          <div className="p-8 flex flex-col h-1/2 min-h-0 bg-slate-50/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">קישורים חכמים</h3>
              <LinkIcon size={14} className="text-blue-400" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
              {currentLineLinks.map((link, i) => {
                const src = EMBEDDED_SOURCES[link.path_2.replace('.txt', '')] || '';
                const lineText = src.split('\n')[link.line_index_2 - 1] || '';
                return (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} key={i} className="p-5 bg-white border border-slate-200 rounded-[24px] shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{link.path_2}</span>
                      <span className="text-[9px] font-black text-slate-300">שורה {link.line_index_2}</span>
                    </div>
                    <p className="text-[11px] font-black text-slate-800 leading-relaxed">{link.heRef_2}</p>
                    {lineText && <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 italic leading-relaxed border border-slate-100">{lineText.replace(/<[^>]*>/g, '')}</div>}
                  </motion.div>
                );
              })}
              {currentLineLinks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 opacity-40">
                  <MousePointer2 size={32} strokeWidth={1} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">בחר שורה עם קישור</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Review Overlay */}
      <AnimatePresence>
        {activeTab === 'review' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-8" dir="rtl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40 }} animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-6xl h-full max-h-[85vh] rounded-[48px] shadow-2xl flex flex-col overflow-hidden border border-white/20"
            >
              <header className="px-12 py-10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-blue-600 rounded-[24px] text-white shadow-2xl shadow-blue-200">
                    <ListChecks size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">ביקורת הדגשות חכמה</h2>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">פרק:</span>
                      <span className="text-xs font-black text-blue-600">{reviewHeaders[currentHeaderIdx] === '_initial_' ? 'תחילת הקובץ' : reviewHeaders[currentHeaderIdx]}</span>
                      <span className="text-[10px] text-slate-200 mx-2">|</span>
                      <span className="text-xs font-bold text-slate-400">{currentHeaderIdx + 1} / {reviewHeaders.length}</span>
                    </div>
                  </div>
                </div>
                <IconButton icon={X} onClick={() => setActiveTab('preview')} />
              </header>

              <div className="flex-1 overflow-y-auto px-12 pb-12 space-y-8 custom-scrollbar">
                {currentReviewBatch.map((item, idx) => {
                  const bold = item.originalWords.slice(0, item.explodedWordCount).join(' ');
                  const rest = item.originalWords.slice(item.explodedWordCount).join(' ');
                  return (
                    <div key={idx} className="bg-[#F8FAFC] rounded-[40px] border border-slate-200/60 overflow-hidden flex flex-col transition-all hover:shadow-xl hover:bg-white">
                      <div className="p-8 bg-white/50 border-b border-slate-100">
                        <div className="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-[0.2em]">הקשר מהמקור</div>
                        <div className="text-sm text-slate-600 leading-relaxed">
                          <span className="font-black text-blue-600">{item.sourceText}</span>
                          <span className="opacity-40"> {item.sourceContext}</span>
                        </div>
                      </div>
                      <div className="p-10">
                        <div className="text-[9px] font-black text-slate-400 uppercase mb-4 tracking-[0.2em]">תצוגת הדגשה</div>
                        <div className="text-2xl leading-relaxed text-slate-900 font-medium">
                          <span className="bg-blue-600 text-white font-black px-3 py-1 rounded-2xl shadow-lg shadow-blue-100">{bold}</span>
                          <span className="text-slate-300"> {rest}</span>
                        </div>
                      </div>
                      <div className="px-10 py-8 bg-white/30 border-t border-slate-100 flex items-center justify-center gap-16">
                        <button 
                          onClick={() => {
                            const b = [...currentReviewBatch];
                            if (b[idx].explodedWordCount > 0) { b[idx].explodedWordCount--; setCurrentReviewBatch(b); }
                          }}
                          className="w-16 h-16 flex items-center justify-center bg-white border border-slate-200 rounded-3xl hover:border-red-400 hover:text-red-500 transition-all shadow-sm active:scale-90"
                        >
                          <Minus size={32} />
                        </button>
                        <div className="flex flex-col items-center min-w-[120px]">
                          <span className="text-4xl font-black text-slate-900">{item.explodedWordCount}</span>
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">מילים מודגשות</span>
                        </div>
                        <button 
                          onClick={() => {
                            const b = [...currentReviewBatch];
                            if (b[idx].explodedWordCount < item.originalWords.length) { b[idx].explodedWordCount++; setCurrentReviewBatch(b); }
                          }}
                          className="w-16 h-16 flex items-center justify-center bg-white border border-slate-200 rounded-3xl hover:border-green-400 hover:text-green-500 transition-all shadow-sm active:scale-90"
                        >
                          <Plus size={32} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <footer className="px-12 py-10 bg-white border-t border-slate-100 flex justify-center shrink-0">
                <button 
                  onClick={applyReviewBatch}
                  className="flex items-center gap-4 px-24 py-6 bg-blue-600 text-white rounded-[32px] font-black text-xl shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 transition-all active:translate-y-0"
                >
                  <CheckCircle size={28} />
                  אישור והמשך לפרק הבא
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal isOpen={isModalOpen && activeTab === 'highlight_regex'} onClose={() => setIsModalOpen(false)} title="הדגשת תוי סיום" icon={Type}>
        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">תווי סיום (למשל: . או :)</label>
            <input 
              type="text" value={terminatorChar} onChange={(e) => setTerminatorChar(e.target.value)}
              className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xl"
            />
          </div>
          <button onClick={processWithRegex} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-100">בצע הדגשה אוטומטית</button>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen && activeTab === 'highlight_fuzzy'} onClose={() => setIsModalOpen(false)} title="הדגשת השוואה חכמה" icon={ArrowLeftRight}>
        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">בחר מקור להשוואה</label>
            <select
              value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
            >
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-4 p-5 bg-blue-50/30 rounded-2xl border border-blue-100">
            <input type="checkbox" id="gen-links" checked={generateLinks} onChange={(e) => setGenerateLinks(e.target.checked)} className="w-6 h-6 rounded-lg border-slate-300 text-blue-600" />
            <label htmlFor="gen-links" className="text-sm font-bold text-slate-700 cursor-pointer">צור קובץ קישורים (_links.json)</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => processWithFuzzy('auto')} className="py-5 bg-slate-100 text-slate-700 rounded-2xl font-black hover:bg-slate-200 transition-all">אוטומטי</button>
            <button onClick={() => processWithFuzzy('review')} className="py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100">עם ביקורת</button>
          </div>
        </div>
      </Modal>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }
      `}</style>
    </div>
  );
};

export default App;

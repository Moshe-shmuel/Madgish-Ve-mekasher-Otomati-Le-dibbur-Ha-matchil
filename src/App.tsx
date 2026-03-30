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
  Wrench, Search, Globe, Scissors, Scale, Eye, 
  Upload, Folder, Trash2, Download, FileText, 
  CheckCircle, AlertCircle, ChevronRight, Menu,
  Settings, ListCheck, ArrowLeft, Play, Undo2, Filter, Type, X,
  Bold, Italic, Underline, RefreshCw, AArrowUp, AArrowDown,
  Highlighter, ArrowLeftRight, Plus, Minus, Link as LinkIcon,
  Layers, Layout, Info
} from 'lucide-react';
import { ProcessedFile, TabId, LogEntry, ReviewItem } from './types';
import { EMBEDDED_SOURCES } from './embeddedSources';

const NavButton = ({ id, icon: Icon, label, active, onClick }: { id: TabId, icon: any, label: string, active: boolean, onClick: (id: TabId) => void }) => (
  <button
    onClick={() => onClick(id)}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-right ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
        : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
    }`}
  >
    <Icon size={18} />
    <span className="font-semibold text-sm">{label}</span>
  </button>
);

const Modal = ({ isOpen, onClose, title, icon: Icon, children }: { isOpen: boolean, onClose: () => void, title: string, icon: any, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Icon size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const App: React.FC = () => {
  const [loadedFiles, setLoadedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [history, setHistory] = useState<ProcessedFile[][]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('preview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
  const [sources, setSources] = useState<string[]>(Object.keys(EMBEDDED_SOURCES));
  const [selectedSource, setSelectedSource] = useState<string>(Object.keys(EMBEDDED_SOURCES)[0] || '');
  const [sourceContent, setSourceContent] = useState<string>(EMBEDDED_SOURCES[Object.keys(EMBEDDED_SOURCES)[0]] || '');
  const [localSource, setLocalSource] = useState<string>('');

  const activeSourceContent = localSource || sourceContent;
  const currentFile = loadedFiles[previewIdx];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedSource && !localSource) {
      if (EMBEDDED_SOURCES[selectedSource]) {
        setSourceContent(EMBEDDED_SOURCES[selectedSource]);
      }
    }
  }, [selectedSource, localSource]);

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      if (prev.length > 0 && isEqual(prev[0], loadedFiles)) {
        return prev;
      }
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
      const cleanFileName = f.name.replace(/\.[^/.]+$/, "");
      newFiles.push({ 
        name: cleanFileName, 
        content: content,
        originalName: f.name
      });
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

  const handleNameChange = (newName: string) => {
    const nextFiles = [...loadedFiles];
    if (nextFiles[previewIdx]) {
      nextFiles[previewIdx] = { ...nextFiles[previewIdx], name: newName };
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
    const selectedText = text.substring(start, end);
    const replacement = `${openTag}${selectedText}${closeTag}`;
    const newContent = text.substring(0, start) + replacement + text.substring(end);
    handleContentChange(newContent);
  };

  const normalize = (text: string, isHeader: boolean = false) => {
    if (!text) return '';
    let processed = text.replace(/[\u0591-\u05C7]/g, ''); // Remove Niqqud
    if (!isHeader) {
      processed = processed.replace(/[.,:;?!\-()]/g, ' ');
    }
    return processed
      .split(/\s+/)
      .map(word => {
        if (!isHeader) {
          return word.replace(/[וי]/g, '');
        }
        return word;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const processWithRegex = () => {
    if (loadedFiles.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    
    setTimeout(async () => {
      pushToHistory();
      const escapedChars = terminatorChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^([^${escapedChars}]*[${escapedChars}])`);
      const nextFiles: ProcessedFile[] = [];

      for (let i = 0; i < loadedFiles.length; i++) {
        setProcessingProgress(Math.round((i / loadedFiles.length) * 100));
        await new Promise(resolve => setTimeout(resolve, 0));

        const f = loadedFiles[i];
        const paragraphs = f.content.split('\n');
        const newContent = paragraphs.map(p => {
          if (!p.trim()) return '';
          const match = p.match(regex);
          if (match) {
            const dhm = match[1];
            const rest = p.substring(dhm.length);
            return `<b>${dhm}</b>${rest}`;
          }
          return p;
        }).join('\n');
        nextFiles.push({ ...f, content: newContent });
      }

      setLoadedFiles(nextFiles);
      setIsModalOpen(false);
      setIsProcessing(false);
      setProcessingProgress(0);
    }, 100);
  };

  const processWithFuzzy = (mode: 'auto' | 'review' = 'auto') => {
    if (!activeSourceContent) return;
    if (loadedFiles.length === 0) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);
    
    setTimeout(async () => {
      if (mode === 'auto') pushToHistory();

      const explode = (text: string, startLine: number) => {
        const lines = text.split('\n');
        return lines.flatMap((line, i) => {
          const normalizedLine = normalize(line.replace(/<[^>]*>/g, ''));
          const words = normalizedLine.split(/\s+/).filter(w => w.length > 0);
          return words.flatMap(w => {
            if (w.includes('"')) return w.replace(/"/g, '').split('').map(char => ({ text: char, lineIdx: startLine + i }));
            return [{ text: w, lineIdx: startLine + i }];
          });
        });
      };

      const sections: { header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[] = [];
      const headerRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
      
      let firstMatch = headerRegex.exec(activeSourceContent);
      headerRegex.lastIndex = 0; 
      
      if (firstMatch && firstMatch.index > 0) {
        const initialContent = activeSourceContent.substring(0, firstMatch.index);
        sections.push({ header: "_initial_", fullHeader: "", words: explode(initialContent, 1) });
      } else if (!firstMatch) {
        sections.push({ header: "_initial_", fullHeader: "", words: explode(activeSourceContent, 1) });
      }

      let match;
      const currentHierarchy: string[] = [];
      while ((match = headerRegex.exec(activeSourceContent)) !== null) {
        const level = parseInt(match[1]);
        const rawHeaderText = match[2].replace(/<[^>]*>/g, '').trim();
        const normalizedHeader = normalize(rawHeaderText, true);
        
        currentHierarchy[level - 1] = rawHeaderText;
        for (let i = level; i < 6; i++) currentHierarchy[i] = '';
        const hierarchyPath = currentHierarchy.filter(h => h).join(' ');

        const start = headerRegex.lastIndex;
        const currentPos = headerRegex.lastIndex;
        const nextMatch = headerRegex.exec(activeSourceContent);
        const end = nextMatch ? nextMatch.index : activeSourceContent.length;
        headerRegex.lastIndex = currentPos; 
        
        const sectionContent = activeSourceContent.substring(start, end);
        const headerLine = activeSourceContent.substring(0, match.index).split('\n').length;
        sections.push({
          header: normalizedHeader,
          fullHeader: hierarchyPath,
          words: explode(sectionContent, headerLine + 1)
        });
      }
      setSourceSections(sections);

      if (mode === 'review') {
        const groups: Record<string, { fileIdx: number, pIdx: number, text: string }[]> = {};
        const headersOrder: string[] = ["_initial_"];
        groups["_initial_"] = [];

        for (let fileIdx = 0; fileIdx < loadedFiles.length; fileIdx++) {
          const paragraphs = loadedFiles[fileIdx].content.split('\n');
          let currentHeader = "_initial_";
          paragraphs.forEach((p, pIdx) => {
            const trimmed = p.trim();
            if (!trimmed) return;
            const headerMatch = trimmed.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
            if (headerMatch) {
              currentHeader = normalize(headerMatch[1].replace(/<[^>]*>/g, ''), true);
              if (!groups[currentHeader]) {
                groups[currentHeader] = [];
                headersOrder.push(currentHeader);
              }
              return;
            }
            groups[currentHeader].push({ fileIdx, pIdx, text: p });
          });
        }

        const finalHeaders = headersOrder.filter(h => groups[h].length > 0);
        setReviewGroups(groups);
        setReviewHeaders(finalHeaders);
        setCurrentHeaderIdx(0);
        
        if (finalHeaders.length > 0) {
          processHeaderGroup(0, groups, finalHeaders, sections);
        } else {
          setIsProcessing(false);
        }
      } else {
        const nextFiles: ProcessedFile[] = [];

        for (let fileIdx = 0; fileIdx < loadedFiles.length; fileIdx++) {
          setProcessingProgress(Math.round((fileIdx / loadedFiles.length) * 100));
          await new Promise(resolve => setTimeout(resolve, 0));
          
          const f = loadedFiles[fileIdx];
          const paragraphs = f.content.split('\n');
          let currentSourceSection = sections[0];
          let currentSourceWords = currentSourceSection.words;
          let lastMatchIndex = 0; 
          const fileLinks: any[] = [];
          
          const newContent = paragraphs.map((p, pIdx) => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            const headerMatch = trimmed.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
            if (headerMatch) {
              const commentaryHeaderText = normalize(headerMatch[1].replace(/<[^>]*>/g, ''), true);
              const matchingSection = sections.find(s => s.header === commentaryHeaderText);
              if (matchingSection) {
                currentSourceSection = matchingSection;
                currentSourceWords = matchingSection.words;
                lastMatchIndex = 0; 
              }
              return p; 
            }

            const cleanP = trimmed.replace(/<[^>]*>/g, '');
            const originalWords = cleanP.split(/\s+/);
            let candidates: { index: number, matchCount: number }[] = [];
            
            for (let j = 0; j < currentSourceWords.length; j++) {
              let currentMatch = 0;
              for (let k = 0; k < originalWords.length; k++) {
                if (j + k >= currentSourceWords.length) break;
                const pWord = normalize(originalWords[k]);
                const sWord = normalize(currentSourceWords[j + k].text);
                if (fuzz.ratio(pWord, sWord) >= 85) currentMatch++;
                else break;
              }
              if (currentMatch > 0) candidates.push({ index: j, matchCount: currentMatch });
            }

            let bestSourceIdx = -1;
            let maxMatchCount = 0;
            let bestScore = -Infinity;

            candidates.forEach(candidate => {
              let score = candidate.matchCount;
              if (candidate.matchCount === 1) {
                const pWord = normalize(originalWords[0]);
                const sWord = normalize(currentSourceWords[candidate.index].text);
                if (fuzz.ratio(pWord, sWord) < 92) score = -Infinity;
              }
              if (score !== -Infinity) {
                  const distance = candidate.index - lastMatchIndex;
                  score -= (distance >= 0 ? (distance * 0.005) : 5);
                  if (score > bestScore) {
                      bestScore = score;
                      bestSourceIdx = candidate.index;
                      maxMatchCount = candidate.matchCount;
                  }
              }
            });

            if (maxMatchCount >= 1) {
              if (maxMatchCount < originalWords.length) {
                const nextWord = originalWords[maxMatchCount].replace(/[.,:;?!]/g, '');
                if (nextWord === "כו'" || nextWord === "וכו'") maxMatchCount++;
              }
              
              const matchedLineIdx = currentSourceWords[bestSourceIdx].lineIdx;
              if (generateLinks) {
                fileLinks.push({
                  line_index_1: pIdx + 1,
                  line_index_2: matchedLineIdx,
                  heRef_2: currentSourceSection.fullHeader,
                  path_2: selectedSource.split('/').pop() || selectedSource,
                  "Conection Type": "commentary"
                });
              }

              lastMatchIndex = bestSourceIdx + 1;
              let currentWordIdx = -1;
              let inWord = false;
              let finalEndPos = 0;
              let inTag = false;

              for (let i = 0; i < p.length; i++) {
                if (p[i] === '<') inTag = true;
                if (!inTag) {
                  const isWhitespace = /\s/.test(p[i]);
                  if (!isWhitespace && !inWord) {
                    inWord = true;
                    currentWordIdx++;
                  } else if (isWhitespace && inWord) {
                    inWord = false;
                  }
                }
                if (currentWordIdx < maxMatchCount) finalEndPos = i + 1;
                else break;
                if (p[i] === '>') inTag = false;
              }
              while (finalEndPos < p.length && /[.:\-]/.test(p[finalEndPos])) finalEndPos++;
              return `<b>${p.substring(0, finalEndPos)}</b>${p.substring(finalEndPos)}`;
            }
            return p;
          }).join('\n');
          nextFiles.push({ ...f, content: newContent, links: generateLinks ? fileLinks : undefined });
        }

        setLoadedFiles(nextFiles);
        setIsModalOpen(false);
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    }, 100);
  };

  const processHeaderGroup = async (headerIdx: number, groups: Record<string, { fileIdx: number, pIdx: number, text: string }[]>, headers: string[], sections: { header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[]|any) => {
    const header = headers[headerIdx];
    const paragraphs = groups[header];
    const section = sections.find((s:any) => s.header === header) || sections[0];
    const currentSourceWords = section.words;
    
    const batchItems: ReviewItem[] = [];
    const fileLastMatchIndices: Record<number, number> = {};

    for (let i = 0; i < paragraphs.length; i++) {
      const item = paragraphs[i];
      const p = item.text;
      const cleanP = p.replace(/<[^>]*>/g, '');
      const originalWords = cleanP.split(/\s+/);
      
      const lastIdx = fileLastMatchIndices[item.fileIdx] || 0;
      let candidates: { index: number, matchCount: number }[] = [];

      for (let j = 0; j < currentSourceWords.length; j++) {
        let currentMatch = 0;
        for (let k = 0; k < originalWords.length; k++) {
          if (j + k >= currentSourceWords.length) break;
          const pWord = normalize(originalWords[k]);
          const sWord = normalize(currentSourceWords[j + k].text);
          if (fuzz.ratio(pWord, sWord) >= 85) currentMatch++;
          else break;
        }
        if (currentMatch > 0) candidates.push({ index: j, matchCount: currentMatch });
      }

      let bestSourceIdx = -1;
      let maxMatchCount = 0;
      let bestScore = -Infinity;

      candidates.forEach(candidate => {
         let score = candidate.matchCount;
         if (candidate.matchCount === 1) {
            const pWord = normalize(originalWords[0]);
            const sWord = normalize(currentSourceWords[candidate.index].text);
            if (fuzz.ratio(pWord, sWord) < 92) score = -Infinity;
         }
         if (score !== -Infinity) {
             const distance = candidate.index - lastIdx;
             score -= (distance >= 0 ? (distance * 0.005) : 5);
             if (score > bestScore) {
                 bestScore = score;
                 bestSourceIdx = candidate.index;
                 maxMatchCount = candidate.matchCount;
             }
         }
      });

      if (maxMatchCount >= 1) {
        if (maxMatchCount < originalWords.length) {
          const nextWord = originalWords[maxMatchCount].replace(/[.,:;?!]/g, '');
          if (nextWord === "כו'" || nextWord === "וכו'") maxMatchCount++;
        }
        fileLastMatchIndices[item.fileIdx] = bestSourceIdx + 1;
        const matchedSourceText = currentSourceWords.slice(bestSourceIdx, bestSourceIdx + maxMatchCount).map((w:any) => w.text).join(' ');
        const matchedSourceContext = currentSourceWords.slice(bestSourceIdx + maxMatchCount, bestSourceIdx + maxMatchCount + 5).map((w:any) => w.text).join(' ');
        
        batchItems.push({
          fileIdx: item.fileIdx,
          paragraphIdx: item.pIdx,
          originalText: p,
          sourceText: matchedSourceText,
          sourceContext: matchedSourceContext,
          explodedWordCount: maxMatchCount,
          wordMap: Array.from({length: maxMatchCount}, (_, i) => i),
          originalWords,
          headerText: header,
          fullHeader: section.fullHeader,
          sourceLineIndex: currentSourceWords[bestSourceIdx].lineIdx
        });
      }
    }

    setCurrentReviewBatch(batchItems);
    setActiveTab('review');
    setIsProcessing(false);
    setProcessingProgress(0);
    setIsModalOpen(false);
  };

  const applyReviewBatch = () => {
    pushToHistory();
    const nextFiles = [...loadedFiles];
    
    currentReviewBatch.forEach(item => {
      const f = nextFiles[item.fileIdx];
      const paragraphs = f.content.split('\n');
      const p = item.originalText;
      
      const targetWordCount = item.explodedWordCount;
      let currentWordIdx = -1;
      let inWord = false;
      let finalEndPos = 0;
      let inTag = false;

      for (let i = 0; i < p.length; i++) {
        if (p[i] === '<') inTag = true;
        if (!inTag) {
          const isWhitespace = /\s/.test(p[i]);
          if (!isWhitespace && !inWord) {
            inWord = true;
            currentWordIdx++;
          } else if (isWhitespace && inWord) {
            inWord = false;
          }
        }
        if (currentWordIdx < targetWordCount) finalEndPos = i + 1;
        else break;
        if (p[i] === '>') inTag = false;
      }
      while (finalEndPos < p.length && /[.:\-]/.test(p[finalEndPos])) finalEndPos++;
      
      paragraphs[item.paragraphIdx] = `<b>${p.substring(0, finalEndPos)}</b>${p.substring(finalEndPos)}`;
      
      if (generateLinks) {
        if (!nextFiles[item.fileIdx].links) nextFiles[item.fileIdx].links = [];
        nextFiles[item.fileIdx].links?.push({
          line_index_1: item.paragraphIdx + 1,
          line_index_2: item.sourceLineIndex,
          heRef_2: item.fullHeader,
          path_2: selectedSource.split('/').pop() || selectedSource,
          "Conection Type": "commentary"
        });
      }

      nextFiles[item.fileIdx] = { ...f, content: paragraphs.join('\n') };
    });

    setLoadedFiles(nextFiles);
    
    const nextIdx = currentHeaderIdx + 1;
    if (nextIdx < reviewHeaders.length) {
      setCurrentHeaderIdx(nextIdx);
      setIsProcessing(true);
      setTimeout(() => {
        processHeaderGroup(nextIdx, reviewGroups, reviewHeaders, sourceSections);
      }, 100);
    } else {
      setActiveTab('preview');
      setReviewGroups({});
      setReviewHeaders([]);
      setCurrentReviewBatch([]);
    }
  };

  const downloadAll = async () => {
    if (loadedFiles.length === 0) return;
    const zip = new JSZip();
    loadedFiles.forEach(f => {
      zip.file(`${f.name}.txt`, f.content);
      if (f.links && f.links.length > 0) {
        zip.file(`${f.name}_links.json`, JSON.stringify(f.links, null, 2));
      }
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Output_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const previewHeaders = React.useMemo(() => {
    if (!currentFile?.content) return [];
    const headers: { tagName: string; textContent: string; startIndex: number; length: number }[] = [];
    const regex = /<(h[1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    let match;
    while ((match = regex.exec(currentFile.content)) !== null) {
      headers.push({
        tagName: match[1].toUpperCase(),
        textContent: match[2].replace(/<[^>]*>/g, ''),
        startIndex: match.index,
        length: match[0].length
      });
    }
    return headers;
  }, [currentFile?.content]);

  const scrollToHeader = useCallback((startIndex: number, length: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(startIndex, startIndex + length);
    setTimeout(() => {
      textarea.setSelectionRange(startIndex, startIndex);
      textarea.blur();
      textarea.focus();
    }, 0);
  }, []);

  const handleCursorMove = () => {
    if (!textareaRef.current) return;
    const textBefore = textareaRef.current.value.substring(0, textareaRef.current.selectionStart);
    const lineNum = textBefore.split('\n').length;
    setCurrentLine(lineNum);
  };

  const currentLineLinks = React.useMemo(() => {
    if (!currentFile?.links) return [];
    return currentFile.links.filter(l => l.line_index_1 === currentLine);
  }, [currentFile?.links, currentLine]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans selection:bg-blue-100 selection:text-blue-900" dir="rtl">
      {isProcessing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md text-white">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="mb-6"
          >
            <RefreshCw size={64} className="text-blue-400" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">מעבד נתונים...</h2>
          <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
            <motion.div 
              className="h-full bg-blue-400"
              initial={{ width: 0 }}
              animate={{ width: `${processingProgress}%` }}
            />
          </div>
          <div className="text-3xl font-mono font-bold text-blue-400 mb-4">{processingProgress}%</div>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <input ref={folderInputRef} type="file" {...({ webkitdirectory: "", directory: "" } as any)} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      <aside className={`bg-white border-l border-slate-200 transition-all duration-300 flex flex-col z-30 ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-8 border-b border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl text-white shadow-xl shadow-blue-100">
            <Highlighter size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">TextFlow</h1>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Pro Edition</span>
          </div>
        </div>
        
        <nav className="flex-1 p-6 space-y-3 overflow-y-auto">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">כלים ופעולות</div>
          <NavButton 
            id="highlight_regex" 
            icon={Highlighter} 
            label="הדגשת תוי סיום" 
            active={activeTab === 'highlight_regex'}
            onClick={() => { setActiveTab('highlight_regex'); setIsModalOpen(true); }} 
          />
          <NavButton 
            id="highlight_fuzzy" 
            icon={ArrowLeftRight} 
            label="הדגשת השוואה" 
            active={activeTab === 'highlight_fuzzy'}
            onClick={() => { setActiveTab('highlight_fuzzy'); setIsModalOpen(true); }} 
          />
          <div className="pt-6">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">ניהול קבצים</div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-sm font-bold"
            >
              <Upload size={18} />
              העלאת קבצים
            </button>
            <button 
              onClick={() => folderInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-sm font-bold"
            >
              <Folder size={18} />
              העלאת תיקייה
            </button>
          </div>
        </nav>

        <div className="p-6 border-t border-slate-100">
           <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
             <span>v4.0.2</span>
             <span>Pro Edition</span>
           </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors">
              <Menu size={22} />
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <select 
                value={previewIdx} 
                onChange={e => setPreviewIdx(Number(e.target.value))}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all min-w-[240px]"
              >
                {loadedFiles.length === 0 ? (
                  <option>אין קבצים טעונים</option>
                ) : (
                  loadedFiles.map((f, i) => <option key={i} value={i}>{f.name}</option>)
                )}
              </select>
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-black uppercase tracking-wider">
                <FileText size={14} />
                <span>{loadedFiles.length} קבצים</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
             <button 
                onClick={undo}
                disabled={history.length === 0}
                className="p-2.5 rounded-xl transition-all text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                title="ביטול פעולה אחרונה"
              >
                <Undo2 size={20} />
              </button>
             <button 
                onClick={() => {
                  if (loadedFiles.length === 0) return;
                  pushToHistory();
                  setLoadedFiles([]);
                }}
                className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="נקה הכל"
              >
                <Trash2 size={20} />
              </button>
              <button 
                disabled={loadedFiles.length === 0}
                onClick={downloadAll}
                className="flex items-center gap-3 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg disabled:opacity-30"
              >
                <Download size={18} />
                ייצוא ZIP
              </button>
          </div>
        </header>

        <div className="flex-1 flex gap-8 p-8 overflow-hidden">
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between px-8 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    {['H1', 'H2', 'H3'].map(h => (
                      <button
                        key={h}
                        onClick={() => insertTag(`<${h.toLowerCase()}>`, `</${h.toLowerCase()}>`)}
                        className="px-3 py-1.5 text-[10px] font-black bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div className="flex items-center gap-1">
                    <button onClick={() => insertTag('<b>', '</b>')} className="p-2 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all">
                      <Bold size={16} />
                    </button>
                    <button onClick={() => insertTag('<i>', '</i>')} className="p-2 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all">
                      <Italic size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase">שורה: {currentLine}</span>
                </div>
              </div>

              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={currentFile?.content || ''}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyUp={handleCursorMove}
                  onMouseUp={handleCursorMove}
                  className="w-full h-full bg-white p-10 font-sans text-xl leading-[1.8] text-slate-800 outline-none resize-none overflow-auto"
                  dir="rtl"
                  placeholder="העלה קבצים כדי להתחיל לעבוד..."
                />
              </div>
            </div>
          </div>

          <aside className="w-80 flex flex-col gap-6 shrink-0">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-1/2 min-h-0">
              <div className="flex items-center gap-2 mb-6">
                <Layout size={18} className="text-blue-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">ניווט כותרות</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {previewHeaders.length > 0 ? previewHeaders.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToHeader(h.startIndex, h.length)}
                    className={`w-full text-right p-3 rounded-xl border transition-all flex flex-col gap-1 ${
                      h.tagName === 'H1' 
                        ? 'bg-blue-50 border-blue-100 text-blue-900' 
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-slate-200'
                    }`}
                  >
                    <span className="text-[9px] font-black uppercase opacity-50">{h.tagName}</span>
                    <span className="text-xs font-bold line-clamp-2">{h.textContent}</span>
                  </button>
                )) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                    <Info size={24} className="opacity-20" />
                    <span className="text-xs italic">לא נמצאו כותרות</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-1/2 min-h-0">
              <div className="flex items-center gap-2 mb-6">
                <LinkIcon size={18} className="text-blue-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">קישורים לקטע</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {currentLineLinks.length > 0 ? currentLineLinks.map((link, i) => (
                  <div key={i} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-blue-600 uppercase">מקור: {link.path_2}</span>
                      <span className="text-[10px] font-black text-slate-400">שורה {link.line_index_2}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 leading-relaxed">{link.heRef_2}</p>
                    <div className="mt-1 pt-2 border-t border-slate-200/50">
                      <span className="text-[9px] font-bold text-slate-400 italic">{link["Conection Type"]}</span>
                    </div>
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                    <LinkIcon size={24} className="opacity-20" />
                    <span className="text-xs italic">אין קישורים לשורה זו</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <AnimatePresence>
          {activeTab === 'review' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8" dir="rtl"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-white/20"
              >
                <header className="bg-white border-b border-slate-100 px-10 py-8 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-5">
                    <div className="p-3.5 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-100">
                      <ListCheck size={28} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">ביקורת הדגשות</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">כותרת:</span>
                        <span className="text-xs font-black text-blue-600">{reviewHeaders[currentHeaderIdx] === '_initial_' ? 'תחילת הקובץ' : reviewHeaders[currentHeaderIdx]}</span>
                        <span className="text-[10px] text-slate-300 mx-2">|</span>
                        <span className="text-xs font-bold text-slate-400">{currentHeaderIdx + 1} / {reviewHeaders.length}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setActiveTab('preview'); }}
                    className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                  >
                    <X size={28} />
                  </button>
                </header>

                <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/50">
                  {currentReviewBatch.map((item, idx) => {
                    const targetWordCount = item.explodedWordCount;
                    const boldPart = item.originalWords.slice(0, targetWordCount).join(' ');
                    const restPart = item.originalWords.slice(targetWordCount).join(' ');

                    return (
                      <div key={idx} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
                        <div className="p-6 bg-slate-50/80 border-b border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">הקשר מהמקור</div>
                          <div className="text-sm text-slate-700 leading-relaxed">
                            <span className="font-black text-blue-600">{item.sourceText}</span>
                            <span className="opacity-40"> {item.sourceContext}</span>
                          </div>
                        </div>
                        <div className="p-8">
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">תצוגת הדגשה</div>
                          <div className="text-xl leading-relaxed text-slate-800">
                            <span className="bg-blue-600 text-white font-black px-2 py-1 rounded-xl shadow-sm">{boldPart}</span>
                            <span className="text-slate-300"> {restPart}</span>
                          </div>
                        </div>
                        <div className="px-8 py-6 bg-slate-50/30 border-t border-slate-100 flex items-center justify-center gap-12">
                          <button 
                            onClick={() => {
                              const newBatch = [...currentReviewBatch];
                              if (newBatch[idx].explodedWordCount > 0) {
                                newBatch[idx] = { ...newBatch[idx], explodedWordCount: newBatch[idx].explodedWordCount - 1 };
                                setCurrentReviewBatch(newBatch);
                              }
                            }}
                            className="w-14 h-14 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:border-red-400 hover:text-red-500 transition-all shadow-sm active:scale-90"
                          >
                            <Minus size={28} />
                          </button>
                          <div className="flex flex-col items-center min-w-[100px]">
                            <span className="text-3xl font-black text-slate-800">{item.explodedWordCount}</span>
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">מילים</span>
                          </div>
                          <button 
                            onClick={() => {
                              const newBatch = [...currentReviewBatch];
                              if (newBatch[idx].explodedWordCount < item.originalWords.length) {
                                newBatch[idx] = { ...newBatch[idx], explodedWordCount: newBatch[idx].explodedWordCount + 1 };
                                setCurrentReviewBatch(newBatch);
                              }
                            }}
                            className="w-14 h-14 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:border-green-400 hover:text-green-500 transition-all shadow-sm active:scale-90"
                          >
                            <Plus size={28} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <footer className="bg-white border-t border-slate-100 p-10 flex justify-center shrink-0">
                  <button 
                    onClick={applyReviewBatch}
                    className="flex items-center gap-4 px-20 py-5 bg-blue-600 text-white rounded-[24px] font-black text-lg shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 transition-all active:translate-y-0"
                  >
                    <CheckCircle size={24} />
                    אישור והמשך
                  </button>
                </footer>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <Modal 
          isOpen={isModalOpen && activeTab === 'highlight_regex'} 
          onClose={() => setIsModalOpen(false)} 
          title="הדגשת תוי סיום" 
          icon={Highlighter}
        >
          <div className="space-y-8">
            <p className="text-slate-500 text-sm leading-relaxed">סריקה והדגשה אוטומטית של תחילת כל פסקה עד לתו הסיום הראשון שיוגדר.</p>
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">תווי סיום (למשל: . או : או .:-)</label>
              <input 
                type="text" 
                value={terminatorChar} 
                onChange={(e) => setTerminatorChar(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg"
              />
            </div>
            <button 
              onClick={processWithRegex} 
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
            >
              הפעל עיבוד
            </button>
          </div>
        </Modal>

        <Modal 
          isOpen={isModalOpen && activeTab === 'highlight_fuzzy'} 
          onClose={() => setIsModalOpen(false)} 
          title="הדגשת השוואה חכמה" 
          icon={ArrowLeftRight}
        >
          <div className="space-y-8">
            <p className="text-slate-500 text-sm leading-relaxed">הדגשה מבוססת אלגוריתם השוואה מול טקסט מקור. המערכת תזהה את הדיבור המתחיל ותדגיש אותו.</p>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">בחר מקור להשוואה</label>
                  <label className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                    טען מקור חיצוני
                    <input type="file" accept=".txt" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setLocalSource(event.target?.result as string);
                          setSelectedSource(file.name);
                        };
                        reader.readAsText(file);
                      }
                    }} className="hidden" />
                  </label>
                </div>
                <select
                  value={selectedSource}
                  onChange={(e) => { setSelectedSource(e.target.value); setLocalSource(''); }}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
                >
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                  {localSource && <option value={selectedSource}>{selectedSource} (מקומי)</option>}
                </select>
              </div>

              <div className="flex items-center gap-4 p-5 bg-blue-50/30 rounded-2xl border border-blue-100">
                <input 
                  type="checkbox" 
                  id="gen-links"
                  checked={generateLinks}
                  onChange={(e) => setGenerateLinks(e.target.checked)}
                  className="w-6 h-6 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="gen-links" className="text-sm font-bold text-slate-700 cursor-pointer">
                  צור קובץ קישורים (_links.json)
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => processWithFuzzy('auto')} 
                className="py-5 bg-slate-100 text-slate-700 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                עיבוד אוטומטי
              </button>
              <button 
                onClick={() => processWithFuzzy('review')} 
                className="py-5 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
              >
                עיבוד עם ביקורת
              </button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
};

export default App;

export type TabId = 'preview' | 'highlight_regex' | 'highlight_fuzzy' | 'review' | 'settings';

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface ProcessedFile {
  name: string;
  content: string;
  originalName: string;
  links?: any[];
}

export interface ReviewItem {
  fileIdx: number;
  paragraphIdx: number;
  originalText: string;
  sourceText: string;
  sourceContext: string;
  explodedWordCount: number;
  wordMap: number[];
  originalWords: string[];
  headerText: string;
  fullHeader: string;
  sourceLineIndex: number;
}

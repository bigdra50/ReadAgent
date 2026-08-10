export type {
  ConfigLayer,
  Granularity,
  NoteConfig,
  ParseResult,
  PartialNoteConfig,
  UpdateMode,
} from './config.js';
export {
  CONFIG_LAYERS,
  DEFAULT_NOTE_CONFIG,
  isGranularity,
  isUpdateMode,
  parsePartialNoteConfig,
  resolveNoteConfig,
} from './config.js';
export type {
  Book,
  BookFormat,
  NoteEntry,
  Selection,
  TocEntry,
} from './domain.js';
export type { ChapterRange } from './toc.js';
export { chapterRanges } from './toc.js';

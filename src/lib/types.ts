// Database Types
export interface User {
  id: string;
  email: string;
  name?: string;
  google_id?: string;
  created_at: Date;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
}

export interface DataSource {
  id: string;
  project_id: string;
  type: 'excel' | 'csv' | 'google_sheets';
  file_url?: string;
  sheet_id?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface UploadedFile {
  id: string;
  data_source_id: string;
  filename: string;
  file_path: string;
  parsed_data?: Record<string, any>;
  created_at: Date;
}

export interface SheetsConnection {
  id: string;
  data_source_id: string;
  sheet_url: string;
  sheet_id: string;
  access_token?: string;
  created_at: Date;
}

export interface Analysis {
  id: string;
  project_id: string;
  data_source_id: string;
  column_analysis?: ColumnAnalysis[];
  insights?: string;
  created_at: Date;
}

export interface ColumnAnalysis {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'category';
  null_percentage: number;
  unique_count: number;
  sample_values: any[];
  description?: string;
}

export interface ChatMessage {
  id: string;
  analysis_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: Date;
}

export interface GeneratedFormula {
  id: string;
  analysis_id: string;
  formula: string;
  platform: 'excel' | 'google_sheets' | 'both';
  description: string;
  assumptions: string[];
  created_at: Date;
}

export interface GeneratedScript {
  id: string;
  analysis_id: string;
  code: string;
  instructions: string[];
  created_at: Date;
}

export interface GeneratedReport {
  id: string;
  analysis_id: string;
  file_path: string;
  created_at: Date;
}

// Data Types
export interface ParsedData {
  columns: string[];
  rows: any[][];
  sheetName?: string;
}

export interface AIAnalysisResult {
  tableType: string;
  importantColumns: string[];
  anomalies: any[];
  insights: string[];
  suggestions: string[];
}

export interface FormulaRequest {
  prompt: string;
  platform?: 'excel' | 'google_sheets' | 'both';
  context?: ParsedData;
}

export interface FormulaResponse {
  formula: string;
  platform: string;
  description: string;
  assumptions: string[];
  troubleshooting?: string[];
}

export interface ScriptRequest {
  prompt: string;
  context?: ParsedData;
}

export interface ScriptResponse {
  code: string;
  instructions: string[];
  permissions: string[];
  triggers?: string[];
}

export interface ReportRequest {
  analysisId: string;
  includeSummary: boolean;
  includeStatistics: boolean;
  includeRawData: boolean;
}

export interface GoogleSheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
  }>;
}

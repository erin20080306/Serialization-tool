import { createClient } from '@supabase/supabase-js';
import type {
  User,
  Project,
  DataSource,
  Analysis,
  ChatMessage,
} from './types';

// 使用佔位值避免在缺少環境變數時崩潰（方便本地預覽）
// 部署時請在 .env / Vercel 環境變數設定真實金鑰
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

// Client for browser/client-side
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side with elevated permissions
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Database helper functions
export async function getUser(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function createUser(userData: Partial<User>) {
  const { data, error } = await supabase
    .from('users')
    .insert(userData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getProjects(userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createProject(projectData: Partial<Project>) {
  const { data, error } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDataSource(dataSourceId: string) {
  const { data, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('id', dataSourceId)
    .single();

  if (error) throw error;
  return data;
}

export async function createDataSource(dataSourceData: Partial<DataSource>) {
  const { data, error } = await supabase
    .from('data_sources')
    .insert(dataSourceData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createAnalysis(analysisData: Partial<Analysis>) {
  const { data, error } = await supabase
    .from('analyses')
    .insert(analysisData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAnalysis(analysisId: string) {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (error) throw error;
  return data;
}

export async function saveChatMessage(messageData: Partial<ChatMessage>) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(messageData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getChatMessages(analysisId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

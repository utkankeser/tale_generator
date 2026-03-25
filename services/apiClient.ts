// ============================================================
// Masal Üretici – Frontend API Client
// ============================================================
// Backend sunucusuna istek atar. API anahtarı burada YOKTUR.
// ============================================================

import Constants from 'expo-constants';

const BACKEND_URL: string =
  (Constants.expoConfig?.extra?.BACKEND_URL as string) ?? 'http://localhost:3001';

export type GenerateParams = {
  culture: string;
  ageGroup: string;
  atmosphere: string;
  specialRequest: string;
};

type SuccessResponse = { story: string };
type ErrorResponse = { error: string };

/**
 * Backend'e masal üretim isteği gönderir.
 * API anahtarı sunucu tarafındadır – istemcide asla bulunmaz.
 */
export async function generateStoryFromAPI(params: GenerateParams): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000); // 35 sn (backend 30 sn)

  try {
    const response = await fetch(`${BACKEND_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(params),
    });

    const data: SuccessResponse | ErrorResponse = await response.json();

    if (!response.ok) {
      throw new Error((data as ErrorResponse).error || 'Sunucudan hata döndü.');
    }

    return (data as SuccessResponse).story;
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error(
          'Bağlantı zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
        );
      }
      // Network error (sunucu kapalı vb.)
      if (err.message === 'Network request failed') {
        throw new Error(
          'Sunucuya bağlanılamadı. Backend sunucusunun çalıştığından emin olun.'
        );
      }
      throw err;
    }
    throw new Error('Bilinmeyen bir hata oluştu.');
  } finally {
    clearTimeout(timeout);
  }
}

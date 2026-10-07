/* عميل خادم الاستوديو. كل الاتصالات بالمحركات الخارجية تمر عبر /api/design-studio (لا مفاتيح في المتصفح). */
import { MESSAGES } from '../config.mjs';

export const API_PATH = '/api/design-studio';
function token() { try { return localStorage.getItem('dxn_session') || ''; } catch (_) { return ''; } }

export async function studioApi(action, args = {}, { signal } = {}) {
  let response;
  try {
    response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args: { ...args, p_token: token() } }),
      cache: 'no-store',
      signal
    });
  } catch (err) {
    if (signal && signal.aborted) throw new Error(MESSAGES.cancelled);
    throw new Error(MESSAGES.network);
  }
  let data = null;
  try { data = await response.json(); } catch (_) { data = null; }
  if (!response.ok) {
    if (data && data.code === 'ENGINE_UNAVAILABLE') throw new Error(MESSAGES.engineUnavailable);
    throw new Error((data && data.error) || MESSAGES.processingFailed);
  }
  return data;
}
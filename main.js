// main.js
import { CreateMLCEngine, prebuiltAppConfig } from "https://esm.run/@mlc-ai/web-llm";

const $ = (id) => document.getElementById(id);
const log = (s) => { const el = $('log'); if (el) { el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; } };

let engine = null;

// DEBUG: in ra danh sách model_id hợp lệ của bản web-llm hiện tại
console.log('Available models:', prebuiltAppConfig.model_list.map(m => m.model_id));

// Chọn preset NHẸ & HỢP LỆ để tránh ModelNotFoundError
const DEFAULT_MODEL_ID = "Llama-3.2-1B-Instruct-q4f32_1-MLC"; // hoặc "Llama-3.2-1B-Instruct-q4f16_1-MLC"

async function initEngine() {
  const progress = $('progress');
  if (progress) { progress.max = 1; progress.value = 0; }

  const onProgress = (r) => {
    if (progress && typeof r.progress === 'number') progress.value = r.progress;
    if (r.text) log(r.text);
  };

  // Nếu bạn có <select id="modelSelect"> thì lấy từ đó, ngược lại dùng DEFAULT
  const select = $('modelSelect');
  const modelId = select?.value || DEFAULT_MODEL_ID;

  log('Bắt đầu nạp engine và model: ' + modelId);
  engine = await CreateMLCEngine(modelId, {
    appConfig: prebuiltAppConfig,
    initProgressCallback: onProgress
  });
  log('Đã sẵn sàng. Bạn có thể chat offline.');
}

async function sendMessage() {
  const input = $('userInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  renderMsg(text, 'user');

  if (!engine) {
    renderMsg("Model chưa nạp. Bấm 'Nạp model' trước.", 'ai');
    return;
  }

  const messages = [
    { role: 'system', content: 'You are a helpful assistant that answers in Vietnamese.' },
    { role: 'user', content: text },
  ];

  let reply = '';
  const aiEl = renderMsg('', 'ai');

  const resp = await engine.chat.completions.create({
    messages,
    stream: true,
  });

  for await (const chunk of resp) {
    const delta = chunk?.choices?.[0]?.delta?.content || '';
    reply += delta;
    aiEl.textContent = reply;
  }
}

function renderMsg(text, who) {
  const box = $('chatBox');
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  box?.appendChild(div);
  if (box) box.scrollTop = box.scrollHeight;
  return div;
}

// Gắn event
window.addEventListener('DOMContentLoaded', () => {
  $('btnPreload')?.addEventListener('click', initEngine);
  $('sendBtn')?.addEventListener('click', sendMessage);
  $('userInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  // Nút xóa cache (nếu có)
  $('btnReset')?.addEventListener('click', async () => {
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        for (const n of names) await caches.delete(n);
      }
      await engine?.unload?.();
      engine = null;
      $('log').textContent = '';
      $('progress').value = 0;
      alert('Đã xóa cache (UI + model). Reload trang và nạp model lại.');
    } catch (e) {
      console.error(e);
    }
  });
});

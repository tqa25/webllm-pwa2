import { CreateMLCEngine, prebuiltAppConfig } from "https://esm.run/@mlc-ai/web-llm";

console.log('Available models:', prebuiltAppConfig.model_list.map(m => m.model_id));

// Preset an toàn cho mobile (1B, q4)
const DEFAULT_MODEL_ID = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

const el = (id) => document.getElementById(id);
const log = (m) => { el('log').textContent += m + "\n"; el('log').scrollTop = el('log').scrollHeight; };


let engine = null; // MLCEngine instance


async function initEngine() {

const modelId = DEFAULT_MODEL_ID; // hoặc lấy từ <select>
const progressEl = document.getElementById('progress');
const logEl = document.getElementById('log');
  
const preset = el('modelSelect').value;
const baseUrl = el('baseUrl').value.trim();
const files = el('filePicker').files;


// Hiển thị tiến độ nạp
const progress = el('progress');
progress.value = 0; progress.max = 1;


const onProgress = (r) => {
    if (typeof r.progress === 'number') progressEl.value = r.progress;
    if (r.text) {
      logEl.textContent += r.text + "\n";
      logEl.scrollTop = logEl.scrollHeight;
    }
  };

engine = await CreateMLCEngine(
  modelId,
  { appConfig: prebuiltAppConfig, initProgressCallback: onProgress }
);
logEl.textContent += "Đã sẵn sàng. Bạn có thể chat offline.\n";

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnPreload')?.addEventListener('click', initEngine);
});

// Cấu hình model
let modelConfig = { model: preset };


// Nếu người dùng cung cấp base URL tùy chỉnh (host shard qua HTTP)
if (baseUrl) {
modelConfig = {
model: {
model_id: "custom-local",
// Tối giản: chỉ cần chỉ base URL; WebLLM sẽ tìm các file chuẩn trong thư mục
model_url: baseUrl
}
};
}


// Nếu người dùng up file shard trực tiếp
if (files && files.length) {
const fileList = [];
for (const f of files) fileList.push(f);
modelConfig = {
model: {
model_id: "custom-files",
model_lib_url: null,
// Truyền file blob trực tiếp (WebLLM có hỗ trợ nạp từ File/Blob)
files: fileList
}
};
}


log("Bắt đầu nạp engine và model...");


});

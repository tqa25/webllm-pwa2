import { CreateMLCEngine, prebuiltAppConfig } from "https://esm.run/@mlc-ai/web-llm";


const el = (id) => document.getElementById(id);
const log = (m) => { el('log').textContent += m + "\n"; el('log').scrollTop = el('log').scrollHeight; };


let engine = null; // MLCEngine instance


async function initEngine() {
const preset = el('modelSelect').value;
const baseUrl = el('baseUrl').value.trim();
const files = el('filePicker').files;


// Hiển thị tiến độ nạp
const progress = el('progress');
progress.value = 0; progress.max = 1;


const onProgress = (report) => {
// report: { progress, text }
if (typeof report.progress === 'number') progress.value = report.progress;
if (report.text) log(report.text);
};


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

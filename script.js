// Import ESM chính thức từ MLC
import { CreateMLCEngine } from "https://esm.sh/@mlc-ai/web-llm@0.2.79";

const $ = (id) => document.getElementById(id);
const modelSel   = $("model");
const maxTokens  = $("maxTokens");
const initBtn    = $("initBtn");
const sendBtn    = $("sendBtn");
const inputEl    = $("input");
const outputEl   = $("output");
const statusEl   = $("status");
const progressEl = $("progress");

let engine = null;

function setStatus(text) { statusEl.textContent = text; }
function setProgress(v) {
  if (v == null) { progressEl.hidden = true; return; }
  progressEl.hidden = false; progressEl.value = v;
}

async function initEngine() {
  try {
    setStatus("Đang khởi tạo… (chuẩn bị tải model)");
    setProgress(0);

    const model_id = modelSel.value; // PHẢI có hậu tố -MLC
    engine = await CreateMLCEngine(model_id, {
      initProgressCallback: ({ progress, text }) => {
        setStatus(text || `Đang tải model: ${(progress*100).toFixed(1)}%`);
        if (typeof progress === "number") setProgress(progress);
      },
    });

    setProgress(null);
    setStatus("Đã sẵn sàng.");
    sendBtn.disabled = false;
  } catch (err) {
    setProgress(null);
    setStatus("Lỗi khởi tạo: " + (err && err.message ? err.message : err));
    console.error(err);
  }
}

async function send() {
  if (!engine) return;
  const user = inputEl.value.trim();
  if (!user) return;

  outputEl.textContent = "Đang suy nghĩ…";
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user",   content: user }
  ];

  let reply = "";
  try {
    const stream = await engine.chat.completions.create({
      messages, stream: true, max_tokens: Number(maxTokens.value) || 256,
    });
    for await (const chunk of stream) {
      reply += chunk.choices?.[0]?.delta?.content || "";
      outputEl.textContent = reply;
    }
  } catch (err) {
    outputEl.textContent = "Lỗi generate: " + (err?.message || err);
  }
}

initBtn.addEventListener("click", initEngine);
sendBtn.addEventListener("click", send);

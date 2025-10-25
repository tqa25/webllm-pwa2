// WebLLM ESM import
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const $ = (q) => document.querySelector(q);
const appState = {
  engine: null,
  abortCtrl: null,
  messages: [],    // {role:'user'|'assistant'|'system', content:string}
  loadedModelId: null,
};

// ---------- UI refs ----------
const selModel = $("#modelSelect");
const btnInit = $("#btnInit");
const btnRelease = $("#btnRelease");
const btnNew = $("#btnNew");
const btnExport = $("#btnExport");
const btnTheme = $("#btnTheme");
const btnClearCache = $("#btnClearCache");
const progressEl = $("#progress");
const progressText = $("#progressText");
const statusBadge = $("#statusBadge");
const envInfo = $("#envInfo");
const logEl = $("#log");
const loadedModelChip = $("#loadedModel");
const usageStats = $("#usageStats");
const messagesEl = $("#messages");
const inputEl = $("#input");
const btnSend = $("#btnSend");
const btnStop = $("#btnStop");

// ---------- Helpers ----------
function setBadge(text, tone="gray"){
  statusBadge.textContent = text;
  statusBadge.className = "badge " + tone;
}
function setChip(text){
  loadedModelChip.textContent = text;
}
function appendLog(line){
  logEl.textContent += (line + "\n");
  logEl.scrollTop = logEl.scrollHeight;
}
function saveHistory(){
  localStorage.setItem("webllm_chat_history", JSON.stringify(appState.messages));
  localStorage.setItem("webllm_loaded_model", appState.loadedModelId || "");
}
function loadHistory(){
  try{
    const m = JSON.parse(localStorage.getItem("webllm_chat_history")||"[]");
    if(Array.isArray(m)) appState.messages = m;
    appState.loadedModelId = localStorage.getItem("webllm_loaded_model") || null;
  }catch(e){}
}
function renderMessages(){
  messagesEl.innerHTML = "";
  for(const msg of appState.messages){
    const el = document.createElement("div");
    el.className = "msg " + (msg.role === "user" ? "user" : "assistant");
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = msg.role === "user" ? "U" : "A";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = formatMarkdownBasic(msg.content);
    el.append(avatar,bubble);
    messagesEl.append(el);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function formatMarkdownBasic(text){
  // very small MD: code block ``` ```
  const fenced = text.replace(/```([\s\S]*?)```/g, (_,code) => {
    return `<pre class="code">${escapeHtml(code)}</pre>`;
  });
  // inline code
  const inline = fenced.replace(/`([^`]+)`/g, (_,code)=>`<code class="code">${escapeHtml(code)}</code>`);
  // paragraphs
  return inline.replace(/\n\n+/g, "<br/><br/>").replace(/\n/g,"<br/>");
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }

function setProgress(v, label){
  progressEl.value = v ?? 0;
  progressText.textContent = label || "";
}

function ensureTheme(){
  const t = localStorage.getItem("theme") || "dark";
  document.body.classList.toggle("light", t==="light");
}
function toggleTheme(){
  const cur = document.body.classList.contains("light") ? "light":"dark";
  const next = cur === "light" ? "dark":"light";
  localStorage.setItem("theme", next);
  ensureTheme();
}

// ---------- WebGPU check ----------
async function ensureWebGPU(){
  if(!("gpu" in navigator)) {
    throw new Error("Trình duyệt không hỗ trợ WebGPU. Hãy dùng Chrome/Edge mới và bật WebGPU.");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if(!adapter) throw new Error("Không lấy được GPU adapter.");
  const adapterInfo = await adapter.requestAdapterInfo?.().catch(()=>null);
  envInfo.textContent = adapterInfo ? `GPU: ${adapterInfo.description || adapterInfo.vendor || "Unknown"}` : "GPU adapter OK";
}

// ---------- Engine lifecycle ----------
function bindProgress(engine){
  engine.setInitProgressCallback((r)=>{
    if (r?.progress != null) setProgress(r.progress, r.text || "");
    if (r?.text) appendLog(r.text);
  });
}

async function initEngine(){
  try{
    setBadge("Đang kiểm tra WebGPU...", "gray");
    await ensureWebGPU();
    setBadge("Khởi tạo...", "gray");
    if (!appState.engine){
      appState.engine = new webllm.MLCEngine();
      bindProgress(appState.engine);
    }
    const modelId = selModel.value;
    setChip(`Đang nạp: ${modelId}`);
    appendLog(`reload(${modelId}) ...`);
    await appState.engine.reload(modelId, {});
    appState.loadedModelId = modelId;
    setBadge("Đã nạp model","green");
    setChip(`Đã nạp: ${modelId}`);
    setProgress(1,"Hoàn tất");
    saveHistory();
  }catch(err){
    setBadge("Lỗi khởi tạo", "gray");
    setChip("Chưa nạp model");
    setProgress(0, String(err.message || err));
    appendLog("ERROR: " + (err.message || err));
  }
}

async function releaseEngine(){
  try{
    if (appState.engine){
      await appState.engine.unload();
    }
    appState.loadedModelId = null;
    setBadge("Đã giải phóng","gray");
    setChip("Chưa nạp model");
    setProgress(0,"Đã giải phóng");
    saveHistory();
  }catch(e){
    appendLog("Unload error: " + (e.message || e));
  }
}

// ---------- Chat ----------
function pushUser(text){
  appState.messages.push({role:"user", content:text});
  renderMessages(); saveHistory();
}
function pushAssistant(text){
  appState.messages.push({role:"assistant", content:text});
  renderMessages(); saveHistory();
}
function updateAssistantStreaming(tmpText){
  // render last assistant message or create temp
  const last = appState.messages[appState.messages.length-1];
  if (!last || last.role!=="assistant"){
    appState.messages.push({role:"assistant", content:tmpText});
  } else {
    last.content = tmpText;
  }
  renderMessages(); // simple full re-render (good enough)
}

async function sendMessage(){
  const text = inputEl.value.trim();
  if(!text) return;
  if(!appState.engine || !appState.loadedModelId){
    appendLog("Hãy nạp model trước.");
    return;
  }
  pushUser(text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  appState.abortCtrl = new AbortController();
  const signal = appState.abortCtrl.signal;
  usageStats.textContent = "Đang tạo phản hồi...";

  try{
    const completion = await appState.engine.chat.completions.create({
      stream:true,
      messages: [
        { role:"system", content:"You are a helpful assistant." },
        ...appState.messages.map(m=>({role:m.role, content:m.content}))
      ],
      stream_options: { include_usage: true },
      signal
    });

    let acc = "";
    let lastUsage = null;
    for await (const chunk of completion){
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (delta){
        acc += delta;
        updateAssistantStreaming(acc);
      }
      // usage when available (usually in final chunks)
      const usage = chunk?.usage;
      if (usage) lastUsage = usage;
      // speed stats (non-standard extras if available)
      const extra = chunk?.extra; // WebLLM demo attaches speeds in .extra; may be null if not provided
      if (extra?.perf){
        const { prefill_tokens_per_s, decode_tokens_per_s } = extra.perf;
        usageStats.textContent = `Prefill: ${prefill_tokens_per_s?.toFixed?.(1) || "?"} tok/s · Decode: ${decode_tokens_per_s?.toFixed?.(1) || "?"} tok/s`;
      }
    }
    // finalize
    if (acc === ""){
      // ensure at least an empty assistant message exists
      updateAssistantStreaming("");
    }
    if (lastUsage){
      const { prompt_tokens, completion_tokens, total_tokens } = lastUsage;
      usageStats.textContent = `Tokens — prompt: ${prompt_tokens ?? "?"}, completion: ${completion_tokens ?? "?"}, total: ${total_tokens ?? "?"}`;
    }
    saveHistory();
  }catch(err){
    if (signal.aborted){
      usageStats.textContent = "Đã dừng.";
      return;
    }
    appendLog("Chat error: " + (err.message || err));
    usageStats.textContent = "Lỗi.";
  }finally{
    appState.abortCtrl = null;
  }
}

function stopGeneration(){
  try{ appState.abortCtrl?.abort(); }catch(e){}
}

// ---------- Events ----------
btnInit.addEventListener("click", initEngine);
btnRelease.addEventListener("click", releaseEngine);
btnSend.addEventListener("click", sendMessage);
btnStop.addEventListener("click", stopGeneration);
btnNew.addEventListener("click", ()=>{
  appState.messages = [];
  renderMessages(); saveHistory();
  usageStats.textContent = "";
});
btnExport.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({model:appState.loadedModelId, messages:appState.messages}, null, 2)], {type:"application/json"});
  const u = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:u, download:"chat_export.json"});
  a.click(); URL.revokeObjectURL(u);
});
btnTheme.addEventListener("click", toggleTheme);
btnClearCache.addEventListener("click", ()=>{
  if (confirm("Xoá lịch sử hội thoại?")){
    localStorage.removeItem("webllm_chat_history");
    localStorage.removeItem("webllm_loaded_model");
    appState.messages = [];
    appState.loadedModelId = null;
    renderMessages();
    setChip("Chưa nạp model");
    usageStats.textContent = "";
  }
});

// Auto-resize textarea & Shift+Enter
inputEl.addEventListener("input", ()=>{
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, window.innerHeight*0.4) + "px";
});
inputEl.addEventListener("keydown", (e)=>{
  if (e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    btnSend.click();
  }
});

// ---------- Boot ----------
ensureTheme();
loadHistory();

// Fill model select from official prebuilt list
(webllm.prebuiltAppConfig?.model_list || []).forEach(m=>{
  const opt = document.createElement("option");
  opt.value = m.model_id;
  opt.textContent = m.model_id;
  if (m.model_id === appState.loadedModelId) opt.selected = true;
  selModel.appendChild(opt);
});

renderMessages();
// show loaded model chip on load
setChip(appState.loadedModelId ? `Đã nạp: ${appState.loadedModelId}` : "Chưa nạp model");

// Environment info baseline
envInfo.textContent = "Kiểm tra WebGPU trước khi nạp model...";
setBadge("Chưa khởi tạo","gray");
setProgress(0,"Chưa tải");

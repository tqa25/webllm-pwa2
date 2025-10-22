import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const $ = (s)=>document.querySelector(s);
const messagesEl = $("#messages");
const inputEl = $("#input");
const sendBtn = $("#send");
const statusEl = $("#status");
const modelSel = $("#model");
const maxTokEl = $("#maxTokens");

let engine = null;
let currentModel = modelSel.value;
let initializing = false;

function addMsg(text, who="bot"){
  const div = document.createElement("div");
  div.className = "msg " + (who==="user"?"user":"bot");
  div.innerText = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

async function ensureEngine(){
  if (engine && currentModel === modelSel.value) return;
  if (initializing) return;
  initializing = true;
  statusEl.textContent = "Đang tải model… (lần đầu cần mạng)";
  currentModel = modelSel.value;
  engine = await CreateMLCEngine({
    model: currentModel,
    // optional: you can host your own model shards by providing base_url here.
    // e.g., model_id: "...", model_url: "https://your.cdn/path/"
    // See WebLLM docs for details.
  }, { initProgressCallback: (p)=>{ statusEl.textContent = `Tải: ${Math.round(p*100)}%`; } });
  statusEl.textContent = "Sẵn sàng (offline)";
  initializing = false;
}

// Handle model change
modelSel.addEventListener("change", async ()=>{
  engine = null;
  await ensureEngine();
});

async function send(){
  const text = inputEl.value.trim();
  if (!text) return;
  addMsg(text, "user");
  inputEl.value = "";
  await ensureEngine();

  const maxTokens = Math.max(32, Math.min(2048, Number(maxTokEl.value)||256));

  const place = addMsg("", "bot");
  try{
    const stream = await engine.chat.completions.create({
      messages: [{ role: "user", content: text }],
      stream: true,
      temperature: 0.6,
      max_tokens: maxTokens
    });
    for await (const chunk of stream){
      const delta = chunk?.choices?.[0]?.delta?.content ?? "";
      place.textContent += delta;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }catch(err){
    place.textContent = "Lỗi: " + (err?.message || err);
  }
}

sendBtn.addEventListener("click", send);
inputEl.addEventListener("keydown", (e)=>{
  if (e.key === "Enter" && !e.shiftKey){
    e.preventDefault(); send();
  }
});

// Boot
ensureEngine().catch(err=>{ statusEl.textContent = "Lỗi khởi tạo"; console.error(err); });

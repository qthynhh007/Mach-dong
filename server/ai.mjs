// Gemini only chooses IDs from evidence already calculated by the engine.
// No generated factual prose, numbers, citations or diagnoses reach the user.
export class aiClient {
  constructor(env, fetcher = fetch) {
    this.env = env;
    this.fetcher = (...args) => fetcher(...args);
  }
  async explain(result) {
    const provider = this.env.AI_PROVIDER || (this.env.GROQ_API_KEY ? "groq" : "gemini");
    const isGroq = provider === "groq";
    const base = {provider:isGroq ? "Groq" : "Gemini",mode:"constrainedEvidenceSelection",predictionsGenerated:false};
    if (!["groq","gemini"].includes(provider)) return {...base,status:"invalidConfiguration",message:"Nhà cung cấp AI chưa hợp lệ."};
    const key = isGroq ? this.env.GROQ_API_KEY : this.env.GEMINI_API_KEY;
    if (!key) return {...base,status:"notConfigured",message:"Chưa bật AI trên máy chủ. Báo cáo mô phỏng đã tính đầy đủ trong phạm vi dữ liệu hiện có; không cần khóa AI. Quản trị viên có thể cấu hình Groq hoặc Gemini gói miễn phí để bật phần AI đọc bằng chứng."};
    const model = isGroq ? (this.env.GROQ_MODEL || "openai/gpt-oss-20b") : (this.env.GEMINI_MODEL || "gemini-2.5-flash-lite");
    if (!/^[a-z0-9./-]+$/.test(model)) return {...base,status:"invalidConfiguration",message:"Cấu hình mô hình AI chưa hợp lệ."};
    const ids = result.evidence.map(item => item.id);
    const missingIds = result.missingInputs.map(item => item.id);
    const instruction = "Chọn tối đa 3 evidence ID quan trọng nhất cho kịch bản lúa đã cho và các ID dữ liệu còn thiếu cần đo. Chỉ chọn trong danh sách. Không tạo sự kiện, số liệu, dự đoán hoặc lời khuyên mới. Ưu tiên cảnh báo có căn cứ và thiếu dữ liệu. Trả JSON priorityEvidenceIds, missingInputIds.";
    const context = JSON.stringify({inputs:result.inputs,evidence:result.evidence,missingInputs:result.missingInputs});
    try {
      const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const payload = isGroq ? {
        model,temperature:0,max_completion_tokens:1024,reasoning_effort:"low",
        messages:[{role:"system",content:instruction},{role:"user",content:context}],
        response_format:{type:"json_schema",json_schema:{name:"evidenceSelection",strict:true,schema:{
          type:"object",additionalProperties:false,required:["priorityEvidenceIds","missingInputIds"],
          properties:{priorityEvidenceIds:{type:"array",items:{type:"string",enum:ids}},
            missingInputIds:{type:"array",items:missingIds.length ? {type:"string",enum:missingIds} : {type:"string"}}}
        }}}
      } : {systemInstruction:{parts:[{text:instruction}]},
          contents:[{role:"user",parts:[{text:context}]}],
          generationConfig:{temperature:0,maxOutputTokens:512,responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{priorityEvidenceIds:{type:"ARRAY",items:{type:"STRING",enum:ids},maxItems:3},missingInputIds:{type:"ARRAY",items:{type:"STRING"},maxItems:missingIds.length}},required:["priorityEvidenceIds","missingInputIds"]}}
      };
      const response = await this.fetcher(url,{method:"POST",signal:AbortSignal.timeout(15000),
        headers:{"Content-Type":"application/json",...(isGroq ? {Authorization:`Bearer ${key}`} : {"x-goog-api-key":key})},body:JSON.stringify(payload)});
      if (!response.ok) return {...base,status:response.status === 429 ? "quotaExceeded" : "unavailable",message:"AI đang hết hạn mức hoặc tạm không khả dụng. Kết quả mô phỏng có nguồn vẫn được giữ nguyên."};
      const body = await response.json();
      const candidate = isGroq ? body.choices?.[0] : body.candidates?.[0];
      if (isGroq ? candidate?.finish_reason !== "stop" : candidate?.finishReason !== "STOP") throw new Error("Incomplete response");
      const selected = JSON.parse(isGroq ? candidate.message.content : candidate.content.parts.filter(part => !part.thought).map(part => part.text || "").join(""));
      if (!selected || Object.keys(selected).sort().join(",") !== "missingInputIds,priorityEvidenceIds") throw new Error("Unexpected keys");
      for (const [key, allowed, limit] of [["priorityEvidenceIds",ids,3],["missingInputIds",missingIds,missingIds.length]]) {
        if (!Array.isArray(selected[key]) || selected[key].length > limit || new Set(selected[key]).size !== selected[key].length || selected[key].some(id => !allowed.includes(id))) throw new Error("Ungrounded output");
      }
      return {...base,status:"ready",model,...selected,message:`${base.provider} đã chọn các bằng chứng cần chú ý; số liệu và nội dung vẫn lấy nguyên từ mô hình có nguồn.`};
    } catch {
      return {...base,status:"rejectedOrUnavailable",message:"Không nhận được phản hồi AI hợp lệ. Hệ thống đã bỏ phản hồi đó và giữ kết quả có nguồn."};
    }
  }
}

// Gemini only chooses IDs from evidence already calculated by the engine.
// No generated factual prose, numbers, citations or diagnoses reach the user.
export class aiClient {
  constructor(env, fetcher = fetch) {
    this.env = env;
    this.fetcher = (...args) => fetcher(...args);
  }
  async explain(result) {
    const base = {provider:"Gemini",mode:"constrainedEvidenceSelection",predictionsGenerated:false};
    if (!this.env.GEMINI_API_KEY) return {...base,status:"notConfigured",message:"Quản trị viên chưa cấu hình khóa Gemini trên máy chủ. Kết quả hiện tại do mô hình tham chiếu tính, chưa có AI tham gia."};
    const model = this.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    if (!/^[a-z0-9.-]+$/.test(model)) return {...base,status:"invalidConfiguration",message:"Cấu hình mô hình AI chưa hợp lệ."};
    const ids = result.evidence.map(item => item.id);
    const missingIds = result.missingInputs.map(item => item.id);
    try {
      const response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":this.env.GEMINI_API_KEY},signal:AbortSignal.timeout(15000),
        body:JSON.stringify({systemInstruction:{parts:[{text:"Chọn tối đa 3 evidence ID quan trọng nhất cho kịch bản lúa đã cho và các ID dữ liệu còn thiếu cần đo. Chỉ chọn trong danh sách. Không tạo sự kiện, số liệu, dự đoán hoặc lời khuyên mới. Ưu tiên cảnh báo có căn cứ và thiếu dữ liệu."}]},
          contents:[{role:"user",parts:[{text:JSON.stringify({inputs:result.inputs,evidence:result.evidence,missingInputs:result.missingInputs})}]}],
          generationConfig:{temperature:0,maxOutputTokens:512,responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{priorityEvidenceIds:{type:"ARRAY",items:{type:"STRING",enum:ids},maxItems:3},missingInputIds:{type:"ARRAY",items:{type:"STRING"},maxItems:missingIds.length}},required:["priorityEvidenceIds","missingInputIds"]}}
        })});
      if (!response.ok) return {...base,status:response.status === 429 ? "quotaExceeded" : "unavailable",message:"AI đang hết hạn mức hoặc tạm không khả dụng. Kết quả mô phỏng có nguồn vẫn được giữ nguyên."};
      const body = await response.json();
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason !== "STOP") throw new Error("Incomplete response");
      const selected = JSON.parse(candidate.content.parts.filter(part => !part.thought).map(part => part.text || "").join(""));
      if (!selected || Object.keys(selected).sort().join(",") !== "missingInputIds,priorityEvidenceIds") throw new Error("Unexpected keys");
      for (const [key, allowed, limit] of [["priorityEvidenceIds",ids,3],["missingInputIds",missingIds,missingIds.length]]) {
        if (!Array.isArray(selected[key]) || selected[key].length > limit || new Set(selected[key]).size !== selected[key].length || selected[key].some(id => !allowed.includes(id))) throw new Error("Ungrounded output");
      }
      return {...base,status:"ready",model,...selected,message:"Gemini đã chọn các bằng chứng cần chú ý; số liệu và nội dung vẫn lấy nguyên từ mô hình có nguồn."};
    } catch {
      return {...base,status:"rejectedOrUnavailable",message:"Không nhận được phản hồi AI hợp lệ. Hệ thống đã bỏ phản hồi đó và giữ kết quả có nguồn."};
    }
  }
}

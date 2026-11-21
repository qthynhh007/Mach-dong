// Groq only chooses IDs from evidence already calculated by the engine.
// No generated factual prose, numbers, citations or diagnoses reach the user.
export class aiClient {
  constructor(env, fetcher = fetch) {
    this.env = env;
    this.fetcher = (...args) => fetcher(...args);
  }
  async explain(result) {
    const base = {provider:"Groq",mode:"constrainedEvidenceSelection",predictionsGenerated:false};
    const key = this.env.GROQ_API_KEY;
    if (!key) return {...base,status:"notConfigured",message:"Chưa bật Groq trên máy chủ. Báo cáo mô phỏng đã tính đầy đủ trong phạm vi dữ liệu hiện có; quản trị viên cần cấu hình GROQ_API_KEY để bật phần AI đọc bằng chứng."};
    const model = this.env.GROQ_MODEL || "openai/gpt-oss-20b";
    if (!/^[a-z0-9./-]+$/.test(model)) return {...base,status:"invalidConfiguration",message:"Cấu hình mô hình AI chưa hợp lệ."};
    const ids = result.evidence.map(item => item.id);
    const missingIds = result.missingInputs.map(item => item.id);
    const instruction = "Chọn tối đa 3 evidence ID quan trọng nhất cho kịch bản lúa đã cho và các ID dữ liệu còn thiếu cần đo. Chỉ chọn trong danh sách. Không tạo sự kiện, số liệu, dự đoán hoặc lời khuyên mới. Ưu tiên cảnh báo có căn cứ và thiếu dữ liệu. Trả JSON priorityEvidenceIds, missingInputIds.";
    const context = JSON.stringify({inputs:result.inputs,evidence:result.evidence,missingInputs:result.missingInputs});
    try {
      const url = "https://api.groq.com/openai/v1/chat/completions";
      const payload = {
        model,temperature:0,max_completion_tokens:1024,reasoning_effort:"low",
        messages:[{role:"system",content:instruction},{role:"user",content:context}],
        response_format:{type:"json_schema",json_schema:{name:"evidenceSelection",strict:true,schema:{
          type:"object",additionalProperties:false,required:["priorityEvidenceIds","missingInputIds"],
          properties:{priorityEvidenceIds:{type:"array",items:{type:"string",enum:ids}},
            missingInputIds:{type:"array",items:missingIds.length ? {type:"string",enum:missingIds} : {type:"string"}}}
        }}}
      };
      const response = await this.fetcher(url,{method:"POST",signal:AbortSignal.timeout(15000),
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify(payload)});
      if (!response.ok) return {...base,status:response.status === 429 ? "quotaExceeded" : "unavailable",message:"AI đang hết hạn mức hoặc tạm không khả dụng. Kết quả mô phỏng có nguồn vẫn được giữ nguyên."};
      const body = await response.json();
      const candidate = body.choices?.[0];
      if (candidate?.finish_reason !== "stop") throw new Error("Incomplete response");
      const selected = JSON.parse(candidate.message.content);
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

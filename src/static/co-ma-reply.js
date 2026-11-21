export function parseCoMaReply(reply) {
  const text=String(reply || "").replace(/\r\n?/g,"\n").trim();
  const headings=[...text.matchAll(/\*{0,2}(Nhận định|Điều kiện đáng chú ý|Việc nên làm|Cần kiểm tra thêm|Cần đo thêm|Khi cần hỗ trợ|Khi nào cần nhờ cán bộ nông nghiệp)\*{0,2}\s*:\s*\*{0,2}/giu)];
  const parts=[];
  const intro=text.slice(0,headings[0]?.index ?? text.length).trim();
  if(intro) parts.push({heading:"",text:intro});
  headings.forEach((heading,index)=>parts.push({heading:heading[1],text:text.slice(heading.index+heading[0].length,headings[index+1]?.index ?? text.length).trim()}));
  return parts.map(part=>{
    const steps=[...part.text.matchAll(/(?:^|\s)([1-9]\d?)\.\s+/g)];
    if(steps.length) return {...part,prefix:part.text.slice(0,steps[0].index).trim(),items:steps.map((step,i)=>part.text.slice(step.index+step[0].length,steps[i+1]?.index ?? part.text.length).trim()),ordered:true};
    const bullets=[...part.text.matchAll(/(?:^|\n)\s*[-•]\s+/g)];
    if(bullets.length) return {...part,prefix:part.text.slice(0,bullets[0].index).trim(),items:bullets.map((bullet,i)=>part.text.slice(bullet.index+bullet[0].length,bullets[i+1]?.index ?? part.text.length).trim()),ordered:false};
    return part;
  });
}

export function safeAssistantSources(sources,origin) {
  if(!Array.isArray(sources)) return [];
  const seen=new Set(),result=[];
  for(const source of sources) {
    if(typeof source?.url!=="string" || typeof source?.title!=="string") continue;
    try {
      const url=new URL(source.url,origin);
      const local=url.origin===origin && url.pathname.startsWith("/community/samples/");
      if((url.protocol!=="https:" && !local) || seen.has(url.href)) continue;
      seen.add(url.href);result.push({title:source.title,url:url.href});
    } catch { /* A malformed citation must never discard an otherwise valid reply. */ }
  }
  return result;
}

export function renderCoMaReply(document,target,reply) {
  for(const part of parseCoMaReply(reply)) {
    const section=document.createElement(part.heading ? "section" : "div");
    section.className="assistant-reply-section"+(part.heading.toLocaleLowerCase("vi")==="việc nên làm" ? " assistant-reply-actions" : "");
    if(part.heading) {const heading=document.createElement("h3");heading.textContent=part.heading;section.append(heading);}
    for(const text of (part.items ? part.prefix : part.text).split(/\n\s*\n/).filter(Boolean)) {
      const paragraph=document.createElement("p");paragraph.textContent=text;section.append(paragraph);
    }
    if(part.items) {
      const list=document.createElement(part.ordered ? "ol" : "ul");
      for(const text of part.items) {const item=document.createElement("li");item.textContent=text;list.append(item);}
      section.append(list);
    }
    target.append(section);
  }
}

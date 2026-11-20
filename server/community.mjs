import forumSeed from "./data/forum-seed.json" with {type:"json"};
import {accountController,accountError} from "./auth.mjs";
import {referenceFiles} from "./reference.mjs";

const forumPhotos = Object.fromEntries(JSON.parse(referenceFiles["forum-photo-assets.json"]).flatMap(asset => asset.posts.map(id => [id,asset])));

class communityApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const communityTopics = new Set(["water","crop-care","sowing","field-alert"]);
const communityCultivars = new Set(["OM5451","ST25","OM18","Đài Thơm 8","Khác"]);
const communityStages = new Set(["Mạ non","Đẻ nhánh","Làm đòng","Trổ bông","Chín vàng"]);
const examplePhotos = new Set(["/static/assets/stitch-forum-field.jpg","/static/assets/stitch-forum-roots.jpg"]);
const communityEncoder = new TextEncoder();
const communityNow = () => new Date().toISOString();
const communityNormalize = value => String(value || "").toLocaleLowerCase("vi-VN").replace(/đ/g,"d").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const communitySearchText = (post,author,location) => communityNormalize([post.title,post.body,author,location,post.cultivar].join(" "));
const communityReply = (data, status = 200, error = null) => new Response(JSON.stringify({data,error}), {status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const communityText = (payload,key,label,max,required = true) => {
  const value = payload[key];
  if (typeof value !== "string") throw new communityApiError(`${label} phải là văn bản.`);
  const text = value.trim();
  if (required && !text) throw new communityApiError(`Hãy nhập ${label.toLowerCase()}.`);
  if (text.length > max || text.includes("\0")) throw new communityApiError(`${label} tối đa ${max} ký tự và không chứa ký tự rỗng.`);
  return text;
};
const communityVersion = (item,payload) => {
  if (!Number.isInteger(payload.version) || payload.version < 0) throw new communityApiError("Thiếu phiên bản dữ liệu hợp lệ.");
  if (item.version !== payload.version) throw new communityApiError("Nội dung đã thay đổi ở phiên khác. Hãy tải lại trước khi sửa.",409);
};
const communityRequestId = payload => {
  const value = payload.requestId ?? crypto.randomUUID();
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{8,80}$/.test(value)) throw new communityApiError("Mã yêu cầu không hợp lệ.");
  return value;
};

export class communityController {
  constructor(env) { this.env = env; this.db = env.DB; this.bucket = env.BUCKET; }
  async handle(request) {
    if (!this.db || !this.bucket) return communityReply(null,503,"Kho diễn đàn trên máy chủ chưa được cấu hình.");
    try { await this.seed(); return await this.route(request); }
    catch (error) {
      if (!(error instanceof communityApiError) && !(error instanceof accountError)) console.error("Community service failure",{type:error?.name,message:String(error?.message || "").slice(0,250)});
      const status = error instanceof communityApiError || error instanceof accountError ? error.status : 503;
      return communityReply(null,status,status === 503 ? "Diễn đàn tạm thời không khả dụng. Bài viết chưa được lưu." : error.message);
    }
  }
  async session(request, required = false, csrf = false) {
    if (!request.headers.get("authorization")) {
      if (required) throw new communityApiError("Hãy đăng nhập để tham gia thảo luận.",401);
      return null;
    }
    try {
      const {row} = await new accountController(this.env).session(request,csrf);
      return {id:`user:${row.user_id}`,name:row.name};
    } catch (error) {
      if (required) throw error;
      return null;
    }
  }
  async seed() {
    const seeded = await this.db.prepare("SELECT 1 FROM community_metadata WHERE key='forum-v1'").first();
    if (seeded) { await this.fillSearch(); return; }
    const now = communityNow();
    const statements = [];
    const member = (id,name,location = "") => this.db.prepare("INSERT OR IGNORE INTO community_members(id,display_name,location,is_guest) VALUES(?,?,?,0)").bind(id,name,location);
    statements.push(member(forumSeed.editorialAuthor,"Admin"));
    for (const [id,source] of Object.entries(forumSeed.editorial)) {
      statements.push(this.db.prepare("INSERT OR IGNORE INTO community_posts(id,author_id,topic,cultivar,stage,title,body,photos,created_at,updated_at,is_sample,base_score,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,forumSeed.editorialAuthor,"references","","",source.title,`Tài liệu của ${source.byline}.\n${source.date}.`,"[]",now,now,0,0,id));
    }
    forumSeed.samples.forEach((post,index) => {
      const authorId = `sample-${index}`;
      statements.push(member(authorId,post.author,post.location || ""));
      statements.push(this.db.prepare("INSERT OR IGNORE INTO community_posts(id,author_id,topic,cultivar,stage,title,body,photos,created_at,updated_at,is_sample,base_score,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(post.id,authorId,post.topic,post.cultivar,post.stage,post.title,post.body,JSON.stringify(post.photos),now,now,1,post.score,post.id));
      (forumSeed.replies[post.id] || []).forEach((reply,replyIndex) => {
        const replyId = `sample-${post.id}-${replyIndex}`;
        statements.push(member(replyId,reply.author));
        statements.push(this.db.prepare("INSERT OR IGNORE INTO community_replies(id,post_id,author_id,parent_id,body,created_at,updated_at,request_id) VALUES(?,?,?,?,?,?,?,?)")
          .bind(replyId,post.id,replyId,null,reply.body,now,now,replyId));
      });
    });
    statements.push(this.db.prepare("INSERT OR IGNORE INTO community_metadata(key,value) VALUES('forum-v1','1')"));
    await this.db.batch(statements);
    await this.fillSearch();
  }
  async fillSearch() {
    const missing = await this.db.prepare("SELECT p.id,p.title,p.body,p.cultivar,m.display_name AS author,m.location FROM community_posts p JOIN community_members m ON m.id=p.author_id WHERE p.search_text='' LIMIT 100").all();
    if (missing.results?.length) await this.db.batch(missing.results.map(post => this.db.prepare("UPDATE community_posts SET search_text=? WHERE id=? AND search_text=''").bind(communitySearchText(post,post.author,post.location),post.id)));
  }
  async body(request) {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new communityApiError("Yêu cầu phải có nội dung JSON.",415);
    if (Number(request.headers.get("content-length") || 0) > 1_100_000) throw new communityApiError("Nội dung vượt giới hạn dung lượng.",413);
    const text = await request.text();
    if (communityEncoder.encode(text).length > 1_100_000) throw new communityApiError("Nội dung vượt giới hạn dung lượng.",413);
    try { const data = JSON.parse(text); if (data && typeof data === "object" && !Array.isArray(data)) return data; }
    catch { /* invalid JSON */ }
    throw new communityApiError("Nội dung JSON phải là một đối tượng.");
  }
  async photoFields(photos,origin) {
    if (!Array.isArray(photos) || photos.length > 4) throw new communityApiError("Mỗi bài có tối đa 4 ảnh.");
    const result = [];
    for (const photo of photos) {
      if (examplePhotos.has(photo)) { result.push(photo); continue; }
      if (typeof photo !== "string") throw new communityApiError("Ảnh không hợp lệ.");
      const existing = `${origin}/api/community/photos/`;
      if (photo.startsWith(existing) && /^[0-9a-f-]{36}$/.test(photo.slice(existing.length))) { result.push(photo); continue; }
      if (!photo.startsWith("data:image/jpeg;base64,") || photo.length > 240_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.slice(23))) throw new communityApiError("Ảnh không hợp lệ. Hãy chọn lại ảnh JPG, PNG hoặc WebP.");
      let bytes;
      try { bytes = Uint8Array.from(atob(photo.slice(23)),x => x.charCodeAt(0)); }
      catch { throw new communityApiError("Không đọc được ảnh đính kèm."); }
      if (bytes.length < 100 || bytes.length > 180_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new communityApiError("Ảnh JPG không hợp lệ.");
      const key = crypto.randomUUID();
      await this.bucket.put(`community/${key}.jpg`,bytes,{httpMetadata:{contentType:"image/jpeg"}});
      result.push(`${origin}/api/community/photos/${key}`);
    }
    return result;
  }
  async fields(payload,origin,draft = false) {
    const title = communityText(payload,"title","Tiêu đề",120,!draft);
    const body = communityText(payload,"body","Nội dung",5000,!draft);
    for (const [key,values,label] of [["topic",communityTopics,"Chủ đề"],["cultivar",communityCultivars,"Giống lúa"],["stage",communityStages,"Giai đoạn"]]) {
      if (!values.has(payload[key])) throw new communityApiError(`${label} không hợp lệ.`);
    }
    return {title,body,topic:payload.topic,cultivar:payload.cultivar,stage:payload.stage,photos:await this.photoFields(payload.photos ?? [],origin)};
  }
  postQuery() { return `SELECT p.id,p.author_id AS authorId,p.topic,p.cultivar,p.stage,p.title,p.body,p.photos,p.created_at AS createdAt,p.updated_at AS updatedAt,p.version,p.is_sample AS isSample,p.base_score AS baseScore,p.accepted_reply_id AS acceptedReplyId,m.display_name AS author,m.location,
    p.base_score+(SELECT COUNT(*) FROM community_post_votes v WHERE v.post_id=p.id) AS score,
    EXISTS(SELECT 1 FROM community_post_votes v WHERE v.post_id=p.id AND v.member_id=?) AS voted,
    (SELECT COUNT(*) FROM community_replies r WHERE r.post_id=p.id AND r.is_deleted=0 AND r.parent_id IS NULL) AS answerCount
    FROM community_posts p JOIN community_members m ON m.id=p.author_id`; }
  async post(id,memberId = "") {
    const row = await this.db.prepare(this.postQuery()+" WHERE p.id=?").bind(memberId,id).first();
    if (!row) throw new communityApiError("Không tìm thấy bài viết hoặc bài đã bị xóa.",404);
    return this.presentPost(row,memberId);
  }
  presentPost(row,memberId,summary = false) {
    const post = {...row,photos:JSON.parse(row.photos),isSample:!!row.isSample,voted:!!row.voted,canEdit:row.authorId === memberId,canVote:!!memberId && row.authorId !== memberId};
    const photo = forumPhotos[post.id];
    if (photo && (post.isSample || post.authorId === forumSeed.editorialAuthor)) {
      post.photos = [photo.src]; post.photoCredits = {[photo.src]:photo};
    }
    if (post.authorId === forumSeed.editorialAuthor && forumSeed.editorial[post.id]) post.sourceUrl = forumSeed.editorial[post.id].url;
    if (summary) { post.body = post.body.slice(0,300)+(post.body.length > 300 ? "…" : ""); post.photos = post.photos.slice(0,1); }
    return post;
  }
  replyQuery() { return `SELECT r.id,r.post_id AS postId,r.author_id AS authorId,r.parent_id AS parentId,r.body,r.created_at AS createdAt,r.updated_at AS updatedAt,r.version,r.is_deleted AS isDeleted,m.display_name AS author,
    (SELECT COUNT(*) FROM community_reply_votes v WHERE v.reply_id=r.id) AS score,
    EXISTS(SELECT 1 FROM community_reply_votes v WHERE v.reply_id=r.id AND v.member_id=?) AS voted
    FROM community_replies r JOIN community_members m ON m.id=r.author_id`; }
  async reply(id,postId,memberId = "") {
    const row = await this.db.prepare(this.replyQuery()+" WHERE r.id=? AND r.post_id=?").bind(memberId,id,postId).first();
    if (!row || row.isDeleted) throw new communityApiError("Không tìm thấy câu trả lời hoặc câu trả lời đã bị xóa.",404);
    return row;
  }
  owner(item,memberId) { if (item.authorId !== memberId) throw new communityApiError("Chỉ tác giả mới được thực hiện thao tác này.",403); }
  async list(url,memberId) {
    const query = (url.searchParams.get("q") || "").trim(),topic = url.searchParams.get("topic") || "",sort = url.searchParams.get("sort") || "newest",status = url.searchParams.get("status") || "",mine = url.searchParams.get("mine") === "1";
    const page = Number(url.searchParams.get("page") || 1),pageSize = Number(url.searchParams.get("pageSize") || 10);
    if (query.length > 200 || (topic && !communityTopics.has(topic) && topic !== "references")) throw new communityApiError("Từ khóa hoặc chủ đề không hợp lệ.");
    if (!["newest","oldest","helpful"].includes(sort) || !["","unanswered","solved"].includes(status) || !Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 30) throw new communityApiError("Bộ lọc không hợp lệ.");
    const parts = [],bind = [];
    if (query) { parts.push("instr(p.search_text,?)>0"); bind.push(communityNormalize(query)); }
    if (topic) { parts.push("p.topic=?"); bind.push(topic); }
    if (status === "unanswered") parts.push("NOT EXISTS(SELECT 1 FROM community_replies r WHERE r.post_id=p.id AND r.is_deleted=0 AND r.parent_id IS NULL)");
    if (status === "solved") parts.push("p.accepted_reply_id IS NOT NULL");
    if (mine) { parts.push("p.author_id=?"); bind.push(memberId); }
    const where = parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
    const total = await this.db.prepare("SELECT COUNT(*) AS count FROM community_posts p JOIN community_members m ON m.id=p.author_id"+where).bind(...bind).first();
    const order = {newest:"p.created_at DESC,p.id DESC",oldest:"p.created_at,p.id",helpful:"score DESC,p.created_at DESC,p.id DESC"}[sort];
    const rows = await this.db.prepare(this.postQuery()+where+` ORDER BY ${order} LIMIT ? OFFSET ?`).bind(memberId,...bind,pageSize,(page-1)*pageSize).all();
    return {items:(rows.results || []).map(row => this.presentPost(row,memberId,true)),total:total.count,page,pageSize,totalPages:Math.ceil(total.count/pageSize)};
  }
  async detail(id,memberId) {
    const post = await this.post(id,memberId);
    const rows = await this.db.prepare(this.replyQuery()+" WHERE r.post_id=? ORDER BY r.created_at,r.id").bind(memberId,id).all();
    const replies = (rows.results || []).map(row => ({...row,voted:!!row.voted,isDeleted:!!row.isDeleted,canEdit:row.authorId === memberId && !row.isDeleted,canVote:!!memberId && row.authorId !== memberId && !row.isDeleted,isAccepted:post.acceptedReplyId === row.id,canAccept:post.authorId === memberId && row.parentId === null && !row.isDeleted}));
    return {post,replies};
  }
  async memberProfile(memberId) {
    const profile = await this.db.prepare("SELECT m.display_name AS displayName,m.location,m.is_guest AS isGuest,(SELECT COUNT(*) FROM community_posts WHERE author_id=m.id) AS postCount,(SELECT COUNT(*) FROM community_replies WHERE author_id=m.id AND is_deleted=0) AS replyCount FROM community_members m WHERE m.id=?").bind(memberId).first();
    if (!profile || !(profile.postCount || profile.replyCount)) throw new communityApiError("Chưa tìm thấy hồ sơ công khai của thành viên.",404);
    const posts = await this.db.prepare("SELECT p.id,p.title,p.topic,p.cultivar,p.created_at AS createdAt,p.is_sample AS isSample,p.base_score+(SELECT COUNT(*) FROM community_post_votes v WHERE v.post_id=p.id) AS score FROM community_posts p WHERE p.author_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 6").bind(memberId).all();
    const role = memberId === forumSeed.editorialAuthor ? "Admin diễn đàn" : memberId.startsWith("sample-") ? "Hồ sơ minh họa" : profile.isGuest ? "Khách diễn đàn" : "Thành viên diễn đàn";
    const {isGuest,...rest} = profile;
    return {...rest,role,posts:posts.results || []};
  }
  async route(request) {
    const url = new URL(request.url),path = url.pathname,method = request.method,origin = url.origin;
    const photoMatch = /^\/api\/community\/photos\/([0-9a-f-]{36})$/.exec(path);
    if (photoMatch && method === "GET") {
      const object = await this.bucket.get(`community/${photoMatch[1]}.jpg`);
      return object ? new Response(object.body,{headers:{"Content-Type":"image/jpeg","Cache-Control":"public, max-age=86400","X-Content-Type-Options":"nosniff"}}) : communityReply(null,404,"Không tìm thấy ảnh.");
    }
    const member = await this.session(request,method !== "GET",method !== "GET");
    const memberId = member?.id || "";
    if (path === "/api/community/members" || !path.startsWith("/api/community/")) throw new communityApiError("Không tìm thấy tài nguyên.",404);
    if (method !== "GET") await this.db.prepare("INSERT INTO community_members(id,display_name,location,is_guest) VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name").bind(memberId,member.name,"").run();
    const memberMatch = /^\/api\/community\/members\/(.+)$/.exec(path);
    if (memberMatch && method === "GET") return communityReply(await this.memberProfile(decodeURIComponent(memberMatch[1])));
    if (path === "/api/community/posts" && method === "GET") return communityReply(await this.list(url,memberId));
    if (path === "/api/community/draft") {
      const current = await this.db.prepare("SELECT payload,version,updated_at AS updatedAt FROM community_drafts WHERE member_id=?").bind(memberId).first();
      if (method === "GET") return communityReply(current ? {payload:JSON.parse(current.payload),version:current.version,updatedAt:current.updatedAt} : {payload:null,version:0});
      const payload = await this.body(request); communityVersion(current || {version:0},payload);
      if (method === "DELETE") {
        await this.db.prepare("UPDATE community_drafts SET payload='null',version=version+1,updated_at=? WHERE member_id=?").bind(communityNow(),memberId).run();
        return communityReply({deleted:true,version:current ? current.version+1 : 0});
      }
      if (method === "PUT") {
        const fields = await this.fields(payload,origin,true),version = (current?.version || 0)+1,updatedAt = communityNow();
        await this.db.prepare("INSERT INTO community_drafts(member_id,payload,version,updated_at) VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at").bind(memberId,JSON.stringify(fields),version,updatedAt).run();
        return communityReply({payload:fields,version,updatedAt});
      }
    }
    if (path === "/api/community/posts" && method === "POST") {
      const payload = await this.body(request),requestId = communityRequestId(payload);
      const existing = await this.db.prepare("SELECT id FROM community_posts WHERE author_id=? AND request_id=?").bind(memberId,requestId).first();
      if (existing) return communityReply(await this.post(existing.id,memberId),201);
      const fields = await this.fields(payload,origin),id = crypto.randomUUID(),now = communityNow();
      await this.db.prepare("INSERT INTO community_posts(id,author_id,topic,cultivar,stage,title,body,photos,created_at,updated_at,is_sample,base_score,request_id,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,0,0,?,?)").bind(id,memberId,fields.topic,fields.cultivar,fields.stage,fields.title,fields.body,JSON.stringify(fields.photos),now,now,requestId,communitySearchText(fields,member.name,"")).run();
      if (Number.isInteger(payload.draftVersion)) await this.db.prepare("DELETE FROM community_drafts WHERE member_id=? AND version=?").bind(memberId,payload.draftVersion).run();
      return communityReply(await this.post(id,memberId),201);
    }
    const match = /^\/api\/community\/posts\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (!match) throw new communityApiError("Không tìm thấy tài nguyên.",404);
    const postId = decodeURIComponent(match[1]),tail = match[2] || "";
    if (!tail && method === "GET") return communityReply(await this.detail(postId,memberId));
    if (!tail && ["PATCH","DELETE"].includes(method)) {
      const payload = await this.body(request),post = await this.post(postId,memberId);
      this.owner(post,memberId); communityVersion(post,payload);
      if (method === "DELETE") {
        const deleted = await this.db.prepare("DELETE FROM community_posts WHERE id=? AND version=?").bind(postId,post.version).run();
        if (!deleted.meta?.changes) throw new communityApiError("Nội dung đã thay đổi ở phiên khác. Hãy tải lại trước khi xóa.",409);
        return communityReply({deleted:true});
      }
      const fields = await this.fields(payload,origin),now = communityNow();
      const updated = await this.db.prepare("UPDATE community_posts SET topic=?,cultivar=?,stage=?,title=?,body=?,photos=?,search_text=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(fields.topic,fields.cultivar,fields.stage,fields.title,fields.body,JSON.stringify(fields.photos),communitySearchText(fields,post.author,post.location),now,postId,post.version).run();
      if (!updated.meta?.changes) throw new communityApiError("Nội dung đã thay đổi ở phiên khác. Hãy tải lại trước khi sửa.",409);
      return communityReply(await this.post(postId,memberId));
    }
    if (tail === "vote" && method === "PUT") {
      const payload = await this.body(request),post = await this.post(postId,memberId);
      if (typeof payload.active !== "boolean") throw new communityApiError("Trạng thái hữu ích phải là true hoặc false.");
      if (post.authorId === memberId) throw new communityApiError("Bạn không thể tự đánh dấu nội dung của mình là hữu ích.",403);
      await this.db.prepare(payload.active ? "INSERT OR IGNORE INTO community_post_votes(post_id,member_id) VALUES(?,?)" : "DELETE FROM community_post_votes WHERE post_id=? AND member_id=?").bind(postId,memberId).run();
      const current = await this.post(postId,memberId);
      return communityReply({score:current.score,voted:current.voted});
    }
    if (tail === "accepted-reply" && method === "PUT") {
      const payload = await this.body(request),post = await this.post(postId,memberId);
      this.owner(post,memberId); communityVersion(post,payload);
      const replyId = payload.replyId;
      if (replyId !== null && typeof replyId !== "string") throw new communityApiError("Câu trả lời không hợp lệ.");
      if (replyId !== null) { const target = await this.reply(replyId,postId,memberId); if (target.parentId !== null) throw new communityApiError("Chỉ chọn câu trả lời trực tiếp cho bài viết."); }
      const updated = await this.db.prepare("UPDATE community_posts SET accepted_reply_id=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(replyId,communityNow(),postId,post.version).run();
      if (!updated.meta?.changes) throw new communityApiError("Nội dung đã thay đổi ở phiên khác. Hãy tải lại trước khi sửa.",409);
      return communityReply(await this.post(postId,memberId));
    }
    if (tail === "replies" && method === "POST") {
      await this.post(postId,memberId);
      const payload = await this.body(request),body = communityText(payload,"body","Câu trả lời",5000),requestId = communityRequestId(payload);
      const existing = await this.db.prepare("SELECT id,post_id AS postId FROM community_replies WHERE author_id=? AND request_id=?").bind(memberId,requestId).first();
      if (existing) { if (existing.postId !== postId) throw new communityApiError("Mã yêu cầu đã được sử dụng.",409); return communityReply({id:existing.id},201); }
      const parentId = payload.parentId || null;
      if (parentId !== null) {
        if (typeof parentId !== "string" || parentId.length > 100) throw new communityApiError("Câu trả lời gốc không hợp lệ.");
        let parent = await this.reply(parentId,postId,memberId),depth = 1;
        while (parent.parentId) { depth++; parent = await this.reply(parent.parentId,postId,memberId); }
        if (depth > 5) throw new communityApiError("Chuỗi trao đổi tối đa 5 cấp. Hãy trả lời ở cấp trước.");
      }
      const id = crypto.randomUUID(),now = communityNow();
      await this.db.prepare("INSERT INTO community_replies(id,post_id,author_id,parent_id,body,created_at,updated_at,request_id) VALUES(?,?,?,?,?,?,?,?)").bind(id,postId,memberId,parentId,body,now,now,requestId).run();
      return communityReply({id},201);
    }
    const replyMatch = /^replies\/([^/]+)(?:\/(vote))?$/.exec(tail);
    if (replyMatch) {
      const replyId = decodeURIComponent(replyMatch[1]),target = await this.reply(replyId,postId,memberId);
      if (replyMatch[2] === "vote" && method === "PUT") {
        const payload = await this.body(request);
        if (typeof payload.active !== "boolean") throw new communityApiError("Trạng thái hữu ích phải là true hoặc false.");
        if (target.authorId === memberId) throw new communityApiError("Bạn không thể tự đánh dấu nội dung của mình là hữu ích.",403);
        await this.db.prepare(payload.active ? "INSERT OR IGNORE INTO community_reply_votes(reply_id,member_id) VALUES(?,?)" : "DELETE FROM community_reply_votes WHERE reply_id=? AND member_id=?").bind(replyId,memberId).run();
        const current = await this.reply(replyId,postId,memberId);
        return communityReply({score:current.score,voted:!!current.voted});
      }
      if (!replyMatch[2] && ["PATCH","DELETE"].includes(method)) {
        const payload = await this.body(request); this.owner(target,memberId); communityVersion(target,payload);
        const deleted = method === "DELETE",body = deleted ? "" : communityText(payload,"body","Câu trả lời",5000),now = communityNow();
        const updated = await this.db.prepare("UPDATE community_replies SET body=?,is_deleted=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(body,deleted ? 1 : 0,now,replyId,target.version).run();
        if (!updated.meta?.changes) throw new communityApiError("Nội dung đã thay đổi ở phiên khác. Hãy tải lại trước khi sửa.",409);
        if (deleted) await this.db.batch([this.db.prepare("DELETE FROM community_reply_votes WHERE reply_id=?").bind(replyId),this.db.prepare("UPDATE community_posts SET accepted_reply_id=NULL,version=version+1,updated_at=? WHERE accepted_reply_id=?").bind(now,replyId)]);
        return communityReply({id:replyId,deleted});
      }
    }
    throw new communityApiError("Không tìm thấy tài nguyên.",404);
  }
}

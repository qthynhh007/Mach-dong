const encoder = new TextEncoder();
const sessionTtl = 7 * 24 * 3600;
const passwordRounds = 600_000;

export class accountError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function reply(data, status = 200, error = null) {
  return new Response(JSON.stringify({data, error}), {status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
  }});
}

function randomHex(length = 32) {
  return [...crypto.getRandomValues(new Uint8Array(length))].map(x => x.toString(16).padStart(2, "0")).join("");
}

function hex(bytes) { return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function bytes(hexValue) { return Uint8Array.from(hexValue.match(/../g) || [], x => parseInt(x, 16)); }
async function sha256(value) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
async function passwordHash(password, salt, iterations = passwordRounds) {
  // Workers caps each PBKDF2 call at 100,000 iterations. Chain domain-separated
  // rounds so the stored work factor can remain 600,000 without a local secret.
  let material = encoder.encode(password);
  const saltBytes = bytes(salt);
  for (let round = 0, remaining = iterations; remaining > 0; round++) {
    const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    const roundSalt = new Uint8Array(saltBytes.length + 4);
    roundSalt.set(saltBytes);
    new DataView(roundSalt.buffer).setUint32(saltBytes.length, round);
    material = new Uint8Array(await crypto.subtle.deriveBits({
      name:"PBKDF2",salt:roundSalt,iterations:Math.min(100_000,remaining),hash:"SHA-256"
    },key,256));
    remaining -= 100_000;
  }
  return hex(material);
}
function sameHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function publicUser(row) {
  return {user_id:row.user_id, username:row.username, name:row.name, email:row.email,
    email_verified:Boolean(row.email_verified), phone:row.phone, role:row.role,
    wallet_address:row.wallet_address, wallet_type:row.wallet_type, chain_id:43113,
    simulation_credits:row.simulation_credits, avax_balance:row.avax_balance};
}
function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new accountError("Email không hợp lệ.");
  return email;
}
function cleanPhone(value) {
  let phone = String(value || "").replace(/[\s().-]/g, "");
  if (phone.startsWith("0")) phone = "+84" + phone.slice(1);
  else if (phone.startsWith("84")) phone = "+" + phone;
  if (!/^\+84(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/.test(phone)) throw new accountError("Số điện thoại Việt Nam không hợp lệ.");
  return phone;
}
function checkPassword(value) {
  const password = String(value || "");
  if (password.length < 12 || encoder.encode(password).length > 256) throw new accountError("Mật khẩu cần từ 12 đến 256 ký tự UTF-8.");
  return password;
}
function checkWallet(value) {
  const address = String(value || "").trim();
  if (address && !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new accountError("Địa chỉ ví Fuji không hợp lệ.");
  return address;
}
async function bodyJson(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new accountError("Yêu cầu JSON.", 415);
  if (Number(request.headers.get("content-length") || 0) > 8192) throw new accountError("Dữ liệu quá lớn.", 413);
  const text = await request.text();
  if (encoder.encode(text).length > 8192) throw new accountError("Dữ liệu quá lớn.", 413);
  try { const body = JSON.parse(text); if (body && typeof body === "object" && !Array.isArray(body)) return body; }
  catch { /* handled below */ }
  throw new accountError("JSON không hợp lệ.");
}

export class accountController {
  constructor(env, fetcher = fetch) { this.db = env.DB; this.env = env; this.fetcher = fetcher; }
  async handle(request) {
    if (!this.db) return reply(null, 503, "Kho tài khoản chưa được cấu hình trên máy chủ.");
    try { return await this.route(request, new URL(request.url).pathname); }
    catch (error) {
      if (!(error instanceof accountError)) console.error("Account service failure", {
        type:error?.name || "Error", message:String(error?.message || "").slice(0,300),
        stack:String(error?.stack || "").slice(0,600)
      });
      return reply(null, error instanceof accountError ? error.status : 503,
        error instanceof accountError ? error.message : "Dịch vụ tài khoản tạm thời không khả dụng.");
    }
  }
  async rateLimit(request, action, max = 10) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const key = await sha256(`${action}:${ip}`);
    const until = Math.floor(Date.now() / 1000) + 900;
    await this.db.prepare("INSERT INTO account_rate_limits (key,attempts,window_until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_until < ? THEN 1 ELSE attempts+1 END,window_until=CASE WHEN window_until < ? THEN excluded.window_until ELSE window_until END").bind(key,until,until-900,until-900).run();
    const row = await this.db.prepare("SELECT attempts FROM account_rate_limits WHERE key=?").bind(key).first();
    if (row?.attempts > max) throw new accountError("Quá nhiều lần thử. Vui lòng đợi 15 phút.", 429);
  }
  async session(request, csrfRequired = false) {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new accountError("Chưa đăng nhập hoặc phiên đã hết hạn.", 401);
    const hash = await sha256(token);
    const row = await this.db.prepare("SELECT s.*,a.* FROM account_sessions s JOIN accounts a ON a.user_id=s.user_id WHERE s.token_hash=? AND s.revoked=0 AND s.expires_at>?").bind(hash,Math.floor(Date.now()/1000)).first();
    if (!row) throw new accountError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.", 401);
    if (csrfRequired && !sameHex(row.csrf_token, request.headers.get("x-csrf-token"))) throw new accountError("Thiếu hoặc sai mã bảo mật CSRF.",403);
    return {row, hash};
  }
  async issue(row) {
    const token = randomHex();
    const csrf = randomHex(24);
    const now = Math.floor(Date.now()/1000);
    await this.db.prepare("INSERT INTO account_sessions (token_hash,user_id,csrf_token,expires_at,created_at) VALUES (?,?,?,?,?)").bind(await sha256(token),row.user_id,csrf,now+sessionTtl,now).run();
    return {session_token:token,csrf_token:csrf,expires_at:now+sessionTtl,user:publicUser(row)};
  }
  async verifyOtp(email, code) {
    const row = await this.db.prepare("SELECT * FROM account_otps WHERE email=?").bind(email).first();
    if (!row || row.used || row.expires_at < Date.now()/1000 || row.attempts >= 5 || !/^\d{6}$/.test(String(code || ""))) throw new accountError("Mã email không hợp lệ hoặc đã hết hạn.",400);
    const valid = sameHex(row.code_hash, await sha256(`${row.salt}:${code}`));
    await this.db.prepare("UPDATE account_otps SET attempts=attempts+1 WHERE email=?").bind(email).run();
    if (!valid) throw new accountError("Mã email không hợp lệ hoặc đã hết hạn.",400);
    await this.db.prepare("UPDATE account_otps SET used=1 WHERE email=?").bind(email).run();
    await this.db.prepare("UPDATE accounts SET email_verified=1 WHERE email=?").bind(email).run();
  }
  async sendOtp(request, body) {
    await this.rateLimit(request,"otp",5);
    if (!this.env.AUTH_EMAIL_API_KEY || !this.env.AUTH_FROM_EMAIL) throw new accountError("Chưa cấu hình dịch vụ gửi mã email trên máy chủ.",503);
    const identifier = String(body.email || "").trim();
    let email = identifier.includes("@") ? cleanEmail(identifier) : "";
    if (body.require_existing) {
      const row = await this.db.prepare("SELECT email FROM accounts WHERE email=? OR username=?").bind(email,identifier).first();
      if (!row) return reply({email:identifier,smtp_sent:true,expires_in_seconds:300});
      email = row.email;
    }
    if (!email) throw new accountError("Email không hợp lệ.");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6,"0");
    const salt = randomHex(16);
    const sent = await this.fetcher("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${this.env.AUTH_EMAIL_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:this.env.AUTH_FROM_EMAIL,to:[email],subject:"Mã xác nhận Mạch Đồng",text:`Mã xác nhận của bạn: ${code}. Mã có hiệu lực 5 phút.`})});
    if (!sent.ok) throw new accountError("Chưa gửi được mã email. Vui lòng thử lại sau.",503);
    await this.db.prepare("INSERT INTO account_otps (email,code_hash,salt,expires_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,salt=excluded.salt,expires_at=excluded.expires_at,attempts=0,used=0").bind(email,await sha256(`${salt}:${code}`),salt,Math.floor(Date.now()/1000)+300).run();
    return reply({email,smtp_sent:true,expires_in_seconds:300});
  }
  async route(request, path) {
    const post = request.method === "POST";
    if (request.method === "GET" && path === "/api/account/config") return reply({email_otp_enabled:Boolean(this.env.AUTH_EMAIL_API_KEY && this.env.AUTH_FROM_EMAIL)});
    if (post && path === "/api/account/send-otp") return this.sendOtp(request,await bodyJson(request));
    if (post && path === "/api/account/register") {
      await this.rateLimit(request,"register",5);
      const b = await bodyJson(request);
      const username = String(b.username || "").trim();
      const name = String(b.name || "").trim();
      if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username) || name.length < 2 || name.length > 120) throw new accountError("Tên hoặc tên đăng nhập không hợp lệ.");
      const email = cleanEmail(b.email), phone = cleanPhone(b.phone), password = checkPassword(b.password);
      const wallet = checkWallet(b.wallet_address);
      const emailEnabled = Boolean(this.env.AUTH_EMAIL_API_KEY && this.env.AUTH_FROM_EMAIL);
      if (emailEnabled) await this.verifyOtp(email,b.otp_code);
      const salt = randomHex(16), hash = await passwordHash(password,salt);
      const userId = crypto.randomUUID(), now = Math.floor(Date.now()/1000);
      try { await this.db.prepare("INSERT INTO accounts (user_id,username,name,email,email_verified,phone,password_hash,password_salt,password_iterations,wallet_address,wallet_type,managed_wallet_address,encrypted_wallet_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(userId,username,name,email,emailEnabled ? 1 : 0,phone,hash,salt,passwordRounds,wallet,b.wallet_type === "AUTO_EMAIL" ? "AUTO_EMAIL" : wallet ? "EXTERNAL" : "UNLINKED",b.wallet_type === "AUTO_EMAIL" ? wallet : "",b.encrypted_wallet_key || null,now).run(); }
      catch { throw new accountError("Tên đăng nhập hoặc email đã được sử dụng.",409); }
      const row = await this.db.prepare("SELECT * FROM accounts WHERE user_id=?").bind(userId).first();
      return reply(await this.issue(row),201);
    }
    if (post && path === "/api/account/login") {
      await this.rateLimit(request,"login",20);
      const b = await bodyJson(request), identifier = String(b.identifier || "").trim();
      const normalizedPhone = /^(?:0|84|\+84)\d{9,10}$/.test(identifier) ? cleanPhone(identifier) : identifier;
      const row = await this.db.prepare("SELECT * FROM accounts WHERE username=? OR email=? OR phone=? LIMIT 1").bind(identifier,identifier.toLowerCase(),normalizedPhone).first();
      if (!row) throw new accountError("Tài khoản hoặc mật khẩu không đúng.",401);
      const now = Math.floor(Date.now()/1000);
      if (row.locked_until > now) throw new accountError("Tài khoản đang tạm khóa. Vui lòng thử lại sau.",429);
      let valid = false;
      if (b.otp_code) { await this.verifyOtp(row.email,b.otp_code); valid = true; }
      else if (typeof b.password === "string" && b.password.length < 257) valid = sameHex(row.password_hash,await passwordHash(b.password,row.password_salt,row.password_iterations));
      if (!valid) {
        await this.db.prepare("UPDATE accounts SET failed_login_attempts=failed_login_attempts+1,locked_until=CASE WHEN failed_login_attempts+1>=5 THEN ? ELSE 0 END WHERE user_id=?").bind(now+300,row.user_id).run();
        throw new accountError("Tài khoản hoặc mật khẩu không đúng.",401);
      }
      await this.db.prepare("UPDATE accounts SET failed_login_attempts=0,locked_until=0 WHERE user_id=?").bind(row.user_id).run();
      return reply(await this.issue(row));
    }
    if (request.method === "GET" && path === "/api/account/session") {
      const {row} = await this.session(request);
      return reply({authenticated:true,user:publicUser(row),csrf_token:row.csrf_token,expires_at:row.expires_at});
    }
    if (request.method === "GET" && path === "/api/account/transactions") {
      const {row} = await this.session(request);
      const result = await this.db.prepare("SELECT * FROM account_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 10").bind(row.user_id).all();
      return reply(result.results || []);
    }
    if (request.method === "GET" && path === "/api/account/field-profile") {
      const {row} = await this.session(request);
      const profile = await this.db.prepare("SELECT address,cultivar,area,hydrology_station FROM account_field_profiles WHERE user_id=?").bind(row.user_id).first();
      return reply(profile || {address:"",cultivar:"",area:"",hydrology_station:""});
    }
    if (post && path === "/api/account/field-profile") {
      const {row} = await this.session(request,true), b = await bodyJson(request);
      const values = ["address","cultivar","area","hydrology_station"].map(key => {
        if (typeof b[key] !== "string" || b[key].length > 200 || b[key].includes("\0")) throw new accountError("Thông tin ruộng không hợp lệ.");
        return b[key].trim();
      });
      await this.db.prepare("INSERT INTO account_field_profiles(user_id,address,cultivar,area,hydrology_station,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET address=excluded.address,cultivar=excluded.cultivar,area=excluded.area,hydrology_station=excluded.hydrology_station,updated_at=excluded.updated_at").bind(row.user_id,...values,new Date().toISOString()).run();
      return reply({address:values[0],cultivar:values[1],area:values[2],hydrology_station:values[3]});
    }
    if (post && path === "/api/account/bootstrap-admin") {
      const {row} = await this.session(request,true);
      const configured = String(this.env.AUTH_ADMIN_BOOTSTRAP_TOKEN || "");
      if (configured.length < 32 || !sameHex(configured,request.headers.get("x-admin-bootstrap-token"))) throw new accountError("Không được phép.",403);
      const result = await this.db.prepare("UPDATE accounts SET role='ADMIN' WHERE user_id=? AND NOT EXISTS (SELECT 1 FROM accounts WHERE role='ADMIN')").bind(row.user_id).run();
      if (!result.meta?.changes) throw new accountError("Tài khoản quản trị đã được khởi tạo.",409);
      return reply({user:publicUser(await this.db.prepare("SELECT * FROM accounts WHERE user_id=?").bind(row.user_id).first())});
    }
    if (post && path === "/api/account/logout") {
      const {hash} = await this.session(request,true);
      await this.db.prepare("UPDATE account_sessions SET revoked=1 WHERE token_hash=?").bind(hash).run();
      return reply({logged_out:true});
    }
    if (post && path === "/api/account/profile") {
      const {row} = await this.session(request,true), b = await bodyJson(request);
      const name = String(b.name || row.name).trim(), phone = b.phone ? cleanPhone(b.phone) : row.phone;
      if (name.length < 2 || name.length > 120) throw new accountError("Tên không hợp lệ.");
      if (b.wallet_address || b.wallet_mode === "AUTO_EMAIL") {
        if (this.env.AUTH_EMAIL_API_KEY && this.env.AUTH_FROM_EMAIL) await this.verifyOtp(row.email,b.otp_code);
        else if (!sameHex(row.password_hash,await passwordHash(String(b.password || ""),row.password_salt,row.password_iterations))) throw new accountError("Mật khẩu xác nhận ví không đúng.",401);
        const wallet = b.wallet_mode === "AUTO_EMAIL" ? row.managed_wallet_address : checkWallet(b.wallet_address);
        if (!wallet) throw new accountError("Chưa có ví tự động để khôi phục.");
        await this.db.prepare("UPDATE accounts SET name=?,phone=?,wallet_address=?,wallet_type=? WHERE user_id=?").bind(name,phone,wallet,b.wallet_mode === "AUTO_EMAIL" ? "AUTO_EMAIL" : "EXTERNAL",row.user_id).run();
      } else await this.db.prepare("UPDATE accounts SET name=?,phone=? WHERE user_id=?").bind(name,phone,row.user_id).run();
      return reply({user:publicUser(await this.db.prepare("SELECT * FROM accounts WHERE user_id=?").bind(row.user_id).first())});
    }
    if (post && path === "/api/account/password") {
      const {row} = await this.session(request,true), b = await bodyJson(request);
      if (!sameHex(row.password_hash,await passwordHash(String(b.current_password || ""),row.password_salt,row.password_iterations))) throw new accountError("Mật khẩu hiện tại không chính xác.",401);
      const password = checkPassword(b.new_password);
      if (password === b.current_password) throw new accountError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      const salt = randomHex(16), hash = await passwordHash(password,salt);
      if (row.encrypted_wallet_key && (typeof b.encrypted_wallet_key !== "string" || !b.encrypted_wallet_key.startsWith("v1:"))) throw new accountError("Thiếu bản mã hóa mới của ví. Hãy sao lưu khóa ví trước khi đổi mật khẩu.");
      await this.db.prepare("UPDATE accounts SET password_hash=?,password_salt=?,password_iterations=?,encrypted_wallet_key=? WHERE user_id=?").bind(hash,salt,passwordRounds,b.encrypted_wallet_key || null,row.user_id).run();
      await this.db.prepare("UPDATE account_sessions SET revoked=1 WHERE user_id=? AND token_hash<>?").bind(row.user_id,await sha256(request.headers.get("authorization").slice(7))).run();
      return reply({message:"Đã cập nhật mật khẩu thành công."});
    }
    if (post && path === "/api/account/reset-password") {
      await this.rateLimit(request,"reset",5);
      const b = await bodyJson(request), identifier = String(b.email || "").trim();
      const found = await this.db.prepare("SELECT user_id,username,email,encrypted_wallet_key FROM accounts WHERE email=? OR username=?").bind(identifier.toLowerCase(),identifier).first();
      if (!found) throw new accountError("Không thể đặt lại mật khẩu.",400);
      const email = found.email, password = checkPassword(b.new_password);
      await this.verifyOtp(email,b.otp_code);
      const row = found;
      const salt = randomHex(16), hash = await passwordHash(password,salt);
      await this.db.batch([
        this.db.prepare("UPDATE accounts SET password_hash=?,password_salt=?,password_iterations=?,failed_login_attempts=0,locked_until=0 WHERE user_id=?").bind(hash,salt,passwordRounds,row.user_id),
        this.db.prepare("UPDATE account_sessions SET revoked=1 WHERE user_id=?").bind(row.user_id)
      ]);
      return reply({email,username:row.username,message:row.encrypted_wallet_key ? "Đã đặt lại mật khẩu. Khóa ví tự tạo vẫn cần mật khẩu cũ hoặc bản sao khóa riêng đã lưu." : "Đã đặt lại mật khẩu."});
    }
    if (post && path === "/api/account/wallet-key") {
      const {row} = await this.session(request,true), b = await bodyJson(request);
      if (row.wallet_type !== "AUTO_EMAIL" || !row.encrypted_wallet_key) throw new accountError("Ví gắn ngoài do ứng dụng ví quản lý.");
      if (!sameHex(row.password_hash,await passwordHash(String(b.password || ""),row.password_salt,row.password_iterations))) throw new accountError("Mật khẩu không đúng.",401);
      return reply({wallet_address:row.wallet_address,encrypted_wallet_key:row.encrypted_wallet_key});
    }
    if (post && path === "/api/account/exchange-credits") {
      const {row} = await this.session(request,true), b = await bodyJson(request);
      const direction = String(b.direction || "AVAX_TO_CREDIT").toUpperCase();
      const amount = Number(b.amount || 0);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1000) throw new accountError("Số lượng quy đổi không hợp lệ.");
      let delta = 0, spent = 0, update;
      if (direction === "FAUCET_TOPUP") {
        spent = 1;
        update = this.db.prepare("UPDATE accounts SET avax_balance=ROUND(avax_balance+1,4) WHERE user_id=?").bind(row.user_id);
      }
      else if (direction === "AVAX_TO_CREDIT") {
        delta = Math.round(amount*100); spent = delta/100;
        if (delta<1) throw new accountError("Lượng đổi quá nhỏ.");
        update = this.db.prepare("UPDATE accounts SET avax_balance=ROUND(avax_balance-?,4),simulation_credits=simulation_credits+? WHERE user_id=? AND avax_balance>=?").bind(spent,delta,row.user_id,spent);
      }
      else if (direction === "CREDIT_TO_AVAX") {
        delta = -Math.round(amount); spent = -delta/100;
        if (delta>=0) throw new accountError("Lượng đổi quá nhỏ.");
        update = this.db.prepare("UPDATE accounts SET avax_balance=ROUND(avax_balance+?,4),simulation_credits=simulation_credits+? WHERE user_id=? AND simulation_credits>=?").bind(spent,delta,row.user_id,-delta);
      }
      else throw new accountError("Loại giao dịch không hợp lệ.");
      const tx = {tx_id:crypto.randomUUID(),user_id:row.user_id,direction,avax_amount:spent,credit_delta:delta,tx_hash:"",note:"[Giả lập] Quy đổi trong ứng dụng",created_at:Math.floor(Date.now()/1000)};
      const updatedStatements = await this.db.batch([
        update,
        this.db.prepare("INSERT INTO account_transactions (tx_id,user_id,direction,avax_amount,credit_delta,tx_hash,note,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0").bind(tx.tx_id,tx.user_id,tx.direction,tx.avax_amount,tx.credit_delta,tx.tx_hash,tx.note,tx.created_at)
      ]);
      if (!(updatedStatements[0]?.meta?.changes ?? updatedStatements[0]?.changes)) throw new accountError("Số dư không đủ.");
      const updated = await this.db.prepare("SELECT * FROM accounts WHERE user_id=?").bind(row.user_id).first();
      const history = await this.db.prepare("SELECT * FROM account_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 10").bind(row.user_id).all();
      return reply({user:publicUser(updated),transaction:tx,transactions:history.results || []});
    }
    return reply(null,404,"Không tìm thấy tài nguyên tài khoản.");
  }
}

/* View layer: presentation and HTTP calls only. Server owns data and permissions. */
(() => {
  const find = (id) => document.getElementById(id);
  const rawData = find("forum-data");
  if (!rawData) return;
  const data = JSON.parse(rawData.textContent);

  class communityApi {
    constructor(csrfToken) { this.csrfToken = csrfToken; }

    async request(path, method = "GET", payload) {
      let response;
      try {
        response = await fetch("/api/community/" + path, {
          method, credentials: "same-origin", cache: "no-store",
          headers: {"Content-Type": "application/json", "X-CSRF-Token": this.csrfToken},
          ...(payload === undefined ? {} : {body: JSON.stringify(payload)}),
        });
      } catch {
        throw new Error("Không kết nối được máy chủ. Nội dung đang nhập vẫn được giữ lại.");
      }
      let result;
      try { result = await response.json(); }
      catch { throw new Error("Máy chủ chưa trả được dữ liệu. Hãy thử lại sau."); }
      if (!response.ok) throw new Error(result.error || "Không thể hoàn thành thao tác.");
      return result.data;
    }
  }

  class communityView {
    constructor(api) { this.api = api; }

    element(tag, text = "", className = "") {
      const node = document.createElement(tag);
      node.textContent = text;
      node.className = className;
      return node;
    }

    date(value) { return new Date(value).toLocaleString("vi-VN"); }

    status(message, target = "forum-status") { find(target).textContent = message; }

    async action(button, operation, statusId = "forum-status") {
      button.disabled = true;
      this.status("", statusId);
      try { await operation(); }
      catch (error) { this.status(error.message, statusId); }
      finally { button.disabled = false; }
    }

    button(label, operation) {
      const button = this.element("button", label, "community-button");
      button.type = "button";
      button.addEventListener("click", () => this.action(button, () => operation(button)));
      return button;
    }

    picture(src) {
      if (!/^(?:\/static\/assets\/stitch-forum-(?:field|roots)\.jpg|data:image\/jpeg;base64,[A-Za-z0-9+/]+=*)$/.test(src)) return null;
      const image = new Image();
      image.src = src;
      image.alt = "Ảnh đính kèm bài chia sẻ";
      image.loading = "lazy";
      return image;
    }

    bindVote(root, post) {
      const button = root.querySelector(".forum-vote");
      const score = root.querySelector("[data-score]");
      const render = () => {
        score.textContent = "+" + post.score;
        button.setAttribute("aria-pressed", String(Boolean(post.voted)));
        button.disabled = !post.canVote;
        button.title = post.canEdit ? "Đây là bài viết của bạn" : "Đánh dấu hữu ích";
      };
      button.onclick = () => this.action(button, async () => {
        Object.assign(post, await this.api.request(`posts/${post.id}/vote`, "PUT", {active: !post.voted}));
        render();
      });
      render();
    }

    populatePost(root, post, full = false) {
      for (const field of ["author", "location", "body"]) root.querySelector(`[data-${field}]`).textContent = post[field];
      root.querySelector("[data-topic]").textContent = data.topics[post.topic];
      root.querySelector("[data-cultivar]").textContent = post.cultivar + (full ? " · " + post.stage : "");
      root.querySelector("[data-meta]").textContent = [
        post.isSample ? "Dữ liệu mẫu" : "", this.date(post.createdAt),
        `${post.answerCount} câu trả lời`, post.acceptedReplyId ? "✓ Đã giải đáp" : "",
      ].filter(Boolean).join(" · ");
      const gallery = root.querySelector("[data-photos]");
      gallery.replaceChildren(...post.photos.map((src) => this.picture(src)).filter(Boolean));
      gallery.hidden = !gallery.childElementCount;
      this.bindVote(root, post);
    }
  }

  class communityFeedView extends communityView {
    constructor(api) {
      super(api);
      this.feed = find("forum-feed");
      this.sequence = 0;
      this.timer = null;
      this.readLocation();
      const changed = () => { this.page = 1; this.update(); };
      find("forum-search").addEventListener("input", () => {
        clearTimeout(this.timer);
        // Invalidate in-flight results immediately when the query changes.
        this.sequence++;
        this.timer = setTimeout(changed, 250);
      });
      for (const id of ["forum-sort", "forum-state", "forum-mine"]) find(id).addEventListener("change", changed);
      for (const button of document.querySelectorAll("[data-filter]")) {
        button.addEventListener("click", () => { this.topic = button.dataset.filter; changed(); });
      }
      find("forum-previous").onclick = () => { this.page--; this.update(); };
      find("forum-next").onclick = () => { this.page++; this.update(); };
      find("forum-refresh").onclick = () => this.update();
      window.addEventListener("popstate", () => { this.readLocation(); this.update(false); });
      this.update(false);
    }

    readLocation() {
      const params = new URLSearchParams(location.search);
      this.topic = params.get("topic") || "";
      this.page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);
      find("forum-search").value = params.get("q") || "";
      find("forum-sort").value = params.get("sort") || "newest";
      find("forum-state").value = params.get("status") || "";
      find("forum-mine").checked = params.get("mine") === "1";
    }

    async update(updateUrl = true) {
      clearTimeout(this.timer);
      const sequence = ++this.sequence;
      const params = new URLSearchParams({q: find("forum-search").value.trim(), topic: this.topic,
        sort: find("forum-sort").value, status: find("forum-state").value,
        mine: find("forum-mine").checked ? "1" : "0", page: String(this.page)});
      if (updateUrl) history.replaceState(null, "", "/forum?" + params);
      for (const button of document.querySelectorAll("[data-filter]")) {
        button.setAttribute("aria-pressed", String(button.dataset.filter === this.topic));
      }
      this.feed.setAttribute("aria-busy", "true");
      find("forum-previous").disabled = find("forum-next").disabled = true;
      this.status("Đang tải bài viết…");
      try {
        const result = await this.api.request("posts?" + params);
        if (sequence !== this.sequence) return;
        if (this.page > Math.max(1, result.totalPages)) {
          this.page = Math.max(1, result.totalPages);
          return this.update();
        }
        this.feed.replaceChildren(...result.items.map((post) => {
          const card = find("forum-card-template").content.cloneNode(true);
          this.populatePost(card, post);
          const url = "/forum/" + encodeURIComponent(post.id);
          const title = card.querySelector("[data-post-link]");
          title.textContent = post.title;
          title.href = url;
          const discussion = card.querySelector("[data-discussion-link]");
          discussion.href = url + "#forum-chat-title";
          discussion.textContent = `Trao đổi · ${post.answerCount} câu trả lời`;
          return card;
        }));
        find("forum-empty").hidden = result.items.length > 0;
        find("forum-total").textContent = result.total + " bài viết";
        find("forum-page").textContent = `Trang ${this.page} / ${Math.max(1, result.totalPages)}`;
        find("forum-previous").disabled = this.page <= 1;
        find("forum-next").disabled = this.page >= result.totalPages;
        this.status("");
      } catch (error) {
        if (sequence === this.sequence) this.status(error.message);
      } finally {
        if (sequence === this.sequence) this.feed.setAttribute("aria-busy", "false");
      }
    }
  }

  class communityComposeView extends communityView {
    constructor(api) {
      super(api);
      this.form = find("forum-compose");
      this.fields = ["topic", "cultivar", "stage", "title", "body"];
      this.editPost = data.post || null;
      this.draftVersion = data.draft?.version || 0;
      const saved = this.editPost || data.draft?.payload || {};
      this.photos = saved.photos || [];
      this.requestId = crypto.randomUUID();
      this.dirty = false;
      this.busy = false;
      for (const field of this.fields) {
        if (typeof saved[field] === "string") this.form.elements[field].value = saved[field];
      }
      if (this.editPost) {
        document.querySelector("h1").textContent = "Chỉnh sửa bài chia sẻ";
        find("publish-post").querySelector("span").textContent = "Lưu thay đổi";
        find("save-draft").hidden = find("discard-draft").hidden = true;
      } else if (data.draft?.payload) this.status("Đã khôi phục bản nháp của bạn.", "compose-status");
      this.refreshTitle();
      this.refreshPhotos();
      this.form.addEventListener("input", () => { this.dirty = true; this.refreshTitle(); });
      window.addEventListener("beforeunload", (event) => {
        if (this.dirty) { event.preventDefault(); event.returnValue = ""; }
      });
      find("post-photos").addEventListener("change", () => this.addPhotos(find("post-photos").files));
      const dropzone = find("forum-dropzone");
      dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("is-dragging"); });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
      dropzone.addEventListener("drop", (event) => {
        event.preventDefault(); dropzone.classList.remove("is-dragging"); this.addPhotos(event.dataTransfer.files);
      });
      for (const tool of this.form.querySelectorAll("[data-prefix]")) {
        tool.addEventListener("click", () => {
          const body = find("post-content");
          const start = body.selectionStart;
          const snippet = (start > 0 && body.value[start - 1] !== "\n" ? "\n" : "") + tool.dataset.prefix;
          if (body.value.length + snippet.length > body.maxLength) return;
          body.setRangeText(snippet, start, start, "end");
          this.dirty = true;
          body.focus();
        });
      }
      find("save-draft").onclick = () => this.saveDraft();
      find("discard-draft").onclick = () => this.discardDraft();
      this.form.addEventListener("submit", (event) => { event.preventDefault(); this.publish(); });
      this.setBusy(false);
    }

    values() {
      return {...Object.fromEntries(this.fields.map((field) => [field, this.form.elements[field].value.trim()])), photos: [...this.photos]};
    }

    setBusy(busy) {
      this.busy = busy;
      for (const control of this.form.elements) control.disabled = busy || !data.member;
    }

    refreshTitle() { find("titleCount").textContent = find("post-title").value.length + " / 120 ký tự"; }

    refreshPhotos() {
      const preview = find("photo-preview");
      preview.replaceChildren(...this.photos.map((src, index) => {
        const tile = this.element("div", "", "forum-photo-preview");
        const image = this.picture(src);
        if (image) tile.append(image);
        const remove = this.button("×", () => {
          if (this.busy) return;
          this.photos.splice(index, 1); this.dirty = true; this.refreshPhotos();
        });
        remove.setAttribute("aria-label", "Gỡ ảnh " + (index + 1));
        tile.append(remove);
        return tile;
      }));
      preview.hidden = this.photos.length === 0;
      find("photo-count").textContent = this.photos.length + " / 4 ảnh";
    }

    async thumbnail(file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
        throw new Error("Hãy chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB.");
      }
      let image;
      try { image = await createImageBitmap(file); }
      catch { throw new Error("Không đọc được ảnh. Hãy chọn tệp ảnh khác."); }
      try {
        const scale = Math.min(1, 800 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL("image/jpeg", .68);
        if (url.length > 240_000) throw new Error("Ảnh có quá nhiều chi tiết. Hãy chọn ảnh nhỏ hơn.");
        return url;
      } finally { image.close(); }
    }

    async addPhotos(files) {
      if (!files.length || this.busy || !data.member) return;
      if (files.length + this.photos.length > 4) { this.status("Mỗi bài có tối đa 4 ảnh.", "compose-status"); return; }
      this.setBusy(true);
      try {
        const photos = await Promise.all([...files].map((file) => this.thumbnail(file)));
        this.photos.push(...photos);
        this.dirty = true;
        this.refreshPhotos();
        this.status("", "compose-status");
      } catch (error) { this.status(error.message, "compose-status"); }
      finally { this.setBusy(false); find("post-photos").value = ""; }
    }

    async saveDraft() {
      if (this.busy) return;
      this.setBusy(true);
      try {
        const draft = await this.api.request("draft", "PUT", {...this.values(), version: this.draftVersion});
        this.draftVersion = draft.version;
        this.dirty = false;
        this.status("Đã lưu bản nháp trên máy chủ.", "compose-status");
      } catch (error) { this.status(error.message, "compose-status"); }
      finally { this.setBusy(false); }
    }

    async discardDraft() {
      if (this.busy || !confirm("Xóa bản nháp và nội dung đang soạn?")) return;
      this.setBusy(true);
      try {
        const result = await this.api.request("draft", "DELETE", {version: this.draftVersion});
        this.form.reset(); this.photos = []; this.draftVersion = result.version; this.dirty = false;
        this.refreshPhotos(); this.refreshTitle();
        this.status("Đã xóa bản nháp.", "compose-status");
      } catch (error) { this.status(error.message, "compose-status"); }
      finally { this.setBusy(false); }
    }

    async publish() {
      if (this.busy) return;
      const payload = {...this.values(), requestId: this.requestId, draftVersion: this.draftVersion};
      this.setBusy(true);
      try {
        const post = this.editPost
          ? await this.api.request("posts/" + this.editPost.id, "PATCH", {...payload, version: this.editPost.version})
          : await this.api.request("posts", "POST", payload);
        this.dirty = false;
        location.assign("/forum/" + post.id);
      } catch (error) { this.status(error.message, "compose-status"); this.setBusy(false); }
    }
  }

  class communityDetailView extends communityView {
    constructor(api) {
      super(api);
      this.root = find("forum-detail");
      this.post = data.post;
      this.replies = data.replies;
      this.parentId = null;
      this.requestId = crypto.randomUUID();
      this.render();
      find("refresh-replies").onclick = () => this.action(find("refresh-replies"), () => this.reload());
      find("reply-sort").onchange = () => this.renderReplies();
      find("cancel-reply").onclick = () => this.setParent(null);
      find("forum-reply-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const button = event.submitter;
        this.action(button, async () => {
          const input = find("forum-reply");
          const body = input.value;
          const result = await this.api.request(`posts/${this.post.id}/replies`, "POST",
            {body, parentId: this.parentId, requestId: this.requestId});
          if (input.value === body) input.value = "";
          this.setParent(null);
          this.requestId = crypto.randomUUID();
          this.status("Đã gửi câu trả lời.", "reply-status");
          await this.reload();
          find("reply-" + result.id)?.scrollIntoView({block: "nearest"});
        }, "reply-status");
      });
      find("delete-post").onclick = () => {
        if (!confirm("Xóa bài viết và toàn bộ chuỗi trao đổi?")) return;
        this.action(find("delete-post"), async () => {
          await this.api.request("posts/" + this.post.id, "DELETE", {version: this.post.version});
          location.assign("/forum");
        });
      };
      if (!data.member) {
        for (const control of find("forum-reply-form").elements) control.disabled = true;
      }
    }

    async reload() {
      const detail = await this.api.request("posts/" + this.post.id);
      this.post = detail.post; this.replies = detail.replies;
      this.render();
    }

    render() {
      this.populatePost(this.root, this.post, true);
      this.root.querySelector("[data-title]").textContent = this.post.title;
      this.root.hidden = false;
      find("post-actions").hidden = !this.post.canEdit;
      find("edit-post").href = "/forum/" + this.post.id + "/edit";
      this.renderReplies();
    }

    setParent(reply) {
      this.parentId = reply?.id || null;
      this.requestId = crypto.randomUUID();
      find("reply-context").hidden = !reply;
      find("reply-target").textContent = reply ? "Đang trả lời " + reply.author : "";
      find("forum-reply").focus();
    }

    renderReplies() {
      const feed = find("forum-replies");
      const groups = new Map();
      for (const reply of this.replies) {
        const key = reply.parentId || "root";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(reply);
      }
      const roots = groups.get("root") || [];
      const sort = find("reply-sort").value;
      roots.sort((left, right) => Number(right.isAccepted) - Number(left.isAccepted)
        || (sort === "helpful" ? right.score - left.score : 0)
        || (sort === "newest" ? right.createdAt.localeCompare(left.createdAt) : left.createdAt.localeCompare(right.createdAt)));
      feed.replaceChildren(...roots.map((reply) => this.renderReply(reply, groups, 0)));
      if (!roots.length) feed.textContent = "Chưa có câu trả lời. Hãy bắt đầu trao đổi.";
    }

    renderReply(reply, groups, depth) {
      const item = this.element("article", "", reply.isAccepted ? "is-accepted" : "");
      item.id = "reply-" + reply.id;
      const header = this.element("div", "", "community-reply-header");
      header.append(this.element("strong", reply.author), this.element("time", this.date(reply.createdAt), "community-meta"));
      if (reply.isAccepted) header.append(this.element("span", "✓ Được tác giả chọn", "community-accepted"));
      if (reply.version > 1 && !reply.isDeleted) header.append(this.element("span", "Đã chỉnh sửa", "community-meta"));
      item.append(header, this.element("p", reply.isDeleted ? "Câu trả lời đã được tác giả xóa." : reply.body));
      const actions = this.element("div", "", "community-actions");
      const replyPath = `posts/${this.post.id}/replies/${reply.id}`;
      if (!reply.isDeleted) {
        const vote = this.button("Hữu ích · " + reply.score, async (button) => {
          const result = await this.api.request(replyPath + "/vote", "PUT", {active: !reply.voted});
          Object.assign(reply, result);
          button.textContent = "Hữu ích · " + reply.score;
          button.setAttribute("aria-pressed", String(Boolean(reply.voted)));
        });
        vote.disabled = !reply.canVote;
        vote.setAttribute("aria-pressed", String(Boolean(reply.voted)));
        actions.append(vote);
        if (data.member && depth < 5) actions.append(this.button("Trả lời", () => this.setParent(reply)));
        if (reply.canAccept) actions.append(this.button(reply.isAccepted ? "Bỏ chọn giải đáp" : "Chọn là giải đáp", async () => {
          await this.api.request(`posts/${this.post.id}/accepted-reply`, "PUT",
            {replyId: reply.isAccepted ? null : reply.id, version: this.post.version});
          await this.reload();
        }));
        if (reply.canEdit) {
          actions.append(this.button("Sửa", () => this.editReply(item, reply, replyPath)));
          actions.append(this.button("Xóa", async () => {
            if (!confirm("Xóa câu trả lời này? Các trao đổi bên dưới vẫn được giữ lại.")) return;
            await this.api.request(replyPath, "DELETE", {version: reply.version});
            await this.reload();
          }));
        }
      }
      item.append(actions);
      const children = groups.get(reply.id) || [];
      if (children.length) {
        const container = this.element("div", "", "community-reply-children");
        container.append(...children.map((child) => this.renderReply(child, groups, depth + 1)));
        item.append(container);
      }
      return item;
    }

    editReply(item, reply, path) {
      if (item.querySelector(":scope > .community-reply-editor")) return;
      const editor = this.element("form", "", "community-reply-editor");
      const input = this.element("textarea");
      input.value = reply.body; input.maxLength = 5000; input.required = true;
      input.setAttribute("aria-label", "Sửa câu trả lời");
      const save = this.element("button", "Lưu câu trả lời", "community-button");
      save.type = "submit";
      const cancel = this.button("Hủy sửa", () => editor.remove());
      editor.append(input, save, cancel);
      editor.addEventListener("submit", (event) => {
        event.preventDefault();
        this.action(save, async () => {
          await this.api.request(path, "PATCH", {body: input.value, version: reply.version});
          await this.reload();
        });
      });
      item.insertBefore(editor, item.querySelector(":scope > .community-reply-children"));
      input.focus();
    }
  }

  const api = new communityApi(data.csrfToken);
  if (find("forum-feed")) new communityFeedView(api);
  if (find("forum-compose")) new communityComposeView(api);
  if (find("forum-detail")) new communityDetailView(api);
})();

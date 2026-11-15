(() => {
  const prefix = "mach-dong-forum-v1:";
  const find = (id) => document.getElementById(id);
  const rawData = find("forum-data");
  const data = rawData ? JSON.parse(rawData.textContent) : {};

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  }

  function authorName() {
    return document.querySelector(".app-account-name strong")?.textContent.trim() || "Chú Năm Ruộng";
  }

  function picture(src) {
    if (!/^(?:\/static\/assets\/stitch-forum-(?:field|roots)\.jpg|data:image\/jpeg;base64,[A-Za-z0-9+/]+=*)$/.test(src)) return null;
    const image = new Image();
    image.src = src;
    image.alt = "Ảnh minh họa đồng ruộng";
    image.loading = "lazy";
    return image;
  }

  function bindVote(root, post) {
    const voteKey = "vote:" + post.id;
    const button = root.querySelector(".forum-vote");
    const score = root.querySelector("[data-score]");
    const refresh = () => {
      const voted = read(voteKey, false) === true;
      button.setAttribute("aria-pressed", String(voted));
      score.textContent = "+" + (post.score + Number(voted));
    };
    button.addEventListener("click", () => {
      try {
        write(voteKey, !read(voteKey, false));
        refresh();
      } catch {
        button.title = "Trình duyệt đang chặn lưu lượt đánh dấu.";
      }
    });
    refresh();
  }

  function populatePost(root, post, full) {
    root.querySelector("[data-author]").textContent = post.author;
    root.querySelector("[data-location]").textContent = post.location;
    root.querySelector("[data-topic]").textContent = data.topics[post.topic] || "Kinh nghiệm";
    root.querySelector("[data-cultivar]").textContent = post.cultivar + (full ? " · " + post.stage : "");
    root.querySelector("[data-body]").textContent = post.body;
    const gallery = root.querySelector("[data-photos]");
    const photos = full || post.id !== "muong-lo" ? post.photos.map(picture).filter(Boolean) : [];
    gallery.replaceChildren(...photos);
    gallery.hidden = photos.length === 0;
    bindVote(root, post);
  }

  function setupFeed(feed) {
    const search = find("forum-search");
    const filters = [...document.querySelectorAll("[data-filter]")];
    const template = find("forum-card-template");
    const posts = [...read("posts", []), ...data.posts];
    const initial = new URLSearchParams(window.location.search);
    const savedTopic = initial.get("topic");
    let active = Object.hasOwn(data.topics, savedTopic) ? savedTopic : "";
    search.value = initial.get("q") || "";

    function updateLocation() {
      const url = new URL(window.location.href);
      for (const [key, value] of [["topic", active], ["q", search.value.trim()]]) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (url.href !== window.location.href) history.replaceState(history.state, "", url);
    }

    function render() {
      const query = search.value.trim().toLocaleLowerCase("vi");
      const matched = posts.filter((post) => {
        if (active && post.topic !== active) return false;
        return [post.title, post.body, post.cultivar, post.author, post.location]
          .some((value) => value.toLocaleLowerCase("vi").includes(query));
      });
      feed.replaceChildren(...matched.map((post) => {
        const card = template.content.cloneNode(true);
        populatePost(card, post, false);
        const url = "/forum/" + encodeURIComponent(post.id);
        const title = card.querySelector("[data-post-link]");
        title.textContent = post.title;
        title.href = url;
        card.querySelector("[data-discussion-link]").href = url + "#forum-chat-title";
        return card;
      }));
      find("forum-empty").hidden = matched.length > 0;
    }

    search.addEventListener("input", () => { render(); updateLocation(); });
    for (const button of filters) {
      button.setAttribute("aria-pressed", String(button.dataset.filter === active));
      button.addEventListener("click", () => {
        active = button.dataset.filter;
        for (const filter of filters) filter.setAttribute("aria-pressed", String(filter === button));
        render();
        updateLocation();
      });
    }
    render();
  }

  async function thumbnail(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
      throw new Error("Hãy chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB.");
    }
    const image = await createImageBitmap(file);
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
      if (url.length > 240_000) throw new Error("Ảnh quá lớn để lưu trong bản demo. Hãy chọn ảnh nhỏ hơn.");
      return url;
    } finally {
      image.close();
    }
  }

  function setupCompose(form) {
    const saved = read("draft", {});
    const fields = ["topic", "cultivar", "stage", "title", "body"];
    const title = find("post-title");
    const body = find("post-content");
    const picker = find("post-photos");
    const preview = find("photo-preview");
    const status = find("compose-status");
    const save = find("save-draft");
    const publish = find("publish-post");
    const dropzone = find("forum-dropzone");
    let photos = Array.isArray(saved.photos) ? saved.photos : [];
    let loading = false;
    let dirty = false;

    function values() {
      return {...Object.fromEntries(fields.map((field) => [field, form.elements[field].value.trim()])), photos};
    }

    function refreshPhotos() {
      preview.replaceChildren();
      for (const [index, src] of photos.entries()) {
        const image = picture(src);
        if (!image) continue;
        const tile = document.createElement("div");
        tile.className = "forum-photo-preview";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Gỡ ảnh " + (index + 1));
        remove.addEventListener("click", () => {
          photos = photos.filter((_, position) => position !== index);
          dirty = true;
          refreshPhotos();
        });
        tile.append(image, remove);
        preview.append(tile);
      }
      preview.hidden = !preview.childElementCount;
      find("photo-count").textContent = photos.length + " / 4 ảnh";
    }

    async function addPhotos(files) {
      if (!files.length || loading) return;
      if (files.length + photos.length > 4) {
        status.textContent = "Mỗi bài có tối đa 4 ảnh.";
        return;
      }
      loading = save.disabled = publish.disabled = true;
      try {
        const images = await Promise.all([...files].map(thumbnail));
        photos = [...photos, ...images];
        dirty = true;
        status.textContent = "";
        refreshPhotos();
      } catch (error) {
        status.textContent = error instanceof DOMException ? "Trình duyệt không đọc được ảnh này." : error.message;
      } finally {
        loading = save.disabled = publish.disabled = false;
        picker.value = "";
      }
    }

    for (const field of fields) {
      if (typeof saved[field] === "string" && saved[field]) form.elements[field].value = saved[field];
    }
    const refreshTitle = () => { find("titleCount").textContent = title.value.length + " / 120 ký tự"; };
    refreshTitle();
    refreshPhotos();
    form.addEventListener("input", () => { dirty = true; });
    window.addEventListener("pagehide", () => {
      if (!dirty) return;
      try { write("draft", values()); } catch { /* Keep the last draft if storage is full. */ }
    });
    title.addEventListener("input", refreshTitle);
    picker.addEventListener("change", () => addPhotos(picker.files));
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
      addPhotos(event.dataTransfer.files);
    });
    for (const tool of form.querySelectorAll("[data-prefix]")) {
      tool.addEventListener("click", () => {
        const start = body.selectionStart;
        const snippet = (start > 0 && body.value[start - 1] !== "\n" ? "\n" : "") + tool.dataset.prefix;
        if (body.value.length + snippet.length > body.maxLength) return;
        body.setRangeText(snippet, start, start, "end");
        dirty = true;
        body.focus();
      });
    }
    save.addEventListener("click", () => {
      try {
        write("draft", values());
        dirty = false;
        status.textContent = "Đã lưu bản nháp trên trình duyệt này.";
      } catch {
        status.textContent = "Chưa lưu được bản nháp. Kiểm tra dung lượng trình duyệt hoặc gỡ bớt ảnh.";
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (loading) return;
      const payload = values();
      if (!payload.title || !payload.body) {
        status.textContent = "Hãy nhập tiêu đề và nội dung bài.";
        return;
      }
      const post = {
        ...payload, id: "local-" + crypto.randomUUID(), author: authorName(),
        location: "HTX Long Hữu", score: 0,
      };
      try {
        write("posts", [post, ...read("posts", [])]);
      } catch {
        status.textContent = "Chưa đăng được bài demo. Kiểm tra dung lượng trình duyệt hoặc gỡ bớt ảnh.";
        return;
      }
      localStorage.removeItem(prefix + "draft");
      dirty = false;
      window.location.assign("/forum/" + post.id);
    });
  }

  function setupDetail(root) {
    const post = data.post || read("posts", []).find((entry) => entry.id === data.postId);
    if (!post) {
      find("detail-missing").hidden = false;
      return;
    }
    populatePost(root, post, true);
    root.querySelector("[data-title]").textContent = post.title;
    root.hidden = false;

    const replyKey = "replies:" + post.id;
    const feed = find("forum-replies");
    const input = find("forum-reply");
    const status = find("reply-status");
    function renderReplies() {
      feed.replaceChildren();
      for (const reply of [...data.replies, ...read(replyKey, [])]) {
        const item = document.createElement("article");
        const name = document.createElement("strong");
        const message = document.createElement("p");
        name.textContent = reply.author;
        message.textContent = reply.body;
        item.append(name, message);
        feed.append(item);
      }
      if (!feed.childElementCount) feed.textContent = "Chưa có lời nhắn.";
      feed.scrollTop = feed.scrollHeight;
    }
    find("forum-reply-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      try {
        write(replyKey, [...read(replyKey, []), {author: authorName(), body: message}]);
        input.value = "";
        status.textContent = "Đã lưu lời nhắn demo.";
        renderReplies();
      } catch {
        status.textContent = "Chưa lưu được lời nhắn.";
      }
    });
    renderReplies();
  }

  const feed = find("forum-feed");
  const form = find("forum-compose");
  const detail = find("forum-detail");
  if (feed) setupFeed(feed);
  if (form) setupCompose(form);
  if (detail) setupDetail(detail);
})();

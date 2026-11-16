const modal = document.querySelector("#upload-csv-modal");
const picker = document.querySelector("#csv-file");
const result = document.querySelector("#csv-result");
const output = document.querySelector("#csv-preview");
const search = document.querySelector("#csv-search");
const filters = [...document.querySelectorAll("[data-filter]")];
const cards = [...document.querySelectorAll("[data-dataset]")];
const count = document.querySelector("#csv-count span");
const modalTitle = document.querySelector("#csv-modal-title");
const modalFile = document.querySelector("#csv-modal-file");
const modalDownload = document.querySelector("#csv-modal-download");
const dropzone = document.querySelector("[data-dropzone]");
let activeFilter = "all";
let previewRequest;

function normalizeSearch(value) {
  return value.toLocaleLowerCase("vi").normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").trim();
}

function filterCards() {
  const query = normalizeSearch(search.value);
  let visible = 0;
  for (const card of cards) {
    const inCategory = activeFilter === "all" || card.dataset.dataset.split(" ").includes(activeFilter);
    card.hidden = !(inCategory && normalizeSearch(card.textContent).includes(query));
    if (!card.hidden) visible++;
  }
  count.textContent = activeFilter === "all" && !query
    ? `${visible} bộ dữ liệu`
    : `${visible}/${cards.length} bộ dữ liệu`;
  document.querySelector("#csv-empty").hidden = visible > 0;
}

search.addEventListener("input", filterCards);
filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    for (const filter of filters) filter.setAttribute("aria-pressed", String(filter === button));
    filterCards();
  });
});

function openPreview(dataset) {
  previewRequest?.abort();
  result.textContent = "";
  output.hidden = true;
  output.replaceChildren();
  picker.value = "";
  dropzone.hidden = Boolean(dataset);
  modalTitle.textContent = dataset ? "Xem trước bộ dữ liệu CSV" : "Kiểm tra tệp CSV";
  modalFile.textContent = dataset?.csvFile ?? "";
  modalDownload.hidden = !dataset;
  if (dataset) modalDownload.href = dataset.csvDownload;
  else modalDownload.removeAttribute("href");
  if (!modal.open) modal.showModal();
}

document.querySelector("[data-csv-open]").addEventListener("click", () => openPreview());
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });
modal.addEventListener("close", () => {
  if (!modal.open) previewRequest?.abort();
  dropzone.classList.remove("is-dragging");
});

function tableRow(values, tag) {
  const row = document.createElement("tr");
  for (const value of values) {
    const cell = document.createElement(tag);
    cell.textContent = value;
    if (tag === "th") cell.scope = "col";
    row.append(cell);
  }
  return row;
}

async function loadPreview(url, options = {}) {
  previewRequest?.abort();
  const request = new AbortController();
  previewRequest = request;
  result.textContent = "Đang đọc tệp…";
  output.hidden = true;
  output.replaceChildren();
  try {
    const response = await fetch(url, {...options, signal: request.signal});
    if (response.status === 413) throw new Error("Tệp vượt quá giới hạn 1 MB.");
    const {data, error} = await response.json();
    if (request.signal.aborted) return;
    if (!response.ok) throw new Error(error);
    const table = document.createElement("table");
    const header = table.createTHead();
    header.append(tableRow(data.columns, "th"));
    const body = table.createTBody();
    data.rows.forEach((row) => body.append(tableRow(row, "td")));
    output.replaceChildren(table);
    output.hidden = false;
    result.textContent = `${data.row_count} dòng` + (
      data.rows.length < data.row_count ? ` · Hiển thị ${data.rows.length} dòng đầu.` : ""
    );
  } catch (error) {
    if (!request.signal.aborted) result.textContent = error.message || "Chưa xem được tệp.";
  }
}

function previewFile(file) {
  if (!file) { result.textContent = "Hãy chọn một tệp CSV."; return; }
  modalFile.textContent = file.name;
  const form = new FormData();
  form.set("file", file);
  return loadPreview("/api/community/preview", {method: "POST", body: form});
}

for (const button of document.querySelectorAll("[data-csv-preview]")) {
  button.addEventListener("click", () => {
    openPreview(button.dataset);
    loadPreview(button.dataset.csvPreview);
  });
}

picker.addEventListener("change", () => previewFile(picker.files[0]));
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", (event) => {
  if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragging");
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  previewFile(event.dataTransfer.files[0]);
});

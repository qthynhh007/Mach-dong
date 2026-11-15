const modal = document.querySelector("#upload-csv-modal");
const picker = document.querySelector("#csv-file");
const result = document.querySelector("#csv-result");
const output = document.querySelector("#csv-preview");
const search = document.querySelector("#csv-search");
const filters = [...document.querySelectorAll("[data-filter]")];
const cards = [...document.querySelectorAll("[data-dataset]")];
let activeFilter = "all";
let previewRequest;

function filterCards() {
  const query = search.value.trim().toLocaleLowerCase("vi");
  for (const card of cards) {
    const inCategory = activeFilter === "all" || card.dataset.dataset === activeFilter;
    card.hidden = !(inCategory && card.textContent.toLocaleLowerCase("vi").includes(query));
  }
  document.querySelector("#csv-empty").hidden = cards.some((card) => !card.hidden);
}

search.addEventListener("input", filterCards);
filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach((filter) => {
      const selected = filter === button;
      filter.setAttribute("aria-pressed", String(selected));
      filter.classList.toggle("bg-primary", selected);
      filter.classList.toggle("text-on-primary", selected);
      filter.classList.toggle("bg-surface-container-low", !selected);
      filter.classList.toggle("text-on-surface-variant", !selected);
    });
    filterCards();
  });
});

function openPreview() { if (!modal.open) modal.showModal(); }
document.querySelectorAll("[data-csv-open]").forEach((node) => node.addEventListener("click", openPreview));
document.querySelectorAll("[data-csv-close]").forEach((node) => node.addEventListener("click", () => modal.close()));
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });
modal.addEventListener("close", () => {
  previewRequest?.abort();
  picker.value = "";
  result.textContent = "";
  output.replaceChildren();
});

function tableRow(values, tag) {
  const row = document.createElement("tr");
  for (const value of values) {
    const cell = document.createElement(tag);
    cell.textContent = value;
    row.append(cell);
  }
  return row;
}

async function previewFile(file) {
  if (!file) { result.textContent = "Hãy chọn một tệp CSV."; return; }
  previewRequest?.abort();
  const request = new AbortController();
  previewRequest = request;
  result.textContent = "Đang đọc tệp…";
  output.replaceChildren();
  const form = new FormData();
  form.set("file", file);
  try {
    const response = await fetch("/api/community/preview", {
      method: "POST", body: form, signal: request.signal,
    });
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
    result.textContent = data.row_count + " dòng · Xem trước tối đa 5 dòng đầu.";
  } catch (error) {
    if (!request.signal.aborted) result.textContent = error.message || "Chưa xem được tệp.";
  }
}

picker.addEventListener("change", () => previewFile(picker.files[0]));
for (const zone of document.querySelectorAll("[data-dropzone]")) {
  zone.addEventListener("dragover", (event) => event.preventDefault());
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    openPreview();
    previewFile(event.dataTransfer.files[0]);
  });
}

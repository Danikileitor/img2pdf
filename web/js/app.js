(() => {
  "use strict";

  const { jsPDF } = window.jspdf;
  const $ = (id) => document.getElementById(id);

  const els = {
    drop: $("drop"), inFolder: $("inFolder"), inFiles: $("inFiles"),
    btnFolder: $("btnFolder"), btnFiles: $("btnFiles"),
    workspace: $("workspace"), list: $("list"), count: $("count"),
    sortName: $("sortName"), sortDate: $("sortDate"), reverse: $("reverse"), clear: $("clear"),
    pageSize: $("pageSize"), orientation: $("orientation"), margin: $("margin"),
    quality: $("quality"), fileName: $("fileName"),
    btnCreate: $("btnCreate"), status: $("status"),
  };

  /** @type {{id:number,file:File,url:string}[]} */
  let items = [];
  let nextId = 1;
  let dragId = null;

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const pathOf = (f) => f.webkitRelativePath || f.name;

  /* ---------- Añadir archivos ---------- */

  function addFiles(fileList) {
    const images = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      setStatus("No se encontraron imágenes en la selección.", true);
      return;
    }
    images.sort((a, b) => collator.compare(pathOf(a), pathOf(b)));
    for (const file of images) {
      items.push({ id: nextId++, file, url: URL.createObjectURL(file) });
    }
    setStatus("");
    render();
  }

  els.btnFolder.onclick = () => els.inFolder.click();
  els.btnFiles.onclick = () => els.inFiles.click();
  els.inFolder.onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
  els.inFiles.onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };

  /* Arrastrar carpeta/archivos desde el sistema */
  ["dragenter", "dragover"].forEach((t) =>
    els.drop.addEventListener(t, (e) => {
      if (dragId !== null) return;
      e.preventDefault();
      els.drop.classList.add("over");
    })
  );
  ["dragleave", "drop"].forEach((t) =>
    els.drop.addEventListener(t, () => els.drop.classList.remove("over"))
  );
  els.drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const dtItems = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry());
    if (dtItems.some(Boolean)) {
      const files = [];
      for (const entry of dtItems) if (entry) await walk(entry, files);
      addFiles(files);
    } else {
      addFiles(e.dataTransfer.files);
    }
  });

  async function walk(entry, out) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, out);
      } while (batch.length);
    }
  }

  /* ---------- Render de la lista ---------- */

  function render() {
    els.workspace.hidden = items.length === 0;
    els.count.textContent = items.length === 1 ? "1 imagen" : `${items.length} imágenes`;
    els.list.textContent = "";

    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.className = "item";
      li.draggable = true;
      li.tabIndex = 0;
      li.dataset.id = it.id;
      li.setAttribute("aria-label", `${pathOf(it.file)}, posición ${i + 1}. Alt+flecha arriba o abajo para mover.`);

      const img = document.createElement("img");
      img.src = it.url;
      img.alt = "";
      img.loading = "lazy";

      const info = document.createElement("div");
      info.className = "info";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = pathOf(it.file);
      name.title = pathOf(it.file);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = formatSize(it.file.size);
      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(
        btn("↑", "Subir", () => move(i, i - 1), i === 0),
        btn("↓", "Bajar", () => move(i, i + 1), i === items.length - 1),
        btn("✕", "Quitar de la lista", () => remove(it.id), false, "remove")
      );

      li.append(img, info, actions);
      els.list.append(li);
    });
  }

  function btn(label, title, onClick, disabled, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.disabled = !!disabled;
    if (cls) b.className = cls;
    b.onclick = onClick;
    return b;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /* ---------- Reordenar ---------- */

  function move(from, to, focusAfter = false) {
    if (to < 0 || to >= items.length || from === to) return;
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    render();
    if (focusAfter) els.list.children[to]?.focus();
  }

  function remove(id) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    URL.revokeObjectURL(items[idx].url);
    items.splice(idx, 1);
    render();
  }

  /* Drag & drop interno */
  els.list.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".item");
    if (!li) return;
    dragId = Number(li.dataset.id);
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragId));
  });

  els.list.addEventListener("dragover", (e) => {
    if (dragId === null) return;
    e.preventDefault();
    clearMarks();
    const li = e.target.closest(".item");
    if (!li || Number(li.dataset.id) === dragId) return;
    const r = li.getBoundingClientRect();
    li.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
  });

  els.list.addEventListener("drop", (e) => {
    if (dragId === null) return;
    e.preventDefault();
    const li = e.target.closest(".item");
    if (li && Number(li.dataset.id) !== dragId) {
      const r = li.getBoundingClientRect();
      const after = e.clientY >= r.top + r.height / 2;
      const from = items.findIndex((i) => i.id === dragId);
      const [it] = items.splice(from, 1);
      let to = items.findIndex((i) => i.id === Number(li.dataset.id));
      if (after) to++;
      items.splice(to, 0, it);
    }
    dragId = null;
    render();
  });

  els.list.addEventListener("dragend", () => {
    dragId = null;
    clearMarks();
    els.list.querySelectorAll(".dragging").forEach((n) => n.classList.remove("dragging"));
  });

  function clearMarks() {
    els.list.querySelectorAll(".drop-before,.drop-after").forEach((n) =>
      n.classList.remove("drop-before", "drop-after")
    );
  }

  /* Teclado: Alt + ↑/↓ */
  els.list.addEventListener("keydown", (e) => {
    const li = e.target.closest(".item");
    if (!li || !e.altKey) return;
    const i = [...els.list.children].indexOf(li);
    if (e.key === "ArrowUp") { e.preventDefault(); move(i, i - 1, true); }
    if (e.key === "ArrowDown") { e.preventDefault(); move(i, i + 1, true); }
  });

  /* Ordenaciones rápidas */
  els.sortName.onclick = () => { items.sort((a, b) => collator.compare(pathOf(a.file), pathOf(b.file))); render(); };
  els.sortDate.onclick = () => { items.sort((a, b) => a.file.lastModified - b.file.lastModified); render(); };
  els.reverse.onclick = () => { items.reverse(); render(); };
  els.clear.onclick = () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    items = [];
    setStatus("");
    render();
  };

  /* ---------- Crear PDF ---------- */

  function setStatus(msg, isError = false) {
    els.status.textContent = msg;
    els.status.classList.toggle("error", isError);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  }

  /* Pasa cada imagen por un canvas: soporta PNG/WebP/GIF/etc. y rellena transparencias de blanco */
  function toJpeg(img, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
  }

  const PAGES = { a4: [210, 297], letter: [215.9, 279.4] };

  async function createPdf() {
    if (!items.length) return;
    els.btnCreate.disabled = true;

    const mode = els.pageSize.value;
    const orient = els.orientation.value;
    const margin = Math.max(0, Number(els.margin.value) || 0);
    const quality = Number(els.quality.value);
    const PX_TO_MM = 25.4 / 96;

    let doc = null;
    try {
      for (let i = 0; i < items.length; i++) {
        setStatus(`Procesando ${i + 1} de ${items.length}…`);
        const img = await loadImage(items[i].url);
        const w = img.naturalWidth, h = img.naturalHeight;
        const data = toJpeg(img, quality);

        let pw, ph, o;
        if (mode === "fit") {
          pw = w * PX_TO_MM + margin * 2;
          ph = h * PX_TO_MM + margin * 2;
          o = pw > ph ? "l" : "p";
        } else {
          o = orient === "auto" ? (w > h ? "l" : "p") : orient;
          const [a, b] = PAGES[mode];
          [pw, ph] = o === "l" ? [b, a] : [a, b];
        }

        if (!doc) doc = new jsPDF({ orientation: o, unit: "mm", format: [pw, ph], compress: true });
        else doc.addPage([pw, ph], o);

        const boxW = pw - margin * 2, boxH = ph - margin * 2;
        const scale = Math.min(boxW / w, boxH / h);
        const dw = w * scale, dh = h * scale;
        doc.addImage(data, "JPEG", (pw - dw) / 2, (ph - dh) / 2, dw, dh, undefined, "FAST");

        await new Promise((r) => setTimeout(r)); // deja respirar a la interfaz
      }

      const name = (els.fileName.value.trim() || "imagenes").replace(/[\\/:*?"<>|]/g, "_");
      doc.save(name + ".pdf");
      setStatus(`PDF creado con ${items.length} página${items.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      setStatus("Error al crear el PDF: " + err.message, true);
    } finally {
      els.btnCreate.disabled = false;
    }
  }

  els.btnCreate.onclick = createPdf;
})();

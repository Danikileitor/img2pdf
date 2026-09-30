(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    drop: $("drop"), inFolder: $("inFolder"), inFiles: $("inFiles"),
    btnFolder: $("btnFolder"), btnFiles: $("btnFiles"),
    workspace: $("workspace"), list: $("list"), count: $("count"),
    sortName: $("sortName"), sortDate: $("sortDate"), reverse: $("reverse"), clear: $("clear"),
    pageSize: $("pageSize"), orientation: $("orientation"), margin: $("margin"),
    quality: $("quality"), maxPx: $("maxPx"), fileName: $("fileName"),
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

  /* Reescala (opcional), rellena transparencias de blanco y devuelve un JPEG como Blob */
  async function toJpegBlob(img, quality, maxPx) {
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const k = maxPx > 0 ? Math.min(1, maxPx / Math.max(w0, h0)) : 1;
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    canvas.width = canvas.height = 0; // libera memoria
    if (!blob) throw new Error("La imagen es demasiado grande para procesarla");
    return { blob, w, h };
  }

  /* Escritor mínimo de PDF: las imágenes JPEG se incrustan tal cual y el archivo
     se monta con un Blob (sin límite de longitud de cadena). */
  function buildPdf(pages) {
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let offset = 0;
    const put = (x) => {
      if (typeof x === "string") x = enc.encode(x);
      parts.push(x);
      offset += x.size !== undefined ? x.size : x.length;
    };
    const num = (n) => n.toFixed(2);

    put(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const kids = [];
    pages.forEach((p, i) => {
      const imgN = 3 + i * 3, conN = imgN + 1, pageN = imgN + 2;
      kids.push(`${pageN} 0 R`);

      offsets[imgN] = offset;
      put(`${imgN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.blob.size} >>\nstream\n`);
      put(p.blob);
      put("\nendstream\nendobj\n");

      const content = `q ${num(p.dw)} 0 0 ${num(p.dh)} ${num(p.x)} ${num(p.y)} cm /Im0 Do Q`;
      offsets[conN] = offset;
      put(`${conN} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

      offsets[pageN] = offset;
      put(`${pageN} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.pw)} ${num(p.ph)}] ` +
          `/Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${conN} 0 R >>\nendobj\n`);
    });

    offsets[1] = offset;
    put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offsets[2] = offset;
    put(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>\nendobj\n`);

    const total = 3 + pages.length * 3;
    const xref = offset;
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) table += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
    put(table);
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

    return new Blob(parts, { type: "application/pdf" });
  }

  const PAGES_MM = { a4: [210, 297], letter: [215.9, 279.4] };
  const MM_TO_PT = 72 / 25.4;
  const PX_TO_PT = 0.75; // 96 dpi -> 72 pt

  async function createPdf() {
    if (!items.length) return;
    els.btnCreate.disabled = true;

    const mode = els.pageSize.value;
    const orient = els.orientation.value;
    const margin = Math.max(0, Number(els.margin.value) || 0) * MM_TO_PT;
    const quality = Number(els.quality.value);
    const maxPx = Number(els.maxPx.value);

    try {
      const pages = [];
      for (let i = 0; i < items.length; i++) {
        setStatus(`Procesando ${i + 1} de ${items.length}…`);
        const img = await loadImage(items[i].url);
        const origW = img.naturalWidth, origH = img.naturalHeight;
        const { blob, w, h } = await toJpegBlob(img, quality, maxPx);

        let pw, ph;
        if (mode === "fit") {
          pw = origW * PX_TO_PT + margin * 2;
          ph = origH * PX_TO_PT + margin * 2;
        } else {
          const o = orient === "auto" ? (origW > origH ? "l" : "p") : orient;
          const [a, b] = PAGES_MM[mode].map((v) => v * MM_TO_PT);
          [pw, ph] = o === "l" ? [b, a] : [a, b];
        }

        const scale = Math.min((pw - margin * 2) / origW, (ph - margin * 2) / origH);
        const dw = origW * scale, dh = origH * scale;
        pages.push({ blob, pxW: w, pxH: h, pw, ph, dw, dh, x: (pw - dw) / 2, y: (ph - dh) / 2 });

        await new Promise((r) => setTimeout(r)); // deja respirar a la interfaz
      }

      setStatus("Generando PDF…");
      const pdf = buildPdf(pages);
      const name = (els.fileName.value.trim() || "imagenes").replace(/[\\/:*?"<>|]/g, "_");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pdf);
      a.download = name + ".pdf";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setStatus(`PDF creado con ${items.length} página${items.length === 1 ? "" : "s"} (${formatSize(pdf.size)}).`);
    } catch (err) {
      console.error(err);
      setStatus("Error al crear el PDF: " + err.message, true);
    } finally {
      els.btnCreate.disabled = false;
    }
  }

  els.btnCreate.onclick = createPdf;
})();

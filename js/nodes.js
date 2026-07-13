/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   nodes.js  (الإصدار 2)
   ---------------------------------------------------------------------
   طبقة عرض العُقد وتفاعلها:
   - بناء مكتبة الشريط الجانبي مصنّفة حسب الفئات.
   - سحب/إفلات من المكتبة (Mouse + Touch) والنقر المزدوج للإضافة السريعة.
   - عُقد متعددة الحقول (fields[]) مع أنواع حقول مختلفة.
   - منافذ ملوّنة حسب نوع البيانات (data-dt) + دعم اللمس للربط.
   - تحريك العُقد (Pointer Events تدعم اللمس والماوس معاً).
   ===================================================================== */

const Nodes = (() => {
    let layerEl;
    let selectedId = null;

    /* --------- بناء المكتبة المصنّفة --------- */
    function buildPalette() {
        const palette = document.getElementById("palette");
        palette.innerHTML = "";

        NODE_CATEGORIES.forEach(cat => {
            const title = document.createElement("div");
            title.className = "palette-group__title";
            title.style.setProperty("--group-color", CATEGORY_COLORS[cat.id]);
            title.innerHTML = `<i class="${cat.icon}"></i><span>${cat.label}</span>`;
            palette.appendChild(title);

            cat.types.forEach(type => {
                const def = NODE_LIBRARY[type];
                const item = document.createElement("div");
                item.className = "palette-item";
                item.style.setProperty("--type-color", def.color);
                item.draggable = true;
                item.dataset.type = type;
                item.innerHTML = `
                    <span class="palette-item__icon"><i class="${def.icon}"></i></span>
                    <span class="palette-item__text">
                        <strong>${def.title}</strong>
                        <span>${def.subtitle}</span>
                    </span>`;

                // سحب بالماوس (HTML5 DnD)
                item.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("application/x-gnode-type", type);
                    e.dataTransfer.effectAllowed = "copy";
                });
                // نقر مزدوج = إضافة في منتصف اللوحة
                item.addEventListener("dblclick", () => addNodeAtCenter(type));
                // دعم اللمس: نقرة واحدة تضيف في المنتصف (لتعذّر DnD اللمسي القياسي)
                item.addEventListener("touchend", (e) => {
                    // نقرة قصيرة فقط
                    addNodeAtCenter(type);
                    e.preventDefault();
                    App.closeSidebarMobile?.();
                }, { passive: false });

                palette.appendChild(item);
            });
        });

        // قسم العُقد المخصصة (يُبنى بعد العُقد الأساسية)
        if (typeof CustomNodes !== "undefined") {
            CustomNodes.renderCustomPalette();
        }
    }

    /** rebuildPalette — يُعيد بناء القائمة بالكامل (يُستدعى من customNodes.js) */
    function rebuildPalette() { buildPalette(); }

    /** addNodeAtCenter — يضيف عقدة في منتصف مساحة العرض */
    function addNodeAtCenter(type) {
        const wrap = document.getElementById("canvas-wrap");
        const rect = wrap.getBoundingClientRect();
        const world = CanvasEngine.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        Graph.addNode(type, world.x - 100, world.y - 40);
    }

    /* --------- منطقة الإفلات --------- */
    function bindDropZone() {
        const wrap = document.getElementById("canvas-wrap");
        wrap.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
        wrap.addEventListener("drop", (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("application/x-gnode-type");
            if (!type || !NODE_LIBRARY[type]) return;
            const world = CanvasEngine.screenToWorld(e.clientX, e.clientY);
            Graph.addNode(type, world.x - 100, world.y - 30);
        });
    }

    /* --------- عقدة مفقودة (نوعها غير معرَّف) --------- */
    function _escHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function createMissingNodeElement(node) {
        const el = document.createElement("article");
        el.className = "node node--missing";
        el.id = node.id;
        el.style.left = node.x + "px";
        el.style.top  = node.y + "px";
        el.innerHTML = `
            <header class="node__header">
                <i class="node__icon fa-solid fa-triangle-exclamation"></i>
                <span class="node__title">عقدة مفقودة</span>
                <span class="node__subtitle">${_escHtml(node.type)}</span>
                <button class="node__delete" title="حذف"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div class="node__body node__body--missing">
                <p>النوع <code>${_escHtml(node.type)}</code> غير معرَّف —<br>ربما حُذفت العقدة المخصصة</p>
            </div>`;
        const header = el.querySelector(".node__header");
        bindNodeDrag(el, node, header);
        header.querySelector(".node__delete").addEventListener("click", (e) => {
            e.stopPropagation(); Graph.removeNode(node.id);
        });
        el.addEventListener("pointerdown", () => selectNode(node.id));
        return el;
    }

    /* --------- بناء عنصر عقدة --------- */
    function createNodeElement(node) {
        const def = NODE_LIBRARY[node.type];
        if (!def) return createMissingNodeElement(node);
        const el = document.createElement("article");
        el.className = "node";
        el.id = node.id;
        el.style.setProperty("--type-color", def.color);
        el.style.left = node.x + "px";
        el.style.top = node.y + "px";

        /* الرأس */
        const header = document.createElement("header");
        header.className = "node__header";
        header.innerHTML = `
            <i class="node__icon ${def.icon}"></i>
            <span class="node__title">${def.title}</span>
            <span class="node__subtitle">${def.subtitle}</span>
            <button class="node__delete" title="حذف"><i class="fa-solid fa-xmark"></i></button>`;
        el.appendChild(header);

        /* الجسم */
        const body = document.createElement("div");
        body.className = "node__body";

        // الحقول
        (def.fields || []).forEach(f => body.appendChild(buildField(node, f)));

        // المنافذ
        const ports = document.createElement("div");
        ports.className = "node__ports";
        const maxRows = Math.max(def.inputs.length, def.outputs.length);
        for (let i = 0; i < maxRows; i++) {
            if (def.inputs[i])  ports.appendChild(buildPortRow(node, "in", def.inputs[i]));
            if (def.outputs[i]) ports.appendChild(buildPortRow(node, "out", def.outputs[i]));
        }
        body.appendChild(ports);
        el.appendChild(body);

        /* أحداث */
        bindNodeDrag(el, node, header);
        header.querySelector(".node__delete").addEventListener("click", (e) => {
            e.stopPropagation(); Graph.removeNode(node.id);
        });
        el.addEventListener("pointerdown", () => selectNode(node.id));

        return el;
    }

    /* بناء حقل حسب نوعه */
    function buildField(node, f) {
        const wrap = document.createElement("div");
        wrap.className = "node__field";
        const label = document.createElement("label");
        label.textContent = f.label;
        wrap.appendChild(label);

        let input;
        if (f.kind === "select") {
            input = document.createElement("select");
            (f.options || []).forEach(opt => {
                const o = document.createElement("option");
                o.value = opt; o.textContent = opt;
                input.appendChild(o);
            });
            input.value = node.data[f.key] ?? f.default;
            input.addEventListener("change", () => Graph.setNodeData(node.id, f.key, input.value));
        } else {
            input = document.createElement("input");
            input.type = f.kind === "number" ? "text" : "text"; // نبقيه text لدعم التعابير
            input.placeholder = f.placeholder || "";
            input.value = node.data[f.key] ?? "";
            input.addEventListener("input", () => Graph.setNodeData(node.id, f.key, input.value, true));
            // عند مغادرة الحقل نُطلق تحديثاً كاملاً (لتوليد الكود)
            input.addEventListener("change", () => Graph.setNodeData(node.id, f.key, input.value));
        }
        // منع بدء التحريك عند التفاعل مع الحقل
        input.addEventListener("pointerdown", (e) => e.stopPropagation());
        wrap.appendChild(input);
        return wrap;
    }

    /* صف منفذ */
    function buildPortRow(node, dir, port) {
        const row = document.createElement("div");
        row.className = `port-row port-row--${dir}`;

        const dot = document.createElement("span");
        dot.className = `port port--${dir}`;
        dot.dataset.node = node.id;
        dot.dataset.port = port.id;
        dot.dataset.dir = dir;
        dot.dataset.dt = port.dataType;
        dot.title = dir === "out" ? "اسحب لإنشاء سلك" : "أفلت السلك هنا";

        if (port.label) {
            const label = document.createElement("span");
            label.className = "port-row__label";
            label.textContent = port.label;
            row.appendChild(label);
        }
        row.appendChild(dot);

        // بدء الربط من منفذ مخرج
        dot.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            if (dir === "out") Wires.beginLinkFromPort(node.id, port.id, dot, e);
        });

        return row;
    }

    /* --------- تحريك العقدة --------- */
    function bindNodeDrag(el, node, handle) {
        let dragging = false;
        let start = { x: 0, y: 0, nx: 0, ny: 0 };

        handle.addEventListener("pointerdown", (e) => {
            if (e.target.closest(".node__delete")) return;
            if (e.button && e.button !== 0) return;
            e.stopPropagation();
            dragging = true;
            start = { x: e.clientX, y: e.clientY, nx: node.x, ny: node.y };
            el.classList.add("is-dragging");
            selectNode(node.id);
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const scale = CanvasEngine.view.scale;
            const nx = start.nx + (e.clientX - start.x) / scale;
            const ny = start.ny + (e.clientY - start.y) / scale;
            el.style.left = nx + "px";
            el.style.top = ny + "px";
            Graph.moveNode(node.id, nx, ny, true);
            Wires.refresh();
        });

        const end = (e) => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove("is-dragging");
            try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
            Graph.moveNode(node.id, node.x, node.y, false); // إطلاق تحديث كامل
        };
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
    }

    /* --------- التحديد --------- */
    function selectNode(id) {
        selectedId = id;
        layerEl.querySelectorAll(".node").forEach(n => n.classList.toggle("is-selected", n.id === id));
    }
    function clearSelection() {
        selectedId = null;
        layerEl.querySelectorAll(".node.is-selected").forEach(n => n.classList.remove("is-selected"));
    }

    /* --------- الرسم الكامل --------- */
    function render() {
        const modelIds = new Set(Graph.state.nodes.map(n => n.id));
        [...layerEl.querySelectorAll(".node")].forEach(el => { if (!modelIds.has(el.id)) el.remove(); });

        Graph.state.nodes.forEach(node => {
            let el = document.getElementById(node.id);
            if (!el) {
                el = createNodeElement(node);
                layerEl.appendChild(el);
            } else {
                // إعادة البناء لو تغيّرت حالة التعريف (مفقود ↔ متاح)
                const defExists = !!NODE_LIBRARY[node.type];
                const isMissingEl = el.classList.contains("node--missing");
                if (defExists === isMissingEl) {
                    el.remove();
                    el = createNodeElement(node);
                    layerEl.appendChild(el);
                } else {
                    el.style.left = node.x + "px";
                    el.style.top = node.y + "px";
                    syncFieldValues(el, node);
                }
            }
        });

        document.getElementById("empty-state").classList.toggle("is-hidden", Graph.state.nodes.length > 0);
    }

    /* مزامنة قيم الحقول من النموذج إلى DOM (بلا فقدان تركيز أثناء الكتابة) */
    function syncFieldValues(el, node) {
        const def = NODE_LIBRARY[node.type];
        if (!def) return; // عقدة مفقودة — لا حقول لمزامنتها
        (def.fields || []).forEach((f, i) => {
            const field = el.querySelectorAll(".node__field")[i];
            if (!field) return;
            const input = field.querySelector("input, select");
            if (input && document.activeElement !== input && input.value !== String(node.data[f.key] ?? "")) {
                input.value = node.data[f.key] ?? "";
            }
        });
    }

    /* --------- موضع منفذ في العالم --------- */
    function getPortWorldPosition(nodeId, portId, dir) {
        const nodeEl = document.getElementById(nodeId);
        const node = Graph.getNode(nodeId);
        if (!nodeEl || !node) return null;
        const dot = nodeEl.querySelector(`.port[data-port="${portId}"][data-dir="${dir}"]`);
        if (!dot) return null;
        const portRow = dot.parentElement;
        const localX = dir === "out" ? nodeEl.offsetWidth : 0;
        // نحسب الإزاحة الرأسية للنقطة نسبةً لأعلى العقدة بجمع offsetTop
        // من الصف حتى العقدة (يتعامل مع أي تداخل static positioning).
        let localY = portRow.offsetHeight / 2;
        let cur = portRow;
        while (cur && cur !== nodeEl) { localY += cur.offsetTop; cur = cur.offsetParent; }
        return { x: node.x + localX, y: node.y + localY };
    }

    function init() {
        layerEl = document.getElementById("nodes-layer");
        buildPalette();
        bindDropZone();
        document.getElementById("canvas-wrap").addEventListener("pointerdown", (e) => {
            if (e.target.closest(".node")) return;
            clearSelection();
        });
    }

    return { init, render, getPortWorldPosition, selectNode, clearSelection, addNodeAtCenter, rebuildPalette };
})();

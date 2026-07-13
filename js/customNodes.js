/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   customNodes.js  —  محرك العُقد المخصصة (Custom Nodes Engine)
   ---------------------------------------------------------------------
   نمط IIFE مستقل (مثل storage.js).

   نموذج العقدة المخصصة المحفوظة:
   {
     name:    "my_func",          // snake_case، يُستخدم كنوع العقدة ومعرّف الدالة
     inputs:  ["a", "b"],         // أسماء معاملات الدالة
     outputs: ["result"],         // أسماء متغيرات الإرجاع
     code:    "    result = a+b"  // جسم الكود (بدون def / return)
   }

   مفتاح التخزين: custom_nodes  → مصفوفة JSON
   ===================================================================== */

const CustomNodes = (() => {

    const K_CUSTOM = "custom_nodes";
    const CUSTOM_COLOR = "var(--cat-custom)";

    /* ---------- أدوات منخفضة المستوى (نفس نمط storage.js) ---------- */

    function _read() {
        try {
            const raw = localStorage.getItem(K_CUSTOM);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }
    function _write(arr) {
        try {
            localStorage.setItem(K_CUSTOM, JSON.stringify(arr));
            return true;
        } catch (_) { return false; }
    }

    /* ---------- عمليات CRUD ---------- */

    function getAll() { return _read(); }

    function getByName(name) {
        return _read().find(n => n.name === name) || null;
    }

    function save(def) {
        const arr = _read();
        const idx = arr.findIndex(n => n.name === def.name);
        if (idx >= 0) arr[idx] = def;
        else arr.push(def);
        const ok = _write(arr);
        if (ok) mergeIntoLibrary();
        return ok;
    }

    function remove(name) {
        const arr = _read().filter(n => n.name !== name);
        const ok = _write(arr);
        if (ok) mergeIntoLibrary();
        return ok;
    }

    /* ---------- التحقق من الاسم ---------- */

    /**
     * validateName — يعيد { ok:true } أو { ok:false, error:"..." }
     * يُعيد استخدام PY_KEYWORDS من generator.js مباشرةً
     * ويتحقق من التعارض مع العُقد الأساسية والمخصصة الأخرى.
     */
    function validateName(name, editingName) {
        if (!name || !name.trim()) return { ok: false, error: "الاسم مطلوب" };
        const n = name.trim();

        // snake_case فقط
        if (!/^[a-z_][a-z0-9_]*$/.test(n)) {
            return { ok: false, error: "الاسم يجب أن يكون بالإنجليزية snake_case (حروف صغيرة، أرقام، شرطة سفلية)" };
        }

        // كلمة محجوزة من قائمة generator.js
        if (Generator.PY_KEYWORDS.has(n)) {
            return { ok: false, error: `«${n}» كلمة محجوزة في بايثون — اختر اسماً آخر` };
        }

        // تعارض مع عقدة أساسية
        if (NODE_LIBRARY[n]) {
            return { ok: false, error: `«${n}» اسم عقدة أساسية موجودة مسبقاً` };
        }

        // تعارض مع عقدة مخصصة أخرى (تجاهل العقدة التي نُعدّلها حالياً)
        const existing = _read().find(nd => nd.name === n && nd.name !== editingName);
        if (existing) {
            return { ok: false, error: `توجد عقدة مخصصة بالاسم «${n}» مسبقاً` };
        }

        return { ok: true };
    }

    /* ---------- بناء تعريف NODE_LIBRARY لعقدة مخصصة ---------- */

    function buildNodeDef(custom) {
        const inputs = [
            { id: "flow_in", label: "", dataType: "flow" },
            ...custom.inputs.map(name => ({ id: `in__${name}`, label: name, dataType: "any" }))
        ];
        const outputs = [
            { id: "flow_out", label: "", dataType: "flow" },
            ...custom.outputs.map(name => ({ id: `out__${name}`, label: name, dataType: "any" }))
        ];
        return {
            type:     custom.name,
            title:    custom.name,
            subtitle: "عقدة مخصصة",
            icon:     "fa-solid fa-puzzle-piece",
            category: "custom",
            color:    CUSTOM_COLOR,
            inputs,
            outputs,
            fields:   [],
            codeHint: `def ${custom.name}(${custom.inputs.join(", ")})`,
            _isCustom: true,
            _code:    custom.code || "    pass"
        };
    }

    /* ---------- دمج العُقد المخصصة في NODE_LIBRARY (runtime) ---------- */

    function mergeIntoLibrary() {
        // أولاً: احذف أي عقدة مخصصة سبق دمجها (نُعيد البناء من الصفر)
        Object.keys(NODE_LIBRARY).forEach(key => {
            if (NODE_LIBRARY[key]._isCustom) delete NODE_LIBRARY[key];
        });

        // ثانياً: أدخِل العُقد المحفوظة
        _read().forEach(custom => {
            NODE_LIBRARY[custom.name] = buildNodeDef(custom);
        });
    }

    /* ---------- عرض قسم "عُقدي المخصصة" في الشريط الجانبي ---------- */

    function renderCustomPalette() {
        const palette = document.getElementById("palette");
        if (!palette) return;

        // احذف قسم العُقد المخصصة القديم إن وُجد
        const old = document.getElementById("custom-palette-section");
        if (old) old.remove();

        const customs = _read();

        const section = document.createElement("div");
        section.id = "custom-palette-section";

        // رأس القسم + زر "إنشاء"
        const title = document.createElement("div");
        title.className = "palette-group__title palette-group__title--custom";
        title.innerHTML = `
            <i class="fa-solid fa-puzzle-piece"></i>
            <span>عُقدي المخصصة</span>
            <button class="palette-add-btn" id="btn-new-custom-node" title="إنشاء عقدة مخصصة">
                <i class="fa-solid fa-plus"></i>
            </button>`;
        section.appendChild(title);

        if (customs.length === 0) {
            const empty = document.createElement("p");
            empty.className = "custom-palette-empty";
            empty.textContent = "لا عُقد مخصصة بعد — انقر + للإنشاء";
            section.appendChild(empty);
        } else {
            customs.forEach(custom => {
                const item = document.createElement("div");
                item.className = "palette-item palette-item--custom";
                item.style.setProperty("--type-color", CUSTOM_COLOR);
                item.draggable = true;
                item.dataset.type = custom.name;
                item.innerHTML = `
                    <span class="palette-item__icon"><i class="fa-solid fa-puzzle-piece"></i></span>
                    <span class="palette-item__text">
                        <strong>${escapeHtml(custom.name)}</strong>
                        <span>${custom.inputs.length} دخل · ${custom.outputs.length} خرج</span>
                    </span>
                    <span class="palette-item__actions">
                        <button class="palette-act-btn" data-act="edit" data-name="${escapeHtml(custom.name)}" title="تعديل">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="palette-act-btn palette-act-btn--danger" data-act="delete" data-name="${escapeHtml(custom.name)}" title="حذف">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </span>`;

                item.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("application/x-gnode-type", custom.name);
                    e.dataTransfer.effectAllowed = "copy";
                });
                item.addEventListener("dblclick", () => {
                    Nodes.addNodeAtCenter(custom.name);
                });
                item.addEventListener("touchend", (e) => {
                    Nodes.addNodeAtCenter(custom.name);
                    e.preventDefault();
                    App.closeSidebarMobile?.();
                }, { passive: false });

                section.appendChild(item);
            });
        }

        palette.appendChild(section);

        // أحداث الأزرار
        section.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-act]");
            if (!btn) {
                // زر إنشاء جديد
                if (e.target.closest("#btn-new-custom-node")) openModal();
                return;
            }
            e.stopPropagation();
            const name = btn.dataset.name;
            if (btn.dataset.act === "edit") openModal(name);
            else if (btn.dataset.act === "delete") confirmDelete(name);
        });
    }

    /* ---------- حذف مع تأكيد ---------- */

    function confirmDelete(name) {
        if (!confirm(`حذف العقدة المخصصة «${name}» نهائياً؟\nأي مشروع يستخدمها سيُظهرها كـ"عقدة مفقودة".`)) return;
        remove(name);
        renderCustomPalette();
        Nodes.rebuildPalette();
        App.toast(`تم حذف العقدة المخصصة «${name}»`, "success", 2000);
    }

    /* =================================================================
       نافذة الإنشاء/التعديل
       ================================================================= */

    function openModal(editName) {
        const modal = document.getElementById("custom-node-modal");
        const form  = document.getElementById("cn-form");
        const title = document.getElementById("cn-modal-title");
        const nameErr  = document.getElementById("cn-name-error");

        // تفريغ الأخطاء
        nameErr.textContent = "";
        nameErr.hidden = true;

        if (editName) {
            const existing = getByName(editName);
            if (!existing) return;
            title.textContent = `تعديل العقدة: ${editName}`;
            form.elements["cn-name"].value   = existing.name;
            form.elements["cn-name"].dataset.editing = editName;
            form.elements["cn-inputs"].value  = existing.inputs.join(", ");
            form.elements["cn-outputs"].value = existing.outputs.join(", ");
            form.elements["cn-code"].value    = existing.code || "";
        } else {
            title.textContent = "إنشاء عقدة مخصصة";
            form.reset();
            form.elements["cn-name"].dataset.editing = "";
        }

        modal.classList.add("is-open");
    }

    function closeModal() {
        const modal = document.getElementById("custom-node-modal");
        modal.classList.remove("is-open");
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        const form    = document.getElementById("cn-form");
        const nameErr = document.getElementById("cn-name-error");

        const nameRaw   = (form.elements["cn-name"].value || "").trim();
        const editingName = form.elements["cn-name"].dataset.editing || "";
        const inputsRaw = (form.elements["cn-inputs"].value || "").trim();
        const outputsRaw= (form.elements["cn-outputs"].value || "").trim();
        const code      = form.elements["cn-code"].value || "";

        // التحقق من الاسم
        const v = validateName(nameRaw, editingName);
        if (!v.ok) {
            nameErr.textContent = v.error;
            nameErr.hidden = false;
            form.elements["cn-name"].focus();
            return;
        }
        nameErr.hidden = true;

        // تحليل المدخلات والمخرجات
        const inputs  = inputsRaw  ? inputsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
        const outputs = outputsRaw ? outputsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

        // لو تم تغيير الاسم أثناء التعديل، احذف القديم أولاً
        if (editingName && editingName !== nameRaw) {
            remove(editingName);
        }

        const def = { name: nameRaw, inputs, outputs, code };
        const ok = save(def);

        if (!ok) {
            App.toast("تعذّر حفظ العقدة (التخزين ممتلئ؟)", "error");
            return;
        }

        closeModal();
        renderCustomPalette();
        Nodes.rebuildPalette();
        App.toast(`تم حفظ العقدة المخصصة «${nameRaw}»`, "success", 2000);
    }

    /* ---------- ربط أحداث النافذة ---------- */

    function bindModal() {
        const modal = document.getElementById("custom-node-modal");
        if (!modal) return;

        document.getElementById("cn-close").addEventListener("click", closeModal);
        document.getElementById("cn-cancel").addEventListener("click", closeModal);
        document.getElementById("cn-form").addEventListener("submit", handleFormSubmit);

        // إغلاق بالنقر على الخلفية
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
        // إغلاق بـ Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
        });
    }

    /* ---------- مساعد HTML escape ---------- */
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* ---------- التهيئة ---------- */
    function init() {
        mergeIntoLibrary();   // دمج العُقد في NODE_LIBRARY قبل أي شيء
        renderCustomPalette();
        bindModal();
    }

    return {
        init, getAll, getByName, save, remove,
        validateName, mergeIntoLibrary,
        renderCustomPalette, openModal,
        escapeHtml   // مُصدَّرة لاستخدام nodes.js
    };
})();

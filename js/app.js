/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   app.js  (الإصدار 2) — التجميع والمزامنة الثنائية
   ---------------------------------------------------------------------
   - يربط كل الوحدات ويشترك في تغيّرات Graph.
   - المزامنة الأمامية: العُقد → كود بايثون (Generator).
   - المزامنة العكسية: تحرير الكود → عُقد (Parser) مع معالجة أخطاء أنيقة.
   - نظام Toast للأخطاء المنطقية (قيود الربط، أخطاء التحليل).
   - قوائم الجوال (Sidebar/Panel) + أزرار التكبير.
   ===================================================================== */

const App = (() => {
    "use strict";

    let currentView = "code";          // code | graph | stats
    let syncFromCode = true;           // هل نسمح بالمزامنة العكسية؟
    let updatingEditorFromGraph = false; // منع الحلقة اللانهائية
    let lastStableState = null;        // آخر حالة عُقد مستقرة (للتراجع عند خطأ)
    let parseTimer = null;

    /* ---------- حالة المشروع والحفظ التلقائي ---------- */
    let currentProjectId = null;       // معرّف المشروع المفتوح حالياً
    let autosaveTimer = null;          // مؤقّت debounce للحفظ
    let dirty = false;                 // هل توجد تعديلات غير محفوظة؟
    let suppressAutosave = false;      // إيقاف الحفظ مؤقتاً أثناء التحميل
    const AUTOSAVE_MS = 500;

    /* ---------- عناصر ---------- */
    const $ = (id) => document.getElementById(id);
    const editor = () => $("code-editor");
    const jsonView = () => $("json-view");
    const statsView = () => $("stats-view");
    const codeView = () => $("code-view");
    const codeStatus = () => $("code-status");

    /* ---------- Toast ---------- */
    function toast(message, level = "warn", ms = 3200) {
        const layer = $("toast-layer");
        const el = document.createElement("div");
        el.className = `toast toast--${level}`;
        const icon = level === "error" ? "fa-circle-xmark"
                   : level === "success" ? "fa-circle-check" : "fa-triangle-exclamation";
        el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
        layer.appendChild(el);
        setTimeout(() => {
            el.classList.add("is-out");
            el.addEventListener("animationend", () => el.remove(), { once: true });
        }, ms);
    }

    /* ---------- تلوين JSON ---------- */
    function syntaxHighlight(obj) {
        let json = JSON.stringify(obj, null, 2)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return json.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
            (m) => {
                let cls = "j-num";
                if (/^"/.test(m)) cls = /:$/.test(m) ? "j-key" : "j-str";
                else if (/true|false/.test(m)) cls = "j-bool";
                else if (/null/.test(m)) cls = "j-null";
                return `<span class="${cls}">${m}</span>`;
            });
    }

    /* ---------- تحديث اللوحات ---------- */
    function updatePanels() {
        const data = Graph.toJSON();

        // كود بايثون (لا نلمس المحرّر إن كان المستخدم يكتب فيه)
        const code = Generator.generate(data);
        // تنبيه غير مزعج للأسماء المحجوزة التي أُعيدت تسميتها تلقائياً
        const renames = (typeof Generator.getReservedRenames === "function")
            ? Generator.getReservedRenames() : [];
        if (!(currentView === "code" && document.activeElement === editor())) {
            updatingEditorFromGraph = true;
            editor().value = code;
            updatingEditorFromGraph = false;
            if (renames.length) setCodeStatusReserved(renames);
            else setCodeStatusOk();
        }

        // JSON
        jsonView().innerHTML = syntaxHighlight(data);

        // إحصائيات
        renderStats(data);
    }

    function renderStats(data) {
        const counts = {};
        data.nodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });

        let byCat = "";
        NODE_CATEGORIES.forEach(cat => {
            const total = cat.types.reduce((s, t) => s + (counts[t] || 0), 0);
            if (total === 0) return;
            byCat += `<div class="stat-row">
                <span class="stat-dot" style="background:${CATEGORY_COLORS[cat.id]}"></span>
                <span>${cat.label}</span>
                <strong style="margin-inline-start:auto;font-family:var(--mono)">${total}</strong>
            </div>`;
        });
        if (!byCat) byCat = `<div class="stat-row"><span>لا عُقد بعد</span></div>`;

        statsView().innerHTML = `
            <div class="stat-grid">
                <div class="stat-card"><div class="stat-card__value">${data.nodes.length}</div><div class="stat-card__label">العُقد</div></div>
                <div class="stat-card"><div class="stat-card__value">${data.links.length}</div><div class="stat-card__label">الأسلاك</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-card__label" style="margin-bottom:6px">التوزيع حسب الفئة</div>
                <div class="stat-breakdown">${byCat}</div>
            </div>`;
    }

    function setCodeStatusOk(msg = "تمّت المزامنة") {
        codeView().classList.remove("is-invalid");
        codeStatus().innerHTML = `<span class="code-status__ok"><i class="fa-solid fa-circle-check"></i> ${msg}</span>`;
    }
    function setCodeStatusErr(msg) {
        codeView().classList.add("is-invalid");
        codeStatus().innerHTML = `<span class="code-status__err"><i class="fa-solid fa-circle-xmark"></i> ${msg}</span>`;
    }
    /** setCodeStatusReserved — تنبيه غير مزعج (أصفر) لأسماء محجوزة أُعيد تسميتها */
    function setCodeStatusReserved(renames) {
        codeView().classList.remove("is-invalid");
        const list = renames
            .map(r => `<code>${escapeHtml(r.original)}</code> ← <code>${escapeHtml(r.safe)}</code>`)
            .join("،&nbsp; ");
        codeStatus().innerHTML =
            `<span class="code-status__warn"><i class="fa-solid fa-triangle-exclamation"></i> ` +
            `أسماء محجوزة أُعيدت تسميتها تلقائياً: ${list}</span>`;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* ---------- الاستجابة لتغيّر النموذج ---------- */
    function onGraphChange() {
        Nodes.render();
        Wires.render();
        updatePanels();
        // نحفظ نسخة مستقرة (للتراجع عند فشل تحليل الكود)
        lastStableState = Graph.toJSON();
        // جدولة الحفظ التلقائي (debounce)
        scheduleAutosave();
    }

    /* ---------- الحفظ التلقائي (debounce 500ms) ---------- */
    function scheduleAutosave() {
        if (suppressAutosave || !currentProjectId) return;
        dirty = true;
        markDirtyBadge();
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(commitAutosave, AUTOSAVE_MS);
    }

    function commitAutosave() {
        if (!currentProjectId) return;
        const ok = Storage.updateGraph(currentProjectId, Graph.toJSON());
        if (ok) {
            dirty = false;
            markSaved();
        } else {
            toast("تعذّر الحفظ (قد تكون ذاكرة المتصفّح ممتلئة)", "error");
        }
    }

    /** flushAutosave — حفظ فوري (قبل التبديل/الإغلاق) */
    function flushAutosave() {
        clearTimeout(autosaveTimer);
        if (currentProjectId && dirty) commitAutosave();
    }

    function markSaved() {
        const badge = $("project-dirty");
        if (badge) badge.hidden = true;
    }
    function markDirtyBadge() {
        const badge = $("project-dirty");
        if (badge) badge.hidden = false;
    }

    /* ---------- المزامنة العكسية: كود → عُقد ---------- */
    function onEditorInput() {
        if (updatingEditorFromGraph || !syncFromCode) return;
        clearTimeout(parseTimer);
        parseTimer = setTimeout(runReverseSync, 500); // debounce
    }

    function runReverseSync() {
        const code = editor().value;
        if (code.trim() === "") return;

        const result = Parser.parse(code);
        if (!result.ok) {
            // خطأ: نُظهر تحذيراً ونبقي آخر حالة مستقرة (لا ننهار)
            setCodeStatusErr(`السطر ${result.line || "?"}: ${result.error}`);
            return;
        }

        setCodeStatusOk("تم تحويل الكود إلى عُقد");
        // نستبدل حالة المخطط بالكامل (بلا إعادة توليد الكود فوق المحرّر)
        const prevSync = syncFromCode;
        // نمنع updatePanels من الكتابة فوق المحرّر أثناء التركيز (مضمون أصلاً)
        Graph.replaceState(result.nodes, result.links);
    }

    /* ---------- أزرار الشريط العلوي ---------- */
    function bindToolbar() {
        $("btn-fit").addEventListener("click", () => { CanvasEngine.fitToContent(Graph.state.nodes); Wires.refresh(); });
        $("btn-reset-zoom").addEventListener("click", () => { CanvasEngine.setZoom100(); Wires.refresh(); });
        $("btn-clear").addEventListener("click", () => {
            if (Graph.state.nodes.length === 0) return;
            if (confirm("مسح كل العُقد والأسلاك؟")) Graph.clear();
        });

        const panel = $("datapanel");
        const toggle = $("btn-toggle-panel");
        toggle.classList.add("is-active");
        toggle.addEventListener("click", () => {
            const collapsed = panel.classList.toggle("is-collapsed");
            toggle.classList.toggle("is-active", !collapsed);
            if (!collapsed && window.innerWidth <= 680) openScrim(() => panel.classList.add("is-collapsed"));
            else if (window.innerWidth <= 680) closeScrim();
            setTimeout(() => Wires.refresh(), 260);
        });

        // زر النسخ (يعتمد على العرض الحالي)
        $("btn-copy").addEventListener("click", copyCurrent);

        // زر تبديل المزامنة الثنائية
        const syncBtn = $("btn-sync-toggle");
        syncBtn.addEventListener("click", () => {
            syncFromCode = !syncFromCode;
            syncBtn.classList.toggle("is-off", !syncFromCode);
            toast(syncFromCode ? "المزامنة الثنائية مُفعّلة" : "المزامنة العكسية مُعطّلة", "success", 1800);
        });

        // أزرار التكبير العائمة
        $("btn-zoom-in").addEventListener("click", () => { CanvasEngine.zoomAtCenter(1.15); Wires.refresh(); });
        $("btn-zoom-out").addEventListener("click", () => { CanvasEngine.zoomAtCenter(1 / 1.15); Wires.refresh(); });
    }

    async function copyCurrent() {
        const btn = $("btn-copy");
        let text = "";
        if (currentView === "code") text = editor().value;
        else if (currentView === "graph") text = JSON.stringify(Graph.toJSON(), null, 2);
        else text = statsView().textContent;
        try {
            await navigator.clipboard.writeText(text);
            btn.classList.add("copied");
            const old = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => { btn.classList.remove("copied"); btn.innerHTML = old; }, 1200);
        } catch (_) { toast("تعذّر النسخ إلى الحافظة", "error"); }
    }

    /* ---------- التبويبات ---------- */
    function bindTabs() {
        const tabs = document.querySelectorAll("#panel-tabs .tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(t => t.classList.remove("tab--active"));
                tab.classList.add("tab--active");
                currentView = tab.dataset.view;
                codeView().hidden = currentView !== "code";
                jsonView().hidden = currentView !== "graph";
                statsView().hidden = currentView !== "stats";
                $("panel-note").textContent = currentView === "code"
                    ? "الكود يتولّد حياً من العُقد. يمكنك تحريره مباشرة لإعادة بناء العُقد (مزامنة ثنائية)."
                    : currentView === "graph"
                    ? "بنية البيانات الخام: مصفوفة العُقد ومصفوفة الأسلاك، تتحدّث حياً."
                    : "ملخص إحصائي للمخطط الحالي.";
            });
        });
    }

    /* ---------- قوائم الجوال ---------- */
    function openScrim(onClose) {
        const scrim = $("scrim");
        scrim.classList.add("is-visible");
        scrim._onClose = onClose;
    }
    function closeScrim() { $("scrim").classList.remove("is-visible"); }

    function bindMobileMenus() {
        const sidebar = $("sidebar");
        const scrim = $("scrim");

        $("btn-menu").addEventListener("click", () => {
            sidebar.classList.add("is-open");
            openScrim(() => sidebar.classList.remove("is-open"));
        });
        $("btn-sidebar-close").addEventListener("click", () => { sidebar.classList.remove("is-open"); closeScrim(); });

        scrim.addEventListener("click", () => {
            sidebar.classList.remove("is-open");
            $("datapanel").classList.add("is-collapsed");
            $("btn-toggle-panel").classList.remove("is-active");
            closeScrim();
        });

        // على الجوال نبدأ واللوحة الجانبية مطويّة
        if (window.innerWidth <= 680) {
            $("datapanel").classList.add("is-collapsed");
            $("btn-toggle-panel").classList.remove("is-active");
        }
    }

    function closeSidebarMobile() {
        if (window.innerWidth <= 680) { $("sidebar").classList.remove("is-open"); closeScrim(); }
    }

    /* ---------- مزامنة العرض ---------- */
    function bindViewSync() { CanvasEngine.onViewChange(() => Wires.refresh()); }

    /* ---------- محرّر الكود ---------- */
    function bindEditor() {
        editor().addEventListener("input", onEditorInput);
        // Tab يُدخل مسافات بدل تغيير التركيز
        editor().addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                const s = editor().selectionStart, en = editor().selectionEnd;
                editor().value = editor().value.slice(0, s) + "    " + editor().value.slice(en);
                editor().selectionStart = editor().selectionEnd = s + 4;
                onEditorInput();
            }
        });
    }

    /* ---------- مخطط ترحيبي ---------- */
    function seedDemo() {
        const inp = Graph.addNode("input", 60, 80);
        const num = Graph.addNode("var_number", 60, 260);
        const cond = Graph.addNode("if_else", 400, 120);
        const p1 = Graph.addNode("print", 760, 60);
        const p2 = Graph.addNode("print", 760, 260);

        Graph.setNodeData(inp.id, "var", "name", true);
        Graph.setNodeData(inp.id, "prompt", "ما اسمك؟ ", true);
        Graph.setNodeData(num.id, "name", "age", true);
        Graph.setNodeData(num.id, "value", "18", true);
        Graph.setNodeData(cond.id, "expr", "int(age) >= 18", true);
        Graph.setNodeData(p1.id, "text", "بالغ ✓", true);
        Graph.setNodeData(p2.id, "text", "قاصر ✗", true);

        // سلسلة التدفّق: input → number → if/else ؛ then→print1 ؛ else→print2
        Graph.addLink({ node: inp.id, port: "flow_out" }, { node: num.id, port: "flow_in" }, true);
        Graph.addLink({ node: num.id, port: "flow_out" }, { node: cond.id, port: "flow_in" }, true);
        Graph.addLink({ node: cond.id, port: "then" }, { node: p1.id, port: "flow_in" }, true);
        Graph.addLink({ node: cond.id, port: "else" }, { node: p2.id, port: "flow_in" }, true);
    }

    /* =================================================================
       إدارة المشاريع + معرض المشاريع (Project Gallery)
       ================================================================= */

    /** loadProjectIntoCanvas — يحمّل بنية مشروع إلى اللوحة بلا إطلاق حفظ تلقائي */
    function loadProjectIntoCanvas(project) {
        suppressAutosave = true;
        const g = (project && project.graph) || { nodes: [], links: [] };
        Graph.replaceState(g.nodes || [], g.links || []);
        currentProjectId = project ? project.id : null;
        Storage.setLastOpened(currentProjectId);
        dirty = false;
        suppressAutosave = false;
        updateProjectHeader();
        markSaved();
        requestAnimationFrame(() => {
            CanvasEngine.fitToContent(Graph.state.nodes);
            Wires.refresh();
        });
    }

    /** updateProjectHeader — يحدّث اسم المشروع المعروض في الشريط */
    function updateProjectHeader() {
        const nameEl = $("project-name");
        if (!nameEl) return;
        const p = currentProjectId ? Storage.get(currentProjectId) : null;
        nameEl.textContent = p ? p.name : "—";
    }

    /** newProject — إنشاء مشروع جديد (يسأل عن الحفظ إن وُجد تعديل غير محفوظ) */
    function newProject() {
        if (dirty && currentProjectId) {
            const ok = confirm("توجد تعديلات غير محفوظة في المشروع الحالي.\nهل تريد المتابعة؟ (سيُحفظ المشروع الحالي أولاً)");
            if (!ok) return;
        }
        flushAutosave();
        const proj = Storage.create("مشروع جديد", { nodes: [], links: [] });
        loadProjectIntoCanvas(proj);
        toast("تم إنشاء مشروع جديد", "success", 1800);
        renderGallery();
    }

    /** switchProject — يحفظ الحالي ثم يحمّل المشروع المختار */
    function switchProject(id) {
        if (id === currentProjectId) { closeGallery(); return; }
        flushAutosave();                 // حفظ المشروع الحالي أولاً
        const proj = Storage.get(id);
        if (!proj) { toast("المشروع غير موجود", "error"); renderGallery(); return; }
        loadProjectIntoCanvas(proj);
        toast(`فُتح المشروع: ${proj.name}`, "success", 1800);
        renderGallery();
        closeGallery();
    }

    function renameProject(id) {
        const proj = Storage.get(id);
        if (!proj) return;
        const name = prompt("اسم المشروع الجديد:", proj.name);
        if (name === null) return;
        Storage.rename(id, name);
        if (id === currentProjectId) updateProjectHeader();
        renderGallery();
        toast("تمّت إعادة التسمية", "success", 1600);
    }

    function deleteProject(id) {
        const proj = Storage.get(id);
        if (!proj) return;
        if (!confirm(`حذف المشروع «${proj.name}» نهائياً؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
        Storage.remove(id);
        toast("تم حذف المشروع", "success", 1600);
        if (id === currentProjectId) {
            // افتح أحدث مشروع متبقٍ أو أنشئ واحداً جديداً
            const rest = Storage.list();
            if (rest.length) loadProjectIntoCanvas(Storage.get(rest[0].id));
            else loadProjectIntoCanvas(Storage.create("مشروع جديد", { nodes: [], links: [] }));
        }
        renderGallery();
    }

    function exportProject(id) {
        const out = Storage.exportProject(id);
        if (!out) { toast("تعذّر التصدير", "error"); return; }
        const blob = new Blob([out.content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = out.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast(`تم تصدير الملف: ${out.filename}`, "success", 2200);
    }

    /** handleImportFile — يقرأ ملف .gnode ويتحقق من صحته قبل الحفظ */
    function handleImportFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const res = Storage.importAsNewProject(String(reader.result || ""));
            if (!res.ok) {
                // رسالة خطأ واضحة في منطقة حالة الكود (لا نافذة منبثقة)
                setCodeStatusErr(`ملف .gnode غير صالح: ${res.error}`);
                toast(`فشل الاستيراد: ${res.error}`, "error", 3600);
                return;
            }
            renderGallery();
            toast(`تم استيراد المشروع: ${res.project.name}`, "success", 2400);
            // نفتح المشروع المستورد مباشرةً
            switchProject(res.project.id);
        };
        reader.onerror = () => setCodeStatusErr("تعذّرت قراءة الملف");
        reader.readAsText(file);
    }

    /* ---------- واجهة المعرض ---------- */
    function openGallery() {
        renderGallery();
        $("gallery").classList.add("is-open");
        openScrim(closeGallery);
    }
    function closeGallery() {
        $("gallery").classList.remove("is-open");
        if (window.innerWidth <= 900) closeScrim();
    }

    function fmtDate(ts) {
        try {
            const d = new Date(ts);
            return d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) +
                " · " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        } catch (_) { return "—"; }
    }

    function renderGallery() {
        const listEl = $("gallery-list");
        if (!listEl) return;
        const items = Storage.list();
        if (!items.length) {
            listEl.innerHTML = `<div class="gallery-empty"><i class="fa-regular fa-folder-open"></i><p>لا مشاريع محفوظة بعد</p></div>`;
            return;
        }
        listEl.innerHTML = items.map(p => {
            const active = p.id === currentProjectId;
            return `<article class="gallery-card${active ? " is-active" : ""}" data-id="${p.id}">
                <div class="gallery-card__main" data-act="open" data-id="${p.id}" role="button" tabindex="0" title="فتح المشروع">
                    <div class="gallery-card__name">${escapeHtml(p.name)}${active ? ' <span class="gallery-card__badge">مفتوح</span>' : ""}</div>
                    <div class="gallery-card__meta">
                        <span><i class="fa-regular fa-clock"></i> ${fmtDate(p.updatedAt)}</span>
                        <span><i class="fa-solid fa-circle-nodes"></i> ${p.nodeCount} عقدة</span>
                    </div>
                </div>
                <div class="gallery-card__actions">
                    <button class="gicon" data-act="rename" data-id="${p.id}" title="إعادة تسمية"><i class="fa-solid fa-pen"></i></button>
                    <button class="gicon" data-act="export" data-id="${p.id}" title="تصدير .gnode"><i class="fa-solid fa-file-export"></i></button>
                    <button class="gicon gicon--danger" data-act="delete" data-id="${p.id}" title="حذف نهائي"><i class="fa-solid fa-trash"></i></button>
                </div>
            </article>`;
        }).join("");
    }

    function bindGallery() {
        const btnOpen = $("btn-gallery");
        if (btnOpen) btnOpen.addEventListener("click", openGallery);

        const btnClose = $("btn-gallery-close");
        if (btnClose) btnClose.addEventListener("click", closeGallery);

        const btnNew = $("btn-gallery-new");
        if (btnNew) btnNew.addEventListener("click", newProject);

        const btnImport = $("btn-gallery-import");
        const fileInput = $("import-file");
        if (btnImport && fileInput) {
            btnImport.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", (e) => {
                const f = e.target.files && e.target.files[0];
                handleImportFile(f);
                fileInput.value = ""; // نسمح باستيراد نفس الملف لاحقاً
            });
        }

        // تفويض الأحداث لبطاقات المشاريع
        const listEl = $("gallery-list");
        if (listEl) {
            listEl.addEventListener("click", (e) => {
                const btn = e.target.closest("[data-act]");
                if (!btn) return;
                const id = btn.dataset.id;
                const act = btn.dataset.act;
                if (act === "open") switchProject(id);
                else if (act === "rename") renameProject(id);
                else if (act === "export") exportProject(id);
                else if (act === "delete") deleteProject(id);
            });
        }
    }

    /* ---------- التهيئة ---------- */
    function init() {
        // CustomNodes يجب أن يُهيَّأ أولاً ليدمج العُقد في NODE_LIBRARY قبل بناء المكتبة
        if (typeof CustomNodes !== "undefined") CustomNodes.init();
        CanvasEngine.init();
        Nodes.init();
        Wires.init();

        Graph.onChange(onGraphChange);
        Graph.onError((msg, level) => toast(msg, level === "error" ? "error" : "warn"));

        bindToolbar();
        bindTabs();
        bindViewSync();
        bindMobileMenus();
        bindEditor();
        bindGallery();

        // ---------- تحميل آخر مشروع مفتوح، أو إنشاء أوّل مشروع ----------
        bootstrapProject();

        onGraphChange();
        requestAnimationFrame(() => {
            CanvasEngine.fitToContent(Graph.state.nodes);
            Wires.refresh();
        });

        // إعادة توسيط الأسلاك عند تغيّر حجم النافذة
        window.addEventListener("resize", () => Wires.refresh());

        // حفظ فوري قبل مغادرة الصفحة (شبكة أمان للـ debounce)
        window.addEventListener("beforeunload", flushAutosave);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") flushAutosave();
        });
    }

    /**
     * bootstrapProject — يقرّر ماذا يُحمَّل عند الإقلاع:
     *  1) آخر مشروع مفتوح إن وُجد وكان صالحاً.
     *  2) وإلا أحدث مشروع محفوظ.
     *  3) وإلا يُنشئ مشروعاً افتتاحياً (بالمخطط الترحيبي) لأول استخدام.
     */
    function bootstrapProject() {
        suppressAutosave = true;
        const lastId = Storage.getLastOpened();
        let proj = lastId ? Storage.get(lastId) : null;

        if (!proj) {
            const items = Storage.list();
            if (items.length) proj = Storage.get(items[0].id);
        }

        if (proj) {
            const g = proj.graph || { nodes: [], links: [] };
            Graph.replaceState(g.nodes || [], g.links || []);
            currentProjectId = proj.id;
            Storage.setLastOpened(proj.id);
        } else {
            // أول تشغيل: نبني المخطط الترحيبي ثم نحفظه كمشروع أول
            seedDemo();
            const created = Storage.create("مشروع ترحيبي", Graph.toJSON());
            currentProjectId = created.id;
            Storage.setLastOpened(created.id);
        }

        dirty = false;
        suppressAutosave = false;
        updateProjectHeader();
        markSaved();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { toast, closeSidebarMobile };
})();

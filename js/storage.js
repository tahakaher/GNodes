/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   storage.js  —  طبقة التخزين المحلي (localStorage) وإدارة المشاريع
   ---------------------------------------------------------------------
   نموذج المشروع (Project):
   {
     id:        "gn_xxxxxxx",   // معرّف فريد ثابت (لا يتغيّر أبداً)
     name:      "مشروعي",       // اسم معروض (قابل للتغيير/التكرار)
     createdAt: 1710000000000,
     updatedAt: 1710000000000,
     graph:     { nodes:[...], links:[...] }   // بنية G-Nodes
   }

   مفاتيح التخزين:
   - gnodes:projects        → كائن { [id]: Project }
   - gnodes:last_opened     → معرّف آخر مشروع مفتوح (منفصل عن الاسم)

   ملاحظات تصميم:
   - المعرّف id مستقلّ تماماً عن الاسم؛ إعادة التسمية لا تلمس id.
   - كل الدوال دفاعية: لا تنهار لو تلِف التخزين أو امتلأ.
   ===================================================================== */

const Storage = (() => {
    const K_PROJECTS = "gnodes:projects";
    const K_LAST = "gnodes:last_opened";
    const FILE_EXT = ".gnode";

    /* ---------- أدوات منخفضة المستوى ---------- */

    function _read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) { return fallback; }
    }
    function _write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            // امتلاء التخزين أو تعطيله
            return false;
        }
    }

    /** genId — معرّف فريد ثابت للمشروع */
    function genId() {
        const rnd = Math.random().toString(36).slice(2, 9);
        return `gn_${Date.now().toString(36)}${rnd}`;
    }

    /* ---------- عمليات المشاريع ---------- */

    /** getAll — كائن كل المشاريع { id: project } */
    function getAll() { return _read(K_PROJECTS, {}); }

    /** list — مصفوفة مشاريع مرتّبة بالأحدث تعديلاً، مع عدد العُقد */
    function list() {
        const all = getAll();
        return Object.values(all)
            .map(p => ({
                id: p.id,
                name: p.name,
                updatedAt: p.updatedAt,
                createdAt: p.createdAt,
                nodeCount: (p.graph && Array.isArray(p.graph.nodes)) ? p.graph.nodes.length : 0
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** get — مشروع كامل بالمعرّف (أو null) */
    function get(id) {
        const all = getAll();
        return all[id] || null;
    }

    /**
     * create — إنشاء مشروع جديد بمعرّف ثابت وحفظه.
     * @returns {Project}
     */
    function create(name, graph) {
        const now = Date.now();
        const project = {
            id: genId(),
            name: (name && name.trim()) || "مشروع بلا اسم",
            createdAt: now,
            updatedAt: now,
            graph: graph || { nodes: [], links: [] }
        };
        const all = getAll();
        all[project.id] = project;
        _write(K_PROJECTS, all);
        return project;
    }

    /**
     * save — حفظ/تحديث مشروع موجود (يحدّث updatedAt). لا يغيّر id.
     * إن لم يوجد المشروع، يُنشأ بنفس الـ id الممرَّر (مفيد لإعادة الإدراج).
     */
    function save(project) {
        if (!project || !project.id) return false;
        const all = getAll();
        const prev = all[project.id];
        all[project.id] = {
            ...prev,
            id: project.id,
            name: project.name ?? (prev ? prev.name : "مشروع بلا اسم"),
            createdAt: prev ? prev.createdAt : (project.createdAt || Date.now()),
            updatedAt: Date.now(),
            graph: project.graph || (prev ? prev.graph : { nodes: [], links: [] })
        };
        return _write(K_PROJECTS, all);
    }

    /** updateGraph — حفظ بنية المخطط لمشروع بمعرّفه (الحفظ التلقائي) */
    function updateGraph(id, graph) {
        const all = getAll();
        if (!all[id]) return false;
        all[id].graph = graph;
        all[id].updatedAt = Date.now();
        return _write(K_PROJECTS, all);
    }

    /** rename — تعديل الاسم فقط (لا يمسّ id ولا graph) */
    function rename(id, newName) {
        const all = getAll();
        if (!all[id]) return false;
        all[id].name = (newName && newName.trim()) || all[id].name;
        all[id].updatedAt = Date.now();
        return _write(K_PROJECTS, all);
    }

    /** remove — حذف نهائي لمشروع */
    function remove(id) {
        const all = getAll();
        if (!all[id]) return false;
        delete all[id];
        _write(K_PROJECTS, all);
        // لو كان آخر مشروع مفتوح، أزل المرجع
        if (getLastOpened() === id) setLastOpened(null);
        return true;
    }

    /* ---------- آخر مشروع مفتوح ---------- */
    function getLastOpened() { return _read(K_LAST, null); }
    function setLastOpened(id) {
        try {
            if (id) localStorage.setItem(K_LAST, JSON.stringify(id));
            else localStorage.removeItem(K_LAST);
            return true;
        } catch (_) { return false; }
    }

    /* ---------- التصدير / الاستيراد (.gnode) ---------- */

    /**
     * exportProject — يبني نصّ JSON منسّق لتنزيله كملف .gnode.
     * @returns {{ filename, content }}
     */
    function exportProject(id) {
        const p = get(id);
        if (!p) return null;
        const payload = {
            format: "gnode",
            version: 1,
            name: p.name,
            exportedAt: Date.now(),
            graph: p.graph
        };
        const safeName = (p.name || "project").replace(/[^\w\u0600-\u06FF\- ]/g, "").trim() || "project";
        return { filename: safeName + FILE_EXT, content: JSON.stringify(payload, null, 2) };
    }

    /**
     * validateImport — يتحقق من صحة بنية ملف .gnode قبل القبول.
     * @returns {{ ok:boolean, error?:string, graph?, name? }}
     */
    function validateImport(text) {
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            return { ok: false, error: "الملف ليس JSON صالحاً" };
        }
        if (typeof obj !== "object" || obj === null) {
            return { ok: false, error: "محتوى الملف غير صالح" };
        }
        // البنية قد تكون { graph:{nodes,links} } أو { nodes, links } مباشرة
        const graph = (obj.graph && typeof obj.graph === "object") ? obj.graph : obj;
        if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
            return { ok: false, error: "بنية غير صالحة: يجب وجود مصفوفتَي nodes وlinks" };
        }
        // فحص سطحي لعناصر العُقد
        const badNode = graph.nodes.find(n => !n || typeof n.id !== "string" || typeof n.type !== "string");
        if (badNode) return { ok: false, error: "بعض العُقد تفتقد id أو type صالحين" };

        return {
            ok: true,
            name: (obj.name && String(obj.name)) || "مشروع مستورد",
            graph: { nodes: graph.nodes, links: Array.isArray(graph.links) ? graph.links : [] }
        };
    }

    /**
     * importAsNewProject — يستورد نصّاً ويحفظه كمشروع جديد إن كان صالحاً.
     * @returns {{ ok:boolean, error?:string, project? }}
     */
    function importAsNewProject(text) {
        const v = validateImport(text);
        if (!v.ok) return { ok: false, error: v.error };
        const project = create(v.name, v.graph);
        return { ok: true, project };
    }

    return {
        genId, getAll, list, get,
        create, save, updateGraph, rename, remove,
        getLastOpened, setLastOpened,
        exportProject, validateImport, importAsNewProject,
        FILE_EXT
    };
})();

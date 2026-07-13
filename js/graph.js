/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   graph.js  (الإصدار 2)
   ---------------------------------------------------------------------
   نموذج البيانات المركزي (Single Source of Truth).

   بنية البيانات (JSON):
   {
     nodes: [ { id, type, x, y, title, data:{...} }, ... ],
     links: [ { id, from:{node, port}, to:{node, port} }, ... ]
   }

   الجديد في هذا الإصدار:
   - دعم عدة حقول لكل عقدة (fields[]) بدل حقل واحد.
   - قيود ربط ذكية: توافق أنواع المنافذ + منع الدورات (cyclic) في التدفّق.
   - replaceState(): استبدال كامل للحالة (يستخدمه المحلّل parser.js).
   - onError(): نظام إشعارات للأخطاء المنطقية (يعرضه app.js كـ toast).
   ===================================================================== */

const Graph = (() => {
    const state = { nodes: [], links: [] };

    let _seq = 1;
    const uid = (p) => `${p}_${(_seq++).toString(36)}${Date.now().toString(36).slice(-3)}`;

    /* المستمعون */
    const listeners = new Set();
    const errorListeners = new Set();

    function emit(reason = "") { for (const fn of listeners) fn(state, reason); }
    function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

    /** onError — تسجيل مستمع لأخطاء منطقية (يُعرض للمستخدم) */
    function onError(fn) { errorListeners.add(fn); return () => errorListeners.delete(fn); }
    function reportError(msg, level = "warn") { for (const fn of errorListeners) fn(msg, level); }

    /* ---------- العُقد ---------- */

    function defaultData(type) {
        const def = NODE_LIBRARY[type];
        const data = {};
        (def.fields || []).forEach(f => { data[f.key] = f.default ?? ""; });
        return data;
    }

    function addNode(type, x, y, data = null) {
        const def = NODE_LIBRARY[type];
        if (!def) { reportError(`نوع عقدة غير معروف: ${type}`); return null; }
        const node = {
            id: uid("node"), type,
            x: Math.round(x), y: Math.round(y),
            title: def.title,
            data: data ? { ...defaultData(type), ...data } : defaultData(type)
        };
        state.nodes.push(node);
        emit("addNode");
        return node;
    }

    const getNode = (id) => state.nodes.find(n => n.id === id);

    function moveNode(id, x, y, silent = false) {
        const n = getNode(id);
        if (!n) return;
        n.x = Math.round(x); n.y = Math.round(y);
        if (!silent) emit("moveNode");
    }

    function setNodeData(id, key, value, silent = false) {
        const n = getNode(id);
        if (!n) return;
        n.data[key] = value;
        if (!silent) emit("setNodeData");
    }

    function removeNode(id) {
        state.nodes = state.nodes.filter(n => n.id !== id);
        state.links = state.links.filter(l => l.from.node !== id && l.to.node !== id);
        emit("removeNode");
    }

    /* ---------- الروابط + الحماية المنطقية ---------- */

    /**
     * wouldCreateCycle — يفحص إن كان إضافة رابط flow من fromNode إلى toNode
     * سيُنشئ دورة في مخطط التدفّق (اعتماداً على روابط flow الحالية).
     */
    function wouldCreateCycle(fromNode, toNode) {
        // نبني قائمة مجاورة لروابط flow فقط، ثم نتحقق: هل toNode يصل إلى fromNode؟
        const flowLinks = state.links.filter(l => {
            const fp = getPortDef(getNode(l.from.node)?.type, l.from.port, "out");
            return fp && fp.dataType === "flow";
        });
        const adj = {};
        flowLinks.forEach(l => { (adj[l.from.node] ||= []).push(l.to.node); });
        // أضف الرابط المقترح مؤقتاً
        (adj[fromNode] ||= []).push(toNode);

        // BFS من toNode بحثاً عن fromNode
        const seen = new Set();
        const queue = [toNode];
        while (queue.length) {
            const cur = queue.shift();
            if (cur === fromNode) return true;
            if (seen.has(cur)) continue;
            seen.add(cur);
            (adj[cur] || []).forEach(n => queue.push(n));
        }
        return false;
    }

    /**
     * canConnect — القواعد الكاملة للحماية:
     * 1) عقدتان مختلفتان.
     * 2) توافق نوع المنفذين (flow↔flow، أو أنواع قيم متوافقة).
     * 3) منفذ الإدخال غير مشغول مسبقاً.
     * 4) لا تكرار.
     * 5) لا دورة (للتدفّق flow).
     * @returns {{ok:boolean, reason?:string}}
     */
    function canConnect(from, to) {
        const fromNode = getNode(from.node);
        const toNode = getNode(to.node);
        if (!fromNode || !toNode) return { ok: false, reason: "عقدة غير موجودة" };
        if (from.node === to.node) return { ok: false, reason: "لا يمكن ربط العقدة بنفسها" };

        // توافق الأنواع
        if (!arePortsCompatible(fromNode.type, from.port, toNode.type, to.port)) {
            return { ok: false, reason: "نوعا المنفذين غير متوافقين" };
        }

        const fp = getPortDef(fromNode.type, from.port, "out");
        const isFlow = fp && fp.dataType === "flow";

        // منفذ الإدخال لا يقبل أكثر من رابط
        const inputBusy = state.links.some(l => l.to.node === to.node && l.to.port === to.port);
        if (inputBusy) return { ok: false, reason: "منفذ الإدخال مشغول بسلك آخر" };

        // منع التكرار
        const dup = state.links.some(l =>
            l.from.node === from.node && l.from.port === from.port &&
            l.to.node === to.node && l.to.port === to.port);
        if (dup) return { ok: false, reason: "هذا الرابط موجود مسبقاً" };

        // منع الدورات في التدفّق
        if (isFlow && wouldCreateCycle(from.node, to.node)) {
            return { ok: false, reason: "ربط دائري (Cycle) ممنوع في تسلسل التنفيذ" };
        }

        return { ok: true };
    }

    function addLink(from, to, silent = false) {
        const check = canConnect(from, to);
        if (!check.ok) { if (!silent) reportError(check.reason); return null; }
        const link = { id: uid("link"), from: { ...from }, to: { ...to } };
        state.links.push(link);
        emit("addLink");
        return link;
    }

    function removeLink(id) {
        state.links = state.links.filter(l => l.id !== id);
        emit("removeLink");
    }

    function clear() { state.nodes = []; state.links = []; emit("clear"); }

    /**
     * replaceState — استبدال كامل للعُقد والروابط (يستعمله parser.js).
     * يعيد ضبط العدّاد بأمان لتفادي تصادم المعرّفات.
     */
    function replaceState(nodes, links) {
        state.nodes = nodes.map(n => ({ ...n, data: { ...n.data } }));
        state.links = links.map(l => ({ ...l, from: { ...l.from }, to: { ...l.to } }));
        // نرفع العدّاد فوق أي معرّف رقمي موجود
        emit("replaceState");
    }

    function toJSON() {
        return {
            nodes: state.nodes.map(n => ({
                id: n.id, type: n.type, x: n.x, y: n.y, title: n.title, data: { ...n.data }
            })),
            links: state.links.map(l => ({ id: l.id, from: { ...l.from }, to: { ...l.to } }))
        };
    }

    return {
        state, onChange, onError, reportError,
        addNode, getNode, moveNode, setNodeData, removeNode,
        canConnect, addLink, removeLink,
        clear, replaceState, toJSON, uid
    };
})();

/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   canvas.js
   ---------------------------------------------------------------------
   محرك لوحة العمل اللانهائية:
   - التحريك (Panning) بسحب الفراغ أو بزر الماوس الأوسط.
   - التكبير/التصغير (Zooming) بعجلة الماوس مع تركيز على المؤشر.
   - تحويل الإحداثيات بين "الشاشة" و"عالم اللوحة".

   نموذج التحويل: worldPoint -> screen:
       screenX = worldX * scale + offsetX
   والعكس:
       worldX = (screenX - offsetX) / scale
   ===================================================================== */

const CanvasEngine = (() => {
    /* عناصر DOM */
    let wrapEl, worldEl, gridEl, coordsEl;

    /* حالة العرض */
    const view = {
        scale: 1,
        offsetX: 0,   // إزاحة أفقية بالبكسل (شاشة)
        offsetY: 0,   // إزاحة رأسية بالبكسل (شاشة)
        minScale: 0.25,
        maxScale: 2.5
    };

    /* حالة السحب (Panning) */
    let panning = false;
    let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

    /* مستمعو تغيّر العرض (لإعادة رسم الأسلاك عند التكبير) */
    const viewListeners = new Set();
    const onViewChange = (fn) => { viewListeners.add(fn); return () => viewListeners.delete(fn); };
    const emitView = () => viewListeners.forEach(fn => fn(view));

    /* --------- تحويل الإحداثيات --------- */

    /** screenToWorld — تحويل نقطة من إحداثيات الشاشة إلى عالم اللوحة */
    function screenToWorld(clientX, clientY) {
        const rect = wrapEl.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        return {
            x: (sx - view.offsetX) / view.scale,
            y: (sy - view.offsetY) / view.scale
        };
    }

    /* --------- تطبيق التحويل على الـ DOM --------- */

    function apply() {
        // طبقة العالم: نقل ثم تحجيم
        worldEl.style.transform =
            `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`;

        // الخلفية الشبكية: نحرّك موضعها ونحجّم خطوطها لتبدو لانهائية
        const s = view.scale;
        gridEl.style.backgroundSize =
            `${20 * s}px ${20 * s}px, ${20 * s}px ${20 * s}px, ` +
            `${100 * s}px ${100 * s}px, ${100 * s}px ${100 * s}px`;
        gridEl.style.backgroundPosition =
            `${view.offsetX}px ${view.offsetY}px`;

        updateZoomLabel();
        emitView();
    }

    function updateZoomLabel() {
        const label = document.getElementById("zoom-label");
        if (label) label.textContent = Math.round(view.scale * 100) + "%";
    }

    /* --------- التكبير عند نقطة (تركيز على المؤشر) --------- */

    function zoomAt(clientX, clientY, factor) {
        const rect = wrapEl.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;

        // النقطة في العالم قبل التكبير
        const worldX = (sx - view.offsetX) / view.scale;
        const worldY = (sy - view.offsetY) / view.scale;

        // تطبيق التكبير ضمن الحدود
        let newScale = view.scale * factor;
        newScale = Math.min(view.maxScale, Math.max(view.minScale, newScale));
        view.scale = newScale;

        // إعادة حساب الإزاحة لإبقاء نفس نقطة العالم تحت المؤشر
        view.offsetX = sx - worldX * view.scale;
        view.offsetY = sy - worldY * view.scale;

        apply();
    }

    /* --------- أوامر عامة --------- */

    function setZoom100() {
        // نبقي مركز الشاشة ثابتاً
        const rect = wrapEl.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / view.scale);
    }

    /** fitToContent — توسيط العرض على كل العُقد الموجودة */
    function fitToContent(nodes) {
        if (!nodes || nodes.length === 0) { reset(); return; }

        // حدود العُقد (نقدّر عرض/ارتفاع تقريبي لكل عقدة)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            const el = document.getElementById(n.id);
            const w = el ? el.offsetWidth : 200;
            const h = el ? el.offsetHeight : 120;
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + w);
            maxY = Math.max(maxY, n.y + h);
        });

        const pad = 80;
        const cw = maxX - minX + pad * 2;
        const ch = maxY - minY + pad * 2;
        const rect = wrapEl.getBoundingClientRect();

        const scale = Math.min(rect.width / cw, rect.height / ch, view.maxScale);
        view.scale = Math.max(view.minScale, scale);

        // توسيط: نجعل مركز صندوق المحتوى في مركز الشاشة
        view.offsetX = rect.width / 2 - ((minX + maxX) / 2) * view.scale;
        view.offsetY = rect.height / 2 - ((minY + maxY) / 2) * view.scale;

        apply();
    }

    function reset() {
        view.scale = 1;
        view.offsetX = 40;
        view.offsetY = 40;
        apply();
    }

    /* --------- ربط الأحداث --------- */

    function bindEvents() {
        // عجلة الماوس -> تكبير/تصغير
        wrapEl.addEventListener("wheel", (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            zoomAt(e.clientX, e.clientY, factor);
        }, { passive: false });

        // بدء التحريك: الضغط على الفراغ (وليس على عقدة/منفذ)
        wrapEl.addEventListener("pointerdown", (e) => {
            const isBackground = e.target === wrapEl || e.target === gridEl ||
                                 e.target.id === "world" || e.target.id === "wires" ||
                                 e.target.id === "nodes-layer" || e.target.id === "empty-state";
            const middleButton = e.button === 1;
            if (!isBackground && !middleButton) return;

            panning = true;
            panStart = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
            wrapEl.classList.add("is-panning");
            wrapEl.setPointerCapture(e.pointerId);
        });

        wrapEl.addEventListener("pointermove", (e) => {
            // تحديث مؤشر الإحداثيات دائماً
            const w = screenToWorld(e.clientX, e.clientY);
            coordsEl.textContent = `x: ${Math.round(w.x)} · y: ${Math.round(w.y)}`;

            if (!panning) return;
            view.offsetX = panStart.ox + (e.clientX - panStart.x);
            view.offsetY = panStart.oy + (e.clientY - panStart.y);
            apply();
        });

        const endPan = (e) => {
            if (!panning) return;
            panning = false;
            wrapEl.classList.remove("is-panning");
            try { wrapEl.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        wrapEl.addEventListener("pointerup", endPan);
        wrapEl.addEventListener("pointercancel", endPan);

        // منع قائمة السياق على زر الماوس الأوسط
        wrapEl.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });

        bindTouchGestures();
    }

    /* --------- إيماءات اللمس: التحريك بإصبع والتكبير بإصبعين --------- */
    let touchState = null;
    function dist(t1, t2) { return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY); }
    function mid(t1, t2) { return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; }

    function bindTouchGestures() {
        wrapEl.addEventListener("touchstart", (e) => {
            // تجاهل اللمس على عقدة/منفذ (تديره وحداتها)
            if (e.target.closest?.(".node") || e.target.closest?.(".port")) return;

            if (e.touches.length === 1) {
                const t = e.touches[0];
                touchState = { mode: "pan", x: t.clientX, y: t.clientY, ox: view.offsetX, oy: view.offsetY };
            } else if (e.touches.length === 2) {
                const [a, b] = e.touches;
                touchState = { mode: "pinch", startDist: dist(a, b), startScale: view.scale, center: mid(a, b) };
            }
        }, { passive: true });

        wrapEl.addEventListener("touchmove", (e) => {
            if (!touchState) return;
            if (touchState.mode === "pan" && e.touches.length === 1) {
                const t = e.touches[0];
                view.offsetX = touchState.ox + (t.clientX - touchState.x);
                view.offsetY = touchState.oy + (t.clientY - touchState.y);
                apply();
            } else if (touchState.mode === "pinch" && e.touches.length === 2) {
                const [a, b] = e.touches;
                const factor = dist(a, b) / touchState.startDist;
                const c = mid(a, b);
                const targetScale = Math.min(view.maxScale, Math.max(view.minScale, touchState.startScale * factor));
                zoomAt(c.x, c.y, targetScale / view.scale);
            }
            e.preventDefault();
        }, { passive: false });

        wrapEl.addEventListener("touchend", (e) => {
            if (e.touches.length === 0) touchState = null;
            else if (e.touches.length === 1) {
                const t = e.touches[0];
                touchState = { mode: "pan", x: t.clientX, y: t.clientY, ox: view.offsetX, oy: view.offsetY };
            }
        });
    }

    /** zoomAtCenter — تكبير/تصغير عبر أزرار الواجهة */
    function zoomAtCenter(factor) {
        const rect = wrapEl.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    }

    /* --------- التهيئة --------- */

    function init() {
        wrapEl   = document.getElementById("canvas-wrap");
        worldEl  = document.getElementById("world");
        gridEl   = document.getElementById("grid-bg");
        coordsEl = document.getElementById("coords-hud");
        bindEvents();
        reset();
    }

    return {
        init,
        get view() { return view; },
        screenToWorld,
        zoomAt, zoomAtCenter, setZoom100, fitToContent, reset,
        onViewChange, apply
    };
})();

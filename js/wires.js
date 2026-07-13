/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   wires.js  (الإصدار 2)
   ---------------------------------------------------------------------
   طبقة الأسلاك (Bezier) داخل SVG مع دعم اللمس والتغذية الراجعة للتوافق:
   - رسم كل رابط كمنحنى بيزييه، بلون منفذ المصدر.
   - سحب سلك مؤقت من مخرج حتى مدخل، مع إبراز أخضر (صالح) أو أحمر (مرفوض).
   - يعمل بالماوس واللمس عبر Pointer Events.
   ===================================================================== */

const Wires = (() => {
    let svgEl;
    let linking = null;
    const SVG_NS = "http://www.w3.org/2000/svg";

    /* منحنى بيزييه أفقي */
    function bezierPath(a, b) {
        const dx = Math.abs(b.x - a.x);
        const curve = Math.max(40, Math.min(dx * 0.6, 200));
        return `M ${a.x} ${a.y} C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
    }

    function portColorVar(dt) {
        const map = {
            flow: "#e6edf3", number: "var(--cat-logic)", string: "var(--cat-io)",
            bool: "var(--cat-loop)", list: "var(--cat-lib)", dict: "var(--accent-2)", any: "var(--text-2)"
        };
        return map[dt] || "var(--accent)";
    }

    function createLinkPath(link) {
        const g = document.createElementNS(SVG_NS, "g");
        g.dataset.linkId = link.id;

        const hit = document.createElementNS(SVG_NS, "path");
        hit.setAttribute("class", "wire-hit");

        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "wire-path");
        const fromNode = Graph.getNode(link.from.node);
        if (fromNode) {
            const pd = getPortDef(fromNode.type, link.from.port, "out");
            path.style.setProperty("--wire-color", portColorVar(pd?.dataType));
        }

        const remove = (e) => { e.stopPropagation(); Graph.removeLink(link.id); };
        hit.addEventListener("click", remove);
        hit.addEventListener("pointerenter", () => path.classList.add("is-hover"));
        hit.addEventListener("pointerleave", () => path.classList.remove("is-hover"));

        g.appendChild(hit);
        g.appendChild(path);
        return g;
    }

    function updateLinkGeometry(g, link) {
        const a = Nodes.getPortWorldPosition(link.from.node, link.from.port, "out");
        const b = Nodes.getPortWorldPosition(link.to.node, link.to.port, "in");
        if (!a || !b) return;
        const d = bezierPath(a, b);
        g.querySelector(".wire-hit").setAttribute("d", d);
        g.querySelector(".wire-path").setAttribute("d", d);
    }

    function render() {
        const modelIds = new Set(Graph.state.links.map(l => l.id));
        [...svgEl.querySelectorAll("g[data-link-id]")].forEach(g => {
            if (!modelIds.has(g.dataset.linkId)) g.remove();
        });
        Graph.state.links.forEach(link => {
            let g = svgEl.querySelector(`g[data-link-id="${link.id}"]`);
            if (!g) { g = createLinkPath(link); svgEl.appendChild(g); }
            updateLinkGeometry(g, link);
        });
        markConnectedPorts();
    }

    function refresh() {
        Graph.state.links.forEach(link => {
            const g = svgEl.querySelector(`g[data-link-id="${link.id}"]`);
            if (g) updateLinkGeometry(g, link);
        });
    }

    function markConnectedPorts() {
        document.querySelectorAll(".port.is-connected").forEach(p => p.classList.remove("is-connected"));
        Graph.state.links.forEach(l => {
            markPort(l.from.node, l.from.port, "out");
            markPort(l.to.node, l.to.port, "in");
        });
    }
    function markPort(nodeId, portId, dir) {
        const el = document.querySelector(`#${CSS.escape(nodeId)} .port[data-port="${portId}"][data-dir="${dir}"]`);
        el?.classList.add("is-connected");
    }

    /* --------- سحب سلك جديد (ماوس/لمس) --------- */
    function beginLinkFromPort(nodeId, portId, dotEl, startEvent) {
        const start = Nodes.getPortWorldPosition(nodeId, portId, "out");
        if (!start) return;

        const temp = document.createElementNS(SVG_NS, "path");
        temp.setAttribute("class", "wire-path is-temp");
        const fromNode = Graph.getNode(nodeId);
        const pd = getPortDef(fromNode.type, portId, "out");
        temp.style.setProperty("--wire-color", portColorVar(pd?.dataType));
        svgEl.appendChild(temp);

        linking = { fromNode: nodeId, fromPort: portId, tempPath: temp, start };
        document.getElementById("canvas-wrap").classList.add("is-linking");

        window.addEventListener("pointermove", onLinkDrag);
        window.addEventListener("pointerup", onLinkDrop, { once: true });
    }

    let hotPortEl = null;
    function onLinkDrag(e) {
        if (!linking) return;
        const end = CanvasEngine.screenToWorld(e.clientX, e.clientY);
        linking.tempPath.setAttribute("d", bezierPath(linking.start, end));
        highlightHotPort(e.clientX, e.clientY);
    }

    function highlightHotPort(clientX, clientY) {
        const target = document.elementFromPoint(clientX, clientY);
        const port = target?.closest?.(".port--in");
        if (hotPortEl && hotPortEl !== port) {
            hotPortEl.classList.remove("is-hot", "is-invalid");
        }
        if (port) {
            // نحدّد إن كان الربط صالحاً لإظهار اللون المناسب
            const check = Graph.canConnect(
                { node: linking.fromNode, port: linking.fromPort },
                { node: port.dataset.node, port: port.dataset.port }
            );
            port.classList.add("is-hot");
            port.classList.toggle("is-invalid", !check.ok);
            hotPortEl = port;
        } else {
            hotPortEl = null;
        }
    }

    function onLinkDrop(e) {
        window.removeEventListener("pointermove", onLinkDrag);
        document.getElementById("canvas-wrap").classList.remove("is-linking");
        if (hotPortEl) { hotPortEl.classList.remove("is-hot", "is-invalid"); hotPortEl = null; }
        if (!linking) return;

        const target = document.elementFromPoint(e.clientX, e.clientY);
        const inPort = target?.closest?.(".port--in");
        if (inPort) {
            Graph.addLink(
                { node: linking.fromNode, port: linking.fromPort },
                { node: inPort.dataset.node, port: inPort.dataset.port }
            ); // addLink يُبلّغ عن الخطأ تلقائياً إن رُفض
        }
        linking.tempPath.remove();
        linking = null;
    }

    function init() { svgEl = document.getElementById("wires"); }

    return { init, render, refresh, beginLinkFromPort };
})();

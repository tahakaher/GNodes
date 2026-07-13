/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   generator.js  —  محرك توليد كود بايثون (Code Generation Engine)
   ---------------------------------------------------------------------
   يحوّل Graph.toJSON() إلى كود بايثون نظيف متوافق مع PEP 8.

   المفاهيم الأساسية:
   -----------------
   1) نوعان من الروابط:
      - روابط "التدفّق" (flow): تحدّد تسلسل تنفيذ الأوامر (البرنامج الرئيسي
        وأجسام الحلقات/الشروط). تُرسَم عبر منافذ dataType == "flow".
      - روابط "القيمة" (value): تمرّر قيمة من مخرج عقدة إلى مدخل أخرى،
        وتُترجَم إلى اسم المتغير الحامل للقيمة (لتفادي NameError).

   2) الترتيب الطوبولوجي (Topological Sort):
      نرتّب "سلسلة التدفّق" بدءاً من عقدة جذر (لا مدخل flow لها) ونمشي
      عبر منافذ flow_out بالترتيب، مع الدخول في أجسام الحلقات/الشروط.

   3) توليد PEP 8:
      - مسافة بادئة = 4 فراغات لكل مستوى.
      - أسماء متغيرات صحيحة (تعقيم الأسماء).
      - أسطر import مجمّعة أعلى الملف بلا تكرار.
      - سطران فارغان حول تعريفات الدوال (غير مستخدم هنا لكن محجوز).
   ===================================================================== */

const Generator = (() => {

    const INDENT = "    "; // 4 فراغات (PEP 8)

    /* ---------- أدوات مساعدة ---------- */

    /* قائمة كلمات بايثون المحجوزة (محاكاة keyword.kwlist) + قيم مدمجة شائعة
       يُمنع استخدامها كأسماء متغيرات لتفادي SyntaxError. */
    const PY_KEYWORDS = new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await",
        "break", "class", "continue", "def", "del", "elif", "else", "except",
        "finally", "for", "from", "global", "if", "import", "in", "is",
        "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
        "while", "with", "yield",
        // قيم/دوال مدمجة يُفضّل عدم الكتابة فوقها
        "print", "input", "int", "float", "str", "list", "dict", "bool",
        "range", "len", "open", "type", "sum", "min", "max", "abs"
    ]);

    /* سجلّ آخر عمليات تعقيم أنتجت تعديلاً على اسم محجوز — يقرؤه app.js
       ليعرض تنبيهاً غير مزعج (يُفرَّغ في بداية كل توليد). */
    let reservedRenames = [];
    function resetReservedRenames() { reservedRenames = []; }
    function getReservedRenames() { return reservedRenames.slice(); }

    /** sanitizeName — تحويل نص إلى اسم متغير بايثون صالح + تأمين الكلمات المحجوزة */
    function sanitizeName(raw, fallback = "var") {
        const original = String(raw || "").trim();
        let s = original;
        // استبدال المسافات والرموز بشرطة سفلية
        s = s.replace(/[^\w]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
        if (!s) s = fallback;
        // لا يبدأ برقم
        if (/^\d/.test(s)) s = "_" + s;
        // كلمة محجوزة؟ ألحق لاحقة "_var" (class -> class_var) دون منع المتابعة
        if (PY_KEYWORDS.has(s)) {
            const renamed = `${s}_var`;
            reservedRenames.push({ original: original || s, safe: renamed });
            s = renamed;
        }
        return s;
    }

    /** pyString — تغليف نص كسلسلة بايثون آمنة */
    function pyString(s) {
        return '"' + String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }

    /* ---------- بناء فهارس الروابط ---------- */

    function buildIndex(graph) {
        const nodesById = {};
        graph.nodes.forEach(n => { nodesById[n.id] = n; });

        // روابط القيمة الواردة لكل (node,port): to -> from
        const valueInto = {};   // key: `${node}:${port}` -> { node, port }
        // روابط التدفّق: from(node,port) -> toNode
        const flowFrom = {};    // key: `${node}:${port}` -> toNodeId

        graph.links.forEach(l => {
            const fromNode = nodesById[l.from.node];
            if (!fromNode) return;
            const fp = getPortDef(fromNode.type, l.from.port, "out");
            if (!fp) return;
            if (fp.dataType === "flow") {
                flowFrom[`${l.from.node}:${l.from.port}`] = l.to.node;
            } else {
                valueInto[`${l.to.node}:${l.to.port}`] = { node: l.from.node, port: l.from.port };
            }
        });

        return { nodesById, valueInto, flowFrom };
    }

    /* ---------- حلّ القيم (Value Resolution) ---------- */

    /**
     * resolveValue — يعيد تعبير بايثون يمثّل القيمة الخارجة من (nodeId, portId).
     * إن كان المخرج قيمةً "منتَجة" (مثل var_number) نعيد اسم المتغير.
     * إن لم يوجد رابط، نستعمل قيمة الحقل الافتراضية.
     */
    function outputExpr(ctx, nodeId, portId) {
        const node = ctx.nodesById[nodeId];
        if (!node) return "None";
        // اسم المتغير الذي تنتجه هذه العقدة (إن وُجد)
        return producedVarName(node, portId) || "None";
    }

    /**
     * producedVarName — الاسم/التعبير الذي تُصدّره عقدة على منفذ مخرج قيمة.
     */
    function producedVarName(node, portId) {
        const d = node.data;
        switch (node.type) {
            case "input":       return sanitizeName(d.var, "value");
            case "file_read":   return sanitizeName(d.var, "content");
            case "var_string":  return sanitizeName(d.name, "text");
            case "var_number":  return sanitizeName(d.name, "num");
            case "var_bool":    return sanitizeName(d.name, "flag");
            case "var_list":    return sanitizeName(d.name, "items");
            case "var_dict":    return sanitizeName(d.name, "data");
            case "var_expr":    return sanitizeName(d.name, "result");
            case "lib_random":  return sanitizeName(d.var, "r");
            case "lib_time":    return d.func === "time" ? sanitizeName(d.var, "now") : "None";
            case "loop_for":    return portId === "index" ? sanitizeName(d.var, "i") : "None";
            // logic_op لا يُنتج متغيراً باسم ثابت؛ تُحلّ قيمته inline عبر resolveInput.
            case "logic_op":    return null;
            default: {
                // عقدة مخصصة: المخرج = اسم_المتغير_nodeId
                const def = NODE_LIBRARY[node.type];
                if (def && def._isCustom) {
                    const outPort = def.outputs.find(p => p.id === portId && p.dataType !== "flow");
                    if (outPort) return `${outPort.label}_${node.id.slice(-6)}`;
                }
                return null;
            }
        }
    }

    /**
     * resolveInput — يعيد تعبير القيمة المُغذّية لمنفذ إدخال (node,port).
     * إن كان مربوطاً بمخرج، نعيد الاسم المنتَج؛ وإلا نعيد fallback.
     */
    function resolveInput(ctx, nodeId, portId, fallback) {
        const src = ctx.valueInto[`${nodeId}:${portId}`];
        if (src) {
            const srcNode = ctx.nodesById[src.node];
            // عقدة منطقية: نُدرج تعبيرها مباشرة (inline) لتفادي متغير غير مُعرَّف.
            if (srcNode && srcNode.type === "logic_op") return logicOpExpr(ctx, srcNode);
            const name = producedVarName(srcNode, src.port);
            if (name && name !== "None") return name;
        }
        return fallback;
    }

    /* =============================================================
       ترجمة العُقد إلى أسطر بايثون
       كل مترجِم يعيد مصفوفة أسطر (بدون مسافة بادئة — تُضاف لاحقاً).
       العُقد ذات الأجسام (if/loops) تُترجَم بشكل خاص في الاجتياز.
       ============================================================= */

    /**
     * emitNode — يولّد أسطر عقدة "بسيطة" (بلا جسم تدفّق داخلي).
     * يعيد { lines:[], imports:Set }.
     */
    function emitSimpleNode(ctx, node) {
        const d = node.data;
        const lines = [];
        const imports = new Set();

        switch (node.type) {
            case "input": {
                const v = sanitizeName(d.var, "value");
                lines.push(`${v} = input(${pyString(d.prompt || "")})`);
                break;
            }
            case "print": {
                const linked = ctx.valueInto[`${node.id}:value`];
                if (d.text && d.text.trim() !== "") {
                    // نص ثابت (يدعم دمج قيمة مربوطة أيضاً — بما فيها تعبير منطقي inline)
                    if (linked) {
                        const val = resolveInput(ctx, node.id, "value", '""');
                        lines.push(`print(${pyString(d.text)}, ${val})`);
                    } else {
                        lines.push(`print(${pyString(d.text)})`);
                    }
                } else {
                    const val = resolveInput(ctx, node.id, "value", '""');
                    lines.push(`print(${val})`);
                }
                break;
            }
            case "file_read": {
                const v = sanitizeName(d.var, "content");
                lines.push(`with open(${pyString(d.path)}, "r", encoding="utf-8") as f:`);
                lines.push(`${INDENT}${v} = f.read()`);
                break;
            }
            case "file_write": {
                const data = resolveInput(ctx, node.id, "data", pyString(d.text || ""));
                lines.push(`with open(${pyString(d.path)}, "w", encoding="utf-8") as f:`);
                lines.push(`${INDENT}f.write(str(${data}))`);
                break;
            }
            case "var_string": {
                lines.push(`${sanitizeName(d.name, "text")} = ${pyString(d.value)}`);
                break;
            }
            case "var_number": {
                const raw = String(d.value ?? "0").trim();
                const num = /^-?\d+(\.\d+)?$/.test(raw) ? raw : "0";
                lines.push(`${sanitizeName(d.name, "num")} = ${num}`);
                break;
            }
            case "var_bool": {
                const val = d.value === "False" ? "False" : "True";
                lines.push(`${sanitizeName(d.name, "flag")} = ${val}`);
                break;
            }
            case "var_list": {
                lines.push(`${sanitizeName(d.name, "items")} = [${d.value || ""}]`);
                break;
            }
            case "var_dict": {
                lines.push(`${sanitizeName(d.name, "data")} = {${d.value || ""}}`);
                break;
            }
            case "var_expr": {
                let expr = (d.expr || "a + b");
                const a = resolveInput(ctx, node.id, "a", "0");
                const b = resolveInput(ctx, node.id, "b", "0");
                expr = expr.replace(/\ba\b/g, a).replace(/\bb\b/g, b);
                lines.push(`${sanitizeName(d.name, "result")} = ${expr}`);
                break;
            }
            case "logic_op": {
                // تُستهلك عادةً كتعبير؛ لكن إن ظهرت في التدفّق نتجاهلها بلا سطر.
                break;
            }
            case "loop_control": {
                lines.push(d.kind === "continue" ? "continue" : "break");
                break;
            }
            case "lib_random": {
                imports.add("import random");
                const v = sanitizeName(d.var, "r");
                const fn = d.func || "randint";
                const args = fn === "random" ? "" : (d.args || "");
                lines.push(`${v} = random.${fn}(${args})`);
                break;
            }
            case "lib_time": {
                imports.add("import time");
                if (d.func === "time") {
                    lines.push(`${sanitizeName(d.var, "now")} = time.time()`);
                } else {
                    lines.push(`time.sleep(${d.args || "1"})`);
                }
                break;
            }
            case "lib_tkinter": {
                imports.add("import tkinter as tk");
                lines.push(`window = tk.Tk()`);
                lines.push(`window.title(${pyString(d.title || "App")})`);
                lines.push(`tk.Label(window, text=${pyString(d.label || "")}).pack()`);
                lines.push(`window.mainloop()`);
                break;
            }
            default: {
                const def = NODE_LIBRARY[node.type];
                if (def && def._isCustom) {
                    // عقدة مخصصة: استدعاء الدالة المعرَّفة في رأس الملف
                    const valueInputs  = def.inputs.filter(p => p.dataType !== "flow");
                    const valueOutputs = def.outputs.filter(p => p.dataType !== "flow");
                    const args = valueInputs.map(p => resolveInput(ctx, node.id, p.id, "None"));
                    const call = `${node.type}(${args.join(", ")})`;
                    if (valueOutputs.length === 0) {
                        lines.push(call);
                    } else if (valueOutputs.length === 1) {
                        lines.push(`${valueOutputs[0].label}_${node.id.slice(-6)} = ${call}`);
                    } else {
                        const varNames = valueOutputs.map(p => `${p.label}_${node.id.slice(-6)}`);
                        lines.push(`${varNames.join(", ")} = ${call}`);
                    }
                } else if (def === undefined) {
                    // عقدة مفقودة (حُذفت تعريفها) — تعليق تحذيري
                    lines.push(`# [عقدة مفقودة: ${node.type}]  — العقدة غير معرَّفة، راجع قسم العُقد المخصصة`);
                }
                break;
            }
        }
        return { lines, imports };
    }

    /**
     * conditionExpr — يبني تعبير شرط لعقدة if/while.
     * الأولوية: مدخل cond مربوط (logic_op) → حقل expr النصّي.
     */
    function conditionExpr(ctx, node) {
        const src = ctx.valueInto[`${node.id}:cond`];
        if (src) {
            const srcNode = ctx.nodesById[src.node];
            if (srcNode && srcNode.type === "logic_op") return logicOpExpr(ctx, srcNode);
            const name = producedVarName(srcNode, src.port);
            if (name && name !== "None") return name;
        }
        return (node.data.expr && node.data.expr.trim()) ? node.data.expr.trim() : "True";
    }

    /** logicOpExpr — يبني تعبير عملية منطقية (and/or/not) */
    function logicOpExpr(ctx, node) {
        if (node.data.expr && node.data.expr.trim()) return `(${node.data.expr.trim()})`;
        const a = resolveInput(ctx, node.id, "a", "True");
        const op = node.data.op || "and";
        if (op === "not") return `(not ${a})`;
        const b = resolveInput(ctx, node.id, "b", "True");
        return `(${a} ${op} ${b})`;
    }

    /* =============================================================
       الاجتياز الرئيسي (Traversal) — يبني الأسطر مع المسافات البادئة
       ============================================================= */

    /**
     * ensureValueDeps — قبل توليد عقدة، تأكّد أن جميع مصادر قيمها
     * (value links) قد صُدِّرت في out[].
     *
     * المشكلة التي تُعالجها:
     *   إذا كانت عقدة (B) تستقبل قيمة من (A) عبر سلك قيمة فقط
     *   (بدون سلك تدفّق)، فـ A لن تُزار عبر walkFlow أبداً →
     *   الكود يستخدم متغير A قبل تعريفه → NameError.
     *
     * الحل: قبل توليد B، نتحقق من كل مدخلات القيمة لديها،
     * ولأي مصدر لم يُصدَّر بعد نُصدِّره أولاً (بشكل تعاودي).
     */
    function ensureValueDeps(ctx, nodeId, depth, out, imports, visited) {
        const node = ctx.nodesById[nodeId];
        if (!node) return;
        const def = NODE_LIBRARY[node.type];
        if (!def) return;

        for (const port of def.inputs) {
            if (port.dataType === "flow") continue;          // منافذ التدفّق ليست تبعيات قيمة
            const src = ctx.valueInto[`${nodeId}:${port.id}`];
            if (!src) continue;                              // لا رابط على هذا المنفذ
            const srcNode = ctx.nodesById[src.node];
            if (!srcNode) continue;
            if (srcNode.type === "logic_op") continue;       // يُدرج inline — لا سطر مستقل
            if (visited.has(src.node)) continue;             // صُدِّر مسبقاً

            // عالج تبعيات المصدر أولاً بشكل تعاودي
            ensureValueDeps(ctx, src.node, depth, out, imports, visited);

            // صدِّر المصدر نفسه الآن إن لم يكن قد صُدِّر أثناء التعاود
            if (!visited.has(src.node)) {
                visited.add(src.node);
                const { lines, imports: imp } = emitSimpleNode(ctx, srcNode);
                imp.forEach(i => imports.add(i));
                const pad = INDENT.repeat(depth);
                lines.forEach(ln => out.push(pad + ln));
            }
        }
    }

    /**
     * walkFlow — يمشي عبر سلسلة تدفّق ابتداءً من startNodeId،
     * ويكتب الأسطر في out[] بمستوى بادئة depth.
     * visited يمنع إعادة الزيارة (حماية إضافية ضد الحلقات).
     */
    function walkFlow(ctx, startNodeId, depth, out, imports, visited) {
        let currentId = startNodeId;

        while (currentId) {
            if (visited.has(currentId)) break;   // أمان ضد الدورات
            visited.add(currentId);

            // تأكّد من توليد كل مصادر القيمة الواردة قبل توليد هذه العقدة
            ensureValueDeps(ctx, currentId, depth, out, imports, visited);

            const node = ctx.nodesById[currentId];
            if (!node) break;
            const pad = INDENT.repeat(depth);

            if (node.type === "if_simple" || node.type === "if_else") {
                const cond = conditionExpr(ctx, node);
                out.push(`${pad}if ${cond}:`);
                const thenStart = ctx.flowFrom[`${node.id}:then`];
                if (thenStart) walkFlow(ctx, thenStart, depth + 1, out, imports, new Set(visited));
                else out.push(`${pad}${INDENT}pass`);

                if (node.type === "if_else") {
                    out.push(`${pad}else:`);
                    const elseStart = ctx.flowFrom[`${node.id}:else`];
                    if (elseStart) walkFlow(ctx, elseStart, depth + 1, out, imports, new Set(visited));
                    else out.push(`${pad}${INDENT}pass`);
                }
                currentId = ctx.flowFrom[`${node.id}:flow_out`];

            } else if (node.type === "loop_for") {
                const v = sanitizeName(node.data.var, "i");
                const count = (node.data.count || "10").trim();
                out.push(`${pad}for ${v} in range(${count}):`);
                const bodyStart = ctx.flowFrom[`${node.id}:body`];
                if (bodyStart) walkFlow(ctx, bodyStart, depth + 1, out, imports, new Set(visited));
                else out.push(`${pad}${INDENT}pass`);
                currentId = ctx.flowFrom[`${node.id}:flow_out`];

            } else if (node.type === "loop_while") {
                const cond = conditionExpr(ctx, node);
                out.push(`${pad}while ${cond}:`);
                const bodyStart = ctx.flowFrom[`${node.id}:body`];
                if (bodyStart) walkFlow(ctx, bodyStart, depth + 1, out, imports, new Set(visited));
                else out.push(`${pad}${INDENT}pass`);
                currentId = ctx.flowFrom[`${node.id}:flow_out`];

            } else {
                // عقدة بسيطة
                const { lines, imports: imp } = emitSimpleNode(ctx, node);
                imp.forEach(i => imports.add(i));
                lines.forEach(ln => out.push(pad + ln));
                currentId = ctx.flowFrom[`${node.id}:flow_out`];
            }
        }
    }

    /* ---------- إيجاد جذور التدفّق (Topological entry points) ---------- */

    /**
     * findFlowRoots — العُقد التي لها منفذ flow_out لكن لا flow_in وارد إليها،
     * أي بدايات سلاسل التنفيذ. نرتّبها حسب موضع y ثم x (استقرار بصري).
     */
    function findFlowRoots(ctx, graph) {
        // مجموعة العُقد التي تُستقبِل تدفّقاً (لها flow وارد)
        const hasIncomingFlow = new Set();
        graph.links.forEach(l => {
            const fromNode = ctx.nodesById[l.from.node];
            if (!fromNode) return;
            const fp = getPortDef(fromNode.type, l.from.port, "out");
            if (fp && fp.dataType === "flow") hasIncomingFlow.add(l.to.node);
        });

        // العُقد المستهلَكة كأجسام (then/else/body) ليست جذوراً للبرنامج الرئيسي
        const bodyTargets = new Set();
        Object.entries(ctx.flowFrom).forEach(([key, toId]) => {
            const port = key.split(":")[1];
            if (port === "then" || port === "else" || port === "body") bodyTargets.add(toId);
        });

        const roots = graph.nodes.filter(n => {
            const def = NODE_LIBRARY[n.type];
            if (!def) return false; // عقدة مفقودة (نوع غير معرَّف) — نتجاهلها
            const hasFlowOut = def.outputs.some(p => p.dataType === "flow");
            const hasFlowIn = def.inputs.some(p => p.dataType === "flow");
            // جذر = عقدة تنفيذية غير مستقبِلة تدفّقاً وغير مستهلَكة كجسم
            const isExecutable = hasFlowOut || hasFlowIn;
            return isExecutable && !hasIncomingFlow.has(n.id) && !bodyTargets.has(n.id);
        });

        roots.sort((a, b) => (a.y - b.y) || (a.x - b.x));
        return roots;
    }

    /* =============================================================
       الواجهة العامة: generate()
       ============================================================= */

    function generate(graph) {
        resetReservedRenames(); // نبدأ سجلّ الأسماء المحجوزة من الصفر لكل توليد
        if (!graph || graph.nodes.length === 0) {
            return "# لوحة فارغة — اسحب عُقداً وابدأ البناء\n";
        }

        const ctx = buildIndex(graph);
        const imports = new Set();
        const body = [];
        const visited = new Set();

        const roots = findFlowRoots(ctx, graph);

        if (roots.length === 0) {
            // لا سلسلة تدفّق واضحة: نولّد العُقد التنفيذية بترتيبها الرأسي
            const execNodes = [...graph.nodes]
                .filter(n => n.type !== "logic_op")
                .sort((a, b) => (a.y - b.y) || (a.x - b.x));
            execNodes.forEach(n => {
                if (visited.has(n.id)) return;
                walkFlow(ctx, n.id, 0, body, imports, visited);
            });
        } else {
            roots.forEach((root, i) => {
                if (i > 0) body.push(""); // فصل بين السلاسل
                walkFlow(ctx, root.id, 0, body, imports, visited);
            });
        }

        // تعريفات الدوال المخصصة (تُجمع من أنواع العُقد المستخدمة في المخطط)
        const customFuncDefs = [];
        const seenCustomTypes = new Set();
        graph.nodes.forEach(n => {
            const def = NODE_LIBRARY[n.type];
            if (def && def._isCustom && !seenCustomTypes.has(n.type)) {
                seenCustomTypes.add(n.type);
                const params  = def.inputs.filter(p => p.dataType !== "flow").map(p => p.label);
                const returns = def.outputs.filter(p => p.dataType !== "flow").map(p => p.label);
                customFuncDefs.push(`def ${def.type}(${params.join(", ")}):`);
                // تضمين الكود — إضافة مسافة بادئة لكل سطر
                const codeBody = (def._code || "").trimEnd();
                if (codeBody) {
                    codeBody.split("\n").forEach(ln => customFuncDefs.push(`    ${ln}`));
                }
                // إضافة return تلقائي إن لم يكتبه المستخدم
                const hasReturn = codeBody.split("\n").some(ln => ln.trimStart().startsWith("return"));
                if (returns.length > 0 && !hasReturn) {
                    customFuncDefs.push(`    return ${returns.join(", ")}`);
                } else if (codeBody === "") {
                    customFuncDefs.push(`    pass`);
                }
                customFuncDefs.push(""); // سطر فارغ
                customFuncDefs.push(""); // سطران (PEP 8)
            }
        });

        // تجميع الرأس (imports) وفق PEP 8
        const header = [];
        const sortedImports = [...imports].sort();
        if (sortedImports.length) {
            header.push(...sortedImports, "");
        }

        const code = [...header, ...customFuncDefs, ...body].join("\n").replace(/\n{3,}/g, "\n\n");
        return code.trimEnd() + "\n";
    }

    return { generate, sanitizeName, getReservedRenames, PY_KEYWORDS };
})();

/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   parser.js  —  محلّل بايثون العكسي (Python → Nodes)
   ---------------------------------------------------------------------
   يحوّل كوداً بايثونياً نصّياً إلى بنية { nodes, links } يعيد Graph بناءها.

   الفلسفة (كما في محرّرات الكتل الحقيقية مثل Blockly):
   ----------------------------------------------------
   - ندعم مجموعة فرعية عملية وواضحة من بايثون تُغطّي عُقدنا:
       import ...
       name = input("...")
       name = "..."   |  name = 123  |  name = True/False
       name = [ ... ] |  name = { ... }
       name = <تعبير حسابي>
       print(...)
       random.*, time.*
       if <cond>:  / else:
       for i in range(n):
       while <cond>:
       break / continue
   - كل سطر يُحوَّل إلى عقدة، والمسافة البادئة (indentation) تحدّد
     التداخل (أجسام if/for/while) فتُبنى روابط "الجسم" (then/body).
   - التسلسل الرأسي داخل نفس المستوى يُبنى كروابط flow متتابعة.
   - إن تعذّر فهم سطر (خارج القدرة)، لا ننهار: نُرجع { ok:false, error }
     مع رقم السطر، ويُبقي app.js آخر حالة مستقرة.

   الإخراج لا يفقد التخطيط: نوزّع العُقد تلقائياً على شكل شجرة أنيقة.
   ===================================================================== */

const Parser = (() => {

    let seq = 1;
    const nid = () => `node_p${(seq++).toString(36)}${Date.now().toString(36).slice(-3)}`;
    const lid = () => `link_p${(seq++).toString(36)}${Date.now().toString(36).slice(-3)}`;

    /* ---------- أدوات ---------- */

    const countIndent = (line) => (line.match(/^ */)[0].length);

    /** unquote — إزالة علامات الاقتباس من سلسلة */
    function unquote(s) {
        s = s.trim();
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            return s.slice(1, -1);
        }
        return s;
    }

    const isNumber = (s) => /^-?\d+(\.\d+)?$/.test(s.trim());
    const isString = (s) => /^(['"]).*\1$/.test(s.trim());

    /* =============================================================
       المرحلة 1: بناء شجرة أسطر (مع التداخل حسب المسافة البادئة)
       كل عنصر: { type, data, indent, children:[] }
       ============================================================= */

    function classifyLine(rawLine, lineNo) {
        const line = rawLine.trim();

        // import
        if (/^import\s+/.test(line) || /^from\s+/.test(line)) {
            return { kind: "import", raw: line };
        }

        // print(...)
        let m = line.match(/^print\s*\((.*)\)$/s);
        if (m) {
            const inner = m[1].trim();
            // نص ثابت فقط؟
            if (isString(inner)) return { kind: "node", type: "print", data: { text: unquote(inner) }, valueRef: null };
            return { kind: "node", type: "print", data: { text: "" }, valueRef: inner };
        }

        // if / elif
        m = line.match(/^if\s+(.+):$/);
        if (m) return { kind: "block", type: "if", cond: m[1].trim() };
        m = line.match(/^elif\s+(.+):$/);
        if (m) return { kind: "block", type: "elif", cond: m[1].trim() };

        // else
        if (/^else\s*:$/.test(line)) return { kind: "block", type: "else" };

        // for i in range(n):
        m = line.match(/^for\s+(\w+)\s+in\s+range\s*\((.+)\)\s*:$/);
        if (m) return { kind: "block", type: "for", var: m[1], count: m[2].trim() };

        // while cond:
        m = line.match(/^while\s+(.+):$/);
        if (m) return { kind: "block", type: "while", cond: m[1].trim() };

        // break / continue
        if (line === "break") return { kind: "node", type: "loop_control", data: { kind: "break" } };
        if (line === "continue") return { kind: "node", type: "loop_control", data: { kind: "continue" } };

        // with open(...) as f: — نتعامل معها ككتلة قراءة/كتابة مبسّطة (تخطّي في MVP)
        m = line.match(/^with\s+open\s*\((.+)\)\s+as\s+\w+\s*:$/);
        if (m) return { kind: "block", type: "with_open", args: m[1] };

        // إسناد: name = expr
        m = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
        if (m) {
            const name = m[1];
            const rhs = m[2].trim();

            // input(...)
            let im = rhs.match(/^input\s*\((.*)\)$/);
            if (im) return { kind: "node", type: "input", data: { var: name, prompt: unquote(im[1] || "") } };

            // random.*
            im = rhs.match(/^random\.(\w+)\s*\((.*)\)$/);
            if (im) return { kind: "node", type: "lib_random", data: { var: name, func: im[1], args: im[2].trim() } };

            // time.time()
            im = rhs.match(/^time\.time\s*\(\s*\)$/);
            if (im) return { kind: "node", type: "lib_time", data: { var: name, func: "time", args: "" } };

            // list
            if (rhs.startsWith("[") && rhs.endsWith("]")) {
                return { kind: "node", type: "var_list", data: { name, value: rhs.slice(1, -1).trim() } };
            }
            // dict
            if (rhs.startsWith("{") && rhs.endsWith("}")) {
                return { kind: "node", type: "var_dict", data: { name, value: rhs.slice(1, -1).trim() } };
            }
            // bool
            if (rhs === "True" || rhs === "False") {
                return { kind: "node", type: "var_bool", data: { name, value: rhs } };
            }
            // string
            if (isString(rhs)) {
                return { kind: "node", type: "var_string", data: { name, value: unquote(rhs) } };
            }
            // number
            if (isNumber(rhs)) {
                return { kind: "node", type: "var_number", data: { name, value: rhs } };
            }
            // تعبير حسابي عام
            return { kind: "node", type: "var_expr", data: { name, expr: rhs } };
        }

        // time.sleep(...)
        m = line.match(/^time\.sleep\s*\((.*)\)$/);
        if (m) return { kind: "node", type: "lib_time", data: { func: "sleep", args: m[1].trim(), var: "now" } };

        // window.* / tk.* / mainloop — نتجاهلها بلطف (جزء من عقدة tkinter)
        if (/^(window|tk)\b/.test(line) || line === "" ) return { kind: "ignore" };
        if (/\.write\(|\.read\(|\.pack\(|\.title\(/.test(line)) return { kind: "ignore" };
        if (/^f\.|^pass$/.test(line)) return { kind: "ignore" };

        // سطر غير مفهوم
        return { kind: "unknown", raw: line, lineNo };
    }

    /* =============================================================
       المرحلة 2: تحويل الأسطر إلى عُقد وروابط
       نستخدم "مكدّس" (stack) لتتبّع المستوى الحالي وربط flow/body.
       ============================================================= */

    function parse(code) {
        const rawLines = code.replace(/\r\n/g, "\n").split("\n");

        const nodes = [];
        const links = [];
        const imports = [];

        /* مكدّس المستويات: كل عنصر يمثّل كتلة مفتوحة
           { indent, node, kind, prevChildId, branch } */
        const stack = [{ indent: -1, node: null, prevChildId: null, branch: "root" }];

        // تخطيط: عمود لكل عمق
        const layout = { colY: {} };

        function place(depth) {
            const x = 60 + depth * 300;
            const y = (layout.colY[depth] || 0);
            layout.colY[depth] = y + 150;
            // نضمن أن العمق الأعمق لا يبدأ فوق الأب
            return { x, y: 60 + y };
        }

        function pushNode(type, data, depth) {
            const pos = place(depth);
            const node = { id: nid(), type, x: pos.x, y: pos.y, title: NODE_LIBRARY[type].title, data: {} };
            const def = NODE_LIBRARY[type];
            (def.fields || []).forEach(f => { node.data[f.key] = (data && data[f.key] != null) ? data[f.key] : f.default; });
            nodes.push(node);
            return node;
        }

        function linkFlow(fromNode, fromPort, toNode) {
            links.push({ id: lid(), from: { node: fromNode.id, port: fromPort }, to: { node: toNode.id, port: "flow_in" } });
        }

        try {
            for (let i = 0; i < rawLines.length; i++) {
                const raw = rawLines[i];
                if (raw.trim() === "") continue;
                if (raw.trim().startsWith("#")) continue;

                const indent = countIndent(raw);
                const info = classifyLine(raw, i + 1);

                if (info.kind === "unknown") {
                    return { ok: false, error: `تعذّر تحليل السطر ${i + 1}: «${info.raw}»`, line: i + 1 };
                }
                if (info.kind === "ignore") continue;
                if (info.kind === "import") { imports.push(info.raw); continue; }

                // أغلق الكتل التي انتهى تداخلها
                while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
                    stack.pop();
                }
                const parent = stack[stack.length - 1];
                const depth = stack.length - 1;

                if (info.kind === "block") {
                    /* -------- else / elif --------
                       التنفيذ المنطقي الصحيح:  elif  ≡  else: if
                       لذا:
                       - else  : نرقّي عقدة if المطابقة إلى if_else، ونفتح فرع else مباشرةً.
                       - elif  : نرقّي عقدة if المطابقة إلى if_else، ثم نُنشئ عقدة if_simple
                                 *متداخلة* داخل فرع else، ونفتح فرع then الخاص بها.
                                 كل elif إضافي يتداخل داخل else السابق (سلسلة صحيحة، بلا ضياع منطق).
                    */
                    if (info.type === "else" || info.type === "elif") {
                        const ifNode = parent.lastIfNode;
                        if (!ifNode) {
                            return { ok: false, error: `«${info.type}» بلا «if» مطابق عند السطر ${i + 1}`, line: i + 1 };
                        }
                        // رقّي if إلى if_else (لإتاحة منفذ else)
                        if (ifNode.type !== "if_else") {
                            ifNode.type = "if_else";
                            ifNode.title = NODE_LIBRARY.if_else.title;
                        }

                        if (info.type === "else") {
                            // فرع else مباشر
                            stack.push({ indent, node: ifNode, prevChildId: null, branch: "else", isBranch: true });
                        } else {
                            // elif → عقدة if_simple جديدة داخل فرع else
                            const nested = pushNode("if_simple", { expr: info.cond }, depth + 1);
                            // اربطها من منفذ else للعقدة الأم
                            links.push({
                                id: lid(),
                                from: { node: ifNode.id, port: "else" },
                                to: { node: nested.id, port: "flow_in" }
                            });
                            // افتح فرع then للعقدة المتداخلة، وسجّلها كـ lastIfNode
                            // كي يلتقطها else/elif التالي فيتداخل داخلها بشكل صحيح.
                            const frame = { indent, node: nested, prevChildId: null, branch: "then", isBlock: true };
                            frame.lastIfNode = nested;
                            stack.push(frame);
                        }
                        continue;
                    }

                    let type, data = {};
                    if (info.type === "if")    { type = "if_simple"; data = { expr: info.cond }; }
                    else if (info.type === "for")   { type = "loop_for"; data = { var: info.var, count: info.count }; }
                    else if (info.type === "while") { type = "loop_while"; data = { expr: info.cond }; }
                    else if (info.type === "with_open") { continue; } // مبسّط: نتجاهل الغلاف

                    const node = pushNode(type, data, depth);

                    // اربط تسلسل التدفّق مع الأخ السابق أو والده
                    connectSequential(parent, node, links, lid);

                    if (type === "if_simple") parent.lastIfNode = node;

                    // ادفع الكتلة الجديدة
                    const branch = (type === "if_simple") ? "then" : "body";
                    stack.push({ indent, node, prevChildId: null, branch, isBlock: true });
                    parent.prevChildId = node.id; // آخر عقدة في المستوى الأب

                } else if (info.kind === "node") {
                    const node = pushNode(info.type, info.data, depth);
                    connectSequential(parent, node, links, lid);
                    parent.prevChildId = node.id;
                    parent.lastNode = node;
                }
            }

            // بناء روابط القيمة الأساسية (print value, var_expr) بشكل best-effort
            resolveValueLinks(nodes, links);

            return { ok: true, nodes, links, imports };

        } catch (err) {
            return { ok: false, error: "خطأ غير متوقع أثناء التحليل: " + err.message, line: 0 };
        }
    }

    /**
     * connectSequential — يربط عقدة جديدة ضمن كتلة/مستوى:
     * - إن كانت أول عقدة في الكتلة: تُربط من منفذ الجسم/الفرع للأب.
     * - وإلا: تُربط من flow_out للعقدة السابقة في نفس المستوى.
     */
    function connectSequential(parent, node, links, lidFn) {
        if (parent.prevChildId) {
            links.push({
                id: lidFn(),
                from: { node: parent.prevChildId, port: "flow_out" },
                to: { node: node.id, port: "flow_in" }
            });
        } else if (parent.node) {
            // أول عقدة داخل كتلة: من منفذ الفرع (then/else/body)
            const port = parent.branch === "then" ? "then"
                       : parent.branch === "else" ? "else"
                       : parent.branch === "body" ? "body" : "flow_out";
            links.push({
                id: lidFn(),
                from: { node: parent.node.id, port },
                to: { node: node.id, port: "flow_in" }
            });
        }
        // (إن كان root وبلا prevChildId فهي عقدة جذر — بلا رابط وارد)
    }

    /**
     * resolveValueLinks — يربط قيماً بسيطة:
     * إن كان print يشير valueRef إلى اسم متغير أنتجته عقدة سابقة،
     * نبني رابط قيمة من مخرج تلك العقدة إلى مدخل print.value.
     */
    function resolveValueLinks(nodes, links) {
        // خريطة: اسم المتغير -> آخر عقدة أنتجته
        const producers = {};
        const producerPort = {};
        nodes.forEach(n => {
            const d = n.data;
            const nm = ({
                input: d.var, file_read: d.var, lib_random: d.var,
                var_string: d.name, var_number: d.name, var_bool: d.name,
                var_list: d.name, var_dict: d.name, var_expr: d.name
            })[n.type];
            if (nm) {
                producers[nm] = n;
                producerPort[nm] = (n.type === "file_read") ? "content" : "value";
            }
        });

        nodes.forEach(n => {
            if (n.type === "print" && (!n.data.text || n.data.text === "") && n._valueRef) {
                const ref = n._valueRef.trim();
                if (producers[ref]) {
                    links.push({
                        id: lid(),
                        from: { node: producers[ref].id, port: producerPort[ref] },
                        to: { node: n.id, port: "value" }
                    });
                }
            }
        });
    }

    /* ---------- نقطة الدخول العامة ----------
       نمرّر valueRef عبر خاصية مؤقتة على العقدة لربط القيم لاحقاً. */
    function parseWithValueRefs(code) {
        // نعيد التحليل مع تمرير valueRef إلى العُقد
        const rawLines = code.replace(/\r\n/g, "\n").split("\n");
        // نستخدم parse ثم نلحق valueRef يدوياً عبر إعادة مطابقة print
        const result = parse(code);
        if (!result.ok) return result;

        // ألصق _valueRef بعُقد print المطابقة
        let idx = 0;
        const printRefs = [];
        rawLines.forEach(l => {
            const t = l.trim();
            const m = t.match(/^print\s*\((.*)\)$/s);
            if (m) {
                const inner = m[1].trim();
                printRefs.push(isString(inner) ? null : inner);
            }
        });
        result.nodes.filter(n => n.type === "print").forEach((n, i) => {
            n._valueRef = printRefs[i] || null;
        });
        resolveValueLinks(result.nodes, result.links);
        // تنظيف الخصائص المؤقتة
        result.nodes.forEach(n => { delete n._valueRef; });
        return result;
    }

    return { parse: parseWithValueRefs };
})();

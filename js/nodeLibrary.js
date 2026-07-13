/**
 * @file G-Nodes 1.0
 * @author Taha Al-Ghurairi (Ghain Studio)
 * @copyright © 2026 Taha Al-Ghurairi. All rights reserved.
 * @license Custom Source-Available License. Modification, renaming, and unauthorized redistribution are strictly prohibited.
 */
/* =====================================================================
   nodeLibrary.js  (الإصدار 2 — مكتبة موسّعة لبناء مشاريع بايثون حقيقية)
   ---------------------------------------------------------------------
   كل نوع عقدة يُعرّف كـ:
   {
     type, title, subtitle, icon, color, category,
     inputs:  [ { id, label, dataType } ],   // منافذ يسار
     outputs: [ { id, label, dataType } ],   // منافذ يمين
     fields:  [ { key, label, kind, placeholder, default, options? } ],
     codeHint: وصف مختصر لسلوك الترجمة (توثيقي)
   }

   dataType للمنافذ يُستخدم في "الحماية المنطقية" (منع ربط غير المتوافق):
     - "flow"  : تدفّق تنفيذ (تسلسل الأوامر) — يُربط flow↔flow فقط
     - "any"   : أي قيمة
     - "number"| "string" | "bool" | "list" | "dict"
   قاعدة التوافق: نفس النوع، أو أحد الطرفين "any"، وflow يُربط flow فقط.

   kind للحقول: "text" | "number" | "select" | "textarea" | "checkbox"
   ===================================================================== */

/* ألوان الفئات (تُستخدم في CSS عبر متغيّر --type-color) */
const CATEGORY_COLORS = {
    io:        "var(--cat-io)",
    variable:  "var(--cat-var)",
    logic:     "var(--cat-logic)",
    loop:      "var(--cat-loop)",
    library:   "var(--cat-lib)",
    custom:    "var(--cat-custom)"
};

const NODE_LIBRARY = {

    /* =============================================================
       (أ) الإدخال والإخراج — I/O
       ============================================================= */

    input: {
        type: "input", title: "إدخال نصّي", subtitle: "input()",
        icon: "fa-solid fa-keyboard", category: "io", color: CATEGORY_COLORS.io,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قيمة", dataType: "string" }
        ],
        fields: [
            { key: "var", label: "اسم المتغير", kind: "text", placeholder: "name", default: "name" },
            { key: "prompt", label: "الرسالة", kind: "text", placeholder: "Enter value:", default: "أدخل قيمة: " }
        ],
        codeHint: 'var = input("prompt")'
    },

    print: {
        type: "print", title: "طباعة", subtitle: "print()",
        icon: "fa-solid fa-print", category: "io", color: CATEGORY_COLORS.io,
        inputs:  [
            { id: "flow_in", label: "", dataType: "flow" },
            { id: "value", label: "القيمة", dataType: "any" }
        ],
        outputs: [{ id: "flow_out", label: "", dataType: "flow" }],
        fields: [
            { key: "text", label: "نص ثابت (اختياري)", kind: "text", placeholder: "أو اترك فارغاً لطباعة المدخل", default: "" }
        ],
        codeHint: 'print(value)'
    },

    file_read: {
        type: "file_read", title: "قراءة ملف", subtitle: "open().read()",
        icon: "fa-solid fa-file-import", category: "io", color: CATEGORY_COLORS.io,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "content", label: "المحتوى", dataType: "string" }
        ],
        fields: [
            { key: "var", label: "اسم المتغير", kind: "text", placeholder: "content", default: "content" },
            { key: "path", label: "مسار الملف", kind: "text", placeholder: "data.txt", default: "data.txt" }
        ],
        codeHint: 'with open(path) as f: var = f.read()'
    },

    file_write: {
        type: "file_write", title: "كتابة ملف", subtitle: "open().write()",
        icon: "fa-solid fa-file-export", category: "io", color: CATEGORY_COLORS.io,
        inputs:  [
            { id: "flow_in", label: "", dataType: "flow" },
            { id: "data", label: "البيانات", dataType: "any" }
        ],
        outputs: [{ id: "flow_out", label: "", dataType: "flow" }],
        fields: [
            { key: "path", label: "مسار الملف", kind: "text", placeholder: "output.txt", default: "output.txt" },
            { key: "text", label: "نص ثابت (إن لم يُربط مدخل)", kind: "text", placeholder: "Hello", default: "" }
        ],
        codeHint: 'with open(path, "w") as f: f.write(data)'
    },

    /* =============================================================
       (ب) المتغيرات وأنواع البيانات
       ============================================================= */

    var_string: {
        type: "var_string", title: "نص (String)", subtitle: "str",
        icon: "fa-solid fa-quote-right", category: "variable", color: CATEGORY_COLORS.variable,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قيمة", dataType: "string" }
        ],
        fields: [
            { key: "name", label: "الاسم", kind: "text", placeholder: "text", default: "text" },
            { key: "value", label: "القيمة", kind: "text", placeholder: "Hello World", default: "Hello" }
        ],
        codeHint: 'name = "value"'
    },

    var_number: {
        type: "var_number", title: "رقم (Number)", subtitle: "int / float",
        icon: "fa-solid fa-hashtag", category: "variable", color: CATEGORY_COLORS.variable,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قيمة", dataType: "number" }
        ],
        fields: [
            { key: "name", label: "الاسم", kind: "text", placeholder: "x", default: "x" },
            { key: "value", label: "القيمة", kind: "number", placeholder: "0", default: "0" }
        ],
        codeHint: 'name = value'
    },

    var_bool: {
        type: "var_bool", title: "منطقي (Boolean)", subtitle: "True / False",
        icon: "fa-solid fa-toggle-on", category: "variable", color: CATEGORY_COLORS.variable,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قيمة", dataType: "bool" }
        ],
        fields: [
            { key: "name", label: "الاسم", kind: "text", placeholder: "flag", default: "flag" },
            { key: "value", label: "القيمة", kind: "select", default: "True", options: ["True", "False"] }
        ],
        codeHint: 'name = True/False'
    },

    var_list: {
        type: "var_list", title: "قائمة (List)", subtitle: "[]",
        icon: "fa-solid fa-list-ul", category: "variable", color: CATEGORY_COLORS.variable,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قائمة", dataType: "list" }
        ],
        fields: [
            { key: "name", label: "الاسم", kind: "text", placeholder: "items", default: "items" },
            { key: "value", label: "العناصر", kind: "text", placeholder: "1, 2, 3", default: "1, 2, 3" }
        ],
        codeHint: 'name = [items]'
    },

    var_dict: {
        type: "var_dict", title: "قاموس (Dict)", subtitle: "{}",
        icon: "fa-solid fa-book", category: "variable", color: CATEGORY_COLORS.variable,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قاموس", dataType: "dict" }
        ],
        fields: [
            { key: "name", label: "الاسم", kind: "text", placeholder: "data", default: "data" },
            { key: "value", label: "الأزواج", kind: "text", placeholder: '"a": 1, "b": 2', default: '"key": "value"' }
        ],
        codeHint: 'name = {pairs}'
    },

    var_expr: {
        type: "var_expr", title: "تعبير حسابي", subtitle: "= expression",
        icon: "fa-solid fa-calculator", category: "variable", color: CATEGORY_COLORS.variable,
        inputs:  [
            { id: "flow_in", label: "", dataType: "flow" },
            { id: "a", label: "أ", dataType: "any" },
            { id: "b", label: "ب", dataType: "any" }
        ],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "الناتج", dataType: "number" }
        ],
        fields: [
            { key: "name", label: "الاسم", kind: "text", placeholder: "result", default: "result" },
            { key: "expr", label: "التعبير (استخدم a وb)", kind: "text", placeholder: "a + b", default: "a + b" }
        ],
        codeHint: 'name = expr'
    },

    /* =============================================================
       (ج) الشروط — Logic
       ============================================================= */

    if_simple: {
        type: "if_simple", title: "شرط بسيط (if)", subtitle: "if:",
        icon: "fa-solid fa-code-branch", category: "logic", color: CATEGORY_COLORS.logic,
        inputs:  [
            { id: "flow_in", label: "", dataType: "flow" },
            { id: "cond", label: "الشرط", dataType: "bool" }
        ],
        outputs: [
            { id: "flow_out", label: "بعد", dataType: "flow" },
            { id: "then", label: "إذا صحّ", dataType: "flow" }
        ],
        fields: [
            { key: "expr", label: "الشرط (إن لم يُربط)", kind: "text", placeholder: "x > 0", default: "x > 0" }
        ],
        codeHint: 'if expr:'
    },

    if_else: {
        type: "if_else", title: "شرط ممتد (if/else)", subtitle: "if/else",
        icon: "fa-solid fa-shuffle", category: "logic", color: CATEGORY_COLORS.logic,
        inputs:  [
            { id: "flow_in", label: "", dataType: "flow" },
            { id: "cond", label: "الشرط", dataType: "bool" }
        ],
        outputs: [
            { id: "flow_out", label: "بعد", dataType: "flow" },
            { id: "then", label: "صحيح ✓", dataType: "flow" },
            { id: "else", label: "خطأ ✗", dataType: "flow" }
        ],
        fields: [
            { key: "expr", label: "الشرط (إن لم يُربط)", kind: "text", placeholder: "x > 0", default: "x > 0" }
        ],
        codeHint: 'if expr: ... else: ...'
    },

    logic_op: {
        type: "logic_op", title: "عملية منطقية", subtitle: "and / or / not",
        icon: "fa-solid fa-diagram-successor", category: "logic", color: CATEGORY_COLORS.logic,
        inputs:  [
            { id: "a", label: "أ", dataType: "any" },
            { id: "b", label: "ب", dataType: "any" }
        ],
        outputs: [{ id: "value", label: "نتيجة", dataType: "bool" }],
        fields: [
            { key: "op", label: "العامل", kind: "select", default: "and", options: ["and", "or", "not"] },
            { key: "expr", label: "تعبير مخصّص (اختياري)", kind: "text", placeholder: "a and b", default: "" }
        ],
        codeHint: '(a op b)'
    },

    /* =============================================================
       (د) الحلقات — Loops
       ============================================================= */

    loop_for: {
        type: "loop_for", title: "حلقة for", subtitle: "for i in range()",
        icon: "fa-solid fa-rotate-right", category: "loop", color: CATEGORY_COLORS.loop,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "بعد", dataType: "flow" },
            { id: "body", label: "الجسم", dataType: "flow" },
            { id: "index", label: "العدّاد", dataType: "number" }
        ],
        fields: [
            { key: "var", label: "العدّاد", kind: "text", placeholder: "i", default: "i" },
            { key: "count", label: "عدد التكرار (range)", kind: "text", placeholder: "10", default: "10" }
        ],
        codeHint: 'for var in range(count):'
    },

    loop_while: {
        type: "loop_while", title: "حلقة while", subtitle: "while:",
        icon: "fa-solid fa-arrows-rotate", category: "loop", color: CATEGORY_COLORS.loop,
        inputs:  [
            { id: "flow_in", label: "", dataType: "flow" },
            { id: "cond", label: "الشرط", dataType: "bool" }
        ],
        outputs: [
            { id: "flow_out", label: "بعد", dataType: "flow" },
            { id: "body", label: "الجسم", dataType: "flow" }
        ],
        fields: [
            { key: "expr", label: "الشرط (إن لم يُربط)", kind: "text", placeholder: "i < 10", default: "True" }
        ],
        codeHint: 'while expr:'
    },

    loop_control: {
        type: "loop_control", title: "تحكّم بالحلقة", subtitle: "break / continue",
        icon: "fa-solid fa-ban", category: "loop", color: CATEGORY_COLORS.loop,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [],
        fields: [
            { key: "kind", label: "النوع", kind: "select", default: "break", options: ["break", "continue"] }
        ],
        codeHint: 'break / continue'
    },

    /* =============================================================
       (هـ) المكتبات القياسية — Standard Libraries
       ============================================================= */

    lib_random: {
        type: "lib_random", title: "عدد عشوائي", subtitle: "random",
        icon: "fa-solid fa-dice", category: "library", color: CATEGORY_COLORS.library,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قيمة", dataType: "number" }
        ],
        fields: [
            { key: "var", label: "اسم المتغير", kind: "text", placeholder: "r", default: "r" },
            { key: "func", label: "الدالة", kind: "select", default: "randint", options: ["randint", "random", "choice"] },
            { key: "args", label: "المعاملات", kind: "text", placeholder: "1, 100", default: "1, 100" }
        ],
        codeHint: 'import random; var = random.func(args)'
    },

    lib_time: {
        type: "lib_time", title: "الوقت", subtitle: "time",
        icon: "fa-solid fa-clock", category: "library", color: CATEGORY_COLORS.library,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [
            { id: "flow_out", label: "", dataType: "flow" },
            { id: "value", label: "قيمة", dataType: "number" }
        ],
        fields: [
            { key: "func", label: "الدالة", kind: "select", default: "sleep", options: ["sleep", "time"] },
            { key: "args", label: "المعاملات", kind: "text", placeholder: "1", default: "1" },
            { key: "var", label: "متغير الناتج (لـ time)", kind: "text", placeholder: "now", default: "now" }
        ],
        codeHint: 'import time; time.func(args)'
    },

    lib_tkinter: {
        type: "lib_tkinter", title: "نافذة رسومية", subtitle: "tkinter",
        icon: "fa-solid fa-window-maximize", category: "library", color: CATEGORY_COLORS.library,
        inputs:  [{ id: "flow_in", label: "", dataType: "flow" }],
        outputs: [{ id: "flow_out", label: "", dataType: "flow" }],
        fields: [
            { key: "title", label: "عنوان النافذة", kind: "text", placeholder: "My App", default: "My App" },
            { key: "label", label: "نص التسمية", kind: "text", placeholder: "Hello!", default: "Hello!" }
        ],
        codeHint: 'import tkinter; window = ...; window.mainloop()'
    }
};

/* الفئات والترتيب في الشريط الجانبي */
const NODE_CATEGORIES = [
    { id: "io",       label: "الإدخال والإخراج", icon: "fa-solid fa-arrows-left-right-to-line",
      types: ["input", "print", "file_read", "file_write"] },
    { id: "variable", label: "المتغيرات والبيانات", icon: "fa-solid fa-database",
      types: ["var_string", "var_number", "var_bool", "var_list", "var_dict", "var_expr"] },
    { id: "logic",    label: "الشروط والمنطق", icon: "fa-solid fa-code-branch",
      types: ["if_simple", "if_else", "logic_op"] },
    { id: "loop",     label: "الحلقات والتكرار", icon: "fa-solid fa-repeat",
      types: ["loop_for", "loop_while", "loop_control"] },
    { id: "library",  label: "المكتبات القياسية", icon: "fa-solid fa-cubes-stacked",
      types: ["lib_random", "lib_time", "lib_tkinter"] }
];

/* قائمة مسطّحة بالترتيب (تُستخدم في الإحصائيات والتوافق) */
const NODE_LIBRARY_ORDER = NODE_CATEGORIES.flatMap(c => c.types);

/* ---------------------------------------------------------------------
   أدوات مساعدة على مستوى المكتبة
   --------------------------------------------------------------------- */

/** getPortDef — إرجاع تعريف منفذ (in/out) لعقدة حسب النوع */
function getPortDef(nodeType, portId, dir) {
    const def = NODE_LIBRARY[nodeType];
    if (!def) return null;
    const list = dir === "out" ? def.outputs : def.inputs;
    return list.find(p => p.id === portId) || null;
}

/** arePortsCompatible — قاعدة التوافق بين مخرج ومدخل */
function arePortsCompatible(fromType, fromPort, toType, toPort) {
    const a = getPortDef(fromType, fromPort, "out");
    const b = getPortDef(toType, toPort, "in");
    if (!a || !b) return false;
    // flow يُربط flow فقط، والعكس صحيح
    if (a.dataType === "flow" || b.dataType === "flow") {
        return a.dataType === "flow" && b.dataType === "flow";
    }
    // القيم: any تتوافق مع الكل
    if (a.dataType === "any" || b.dataType === "any") return true;
    return a.dataType === b.dataType;
}

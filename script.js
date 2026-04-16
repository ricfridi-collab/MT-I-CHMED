/* 
   HUNTER MATH - SECURE ACTIVATION SYSTEM (TESTING MODE)
*/

// =========================================
// 0. توليد بصمة الجهاز (Device Fingerprint)
// =========================================
function getDeviceFingerprint() {
    const info = navigator.userAgent + screen.width + screen.height + navigator.language;
    return btoa(info).slice(0, 30);
}

// =========================================
// 1. إعدادات النظام
// =========================================
const API_URL = "https://sheetdb.io/api/v1/gzz06yk54isus";
const LOCAL_STORAGE_KEY = "hunter_math_activated_codes";
const ADMIN_CODES = ["ADMIN-001", "ADMIN-002"]; 

const cleanString = (str) => str ? str.replace(/\s+/g, '').trim() : '';

// =========================================
// 2. تهيئة النظام
// =========================================
window.addEventListener('DOMContentLoaded', () => {
    
    // =========================================
    // وضع التجربة: هذا السطر يمسح التفعيل في كل مرة لتظهر الشاشة
    // عند الانتهاء من التجربة، قم بحذف هذا السطر فقط
    // =========================================
    localStorage.removeItem(LOCAL_STORAGE_KEY);

    const screen = document.getElementById('activation-screen');

    // التحقق من وجود تفعيل محلي سابق
    const isActivated = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (isActivated) {
        if(screen) screen.style.display = 'none';
    } else {
        if(screen) screen.style.display = 'flex';
    }

    const btn = document.getElementById('activate-btn');
    if (btn) btn.onclick = verifyCode;
});

// =========================================
// 3. منطق التحقق والتفعيل
// =========================================
function verifyCode() {
    const codeInput = document.getElementById('activation-code');
    const msgEl = document.getElementById('activation-msg');
    const btn = document.getElementById('activate-btn');
    const spinner = document.getElementById('spinner');

    if (!codeInput || !msgEl || !btn) {
        return;
    }

    const rawCode = codeInput.value;
    const inputCode = cleanString(rawCode); 

    if (!inputCode) {
        showFeedback(msgEl, "الرجاء إدخال الكود", "var(--danger)");
        return;
    }

    btn.disabled = true;
    btn.innerText = "جاري التحقق...";
    spinner.style.display = "block";
    showFeedback(msgEl, "جاري الاتصال بالسيرفر...", "#fff");

    // 1. التحقق من أكواد المسؤول (Admin)
    if (ADMIN_CODES.includes(inputCode)) {
        saveToLocal(inputCode);
        finishActivation(btn, spinner);
        grantAccess();
        return;
    }

    // 2. التحقق من الأكواد العادية
    checkCodeOnServer(inputCode, btn, msgEl, spinner);
}

// =========================================
// دالة البحث
// =========================================
function checkCodeOnServer(code, btn, msgEl, spinner) {
    const url = `${API_URL}/search?code=${encodeURIComponent(code)}`;
    
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error("NetworkError");
            return response.json();
        })
        .then(data => {
            if (!data || data.length === 0) throw new Error("NotFound");

            const entry = data[0];
            const currentDeviceID = getDeviceFingerprint();

            // المقارنة المرنة للأكواد
            const normalize = (str) => str ? str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
            if (normalize(entry.code) !== normalize(code)) {
                throw new Error("NotFound");
            }

            // --- منطق التحقق ---
            
            // الحالة 1: الكود جديد
            if (!entry.status || entry.status === "" || entry.status === null) {
                console.log("الكود جديد، جاري القفل على الجهاز...");
                lockCodeToDevice(code, currentDeviceID, btn, msgEl, spinner);
            } 
            // الحالة 2: الكود مستخدم
            else {
                if (entry.device_id === currentDeviceID) {
                    console.log("الكود مفعل على هذا الجهاز.");
                    saveToLocal(code);
                    finishActivation(btn, spinner);
                    grantAccess();
                } else {
                    console.error("الكود مستخدم على جهاز آخر.");
                    throw new Error("DifferentDevice");
                }
            }
        })
        .catch(error => {
            resetButton(btn, spinner);
            console.error("خطأ في التحقق:", error);
            
            if (error.message === "NotFound") {
                showFeedback(msgEl, "❌ الكود غير موجود! تأكد من الكتابة.", "var(--danger)");
            } else if (error.message === "DifferentDevice") {
                showFeedback(msgEl, "❌ هذا الكود مفعل مسبقاً على جهاز آخر!", "var(--danger)");
            } else if (error.message === "NetworkError") {
                showFeedback(msgEl, "⚠️ فشل الاتصال بالإنترنت.", "var(--danger)");
            } else {
                showFeedback(msgEl, "⚠️ خطأ غير معروف.", "var(--danger)");
            }
        });
}

// =========================================
// دالة القفل
// =========================================
function lockCodeToDevice(code, deviceID, btn, msgEl, spinner) {
    // ملاحظة: تأكد من إعداد عمود 'code' كمفتاح أساسي في SheetDB
    const url = `${API_URL}/code/${code}`; 
    
    console.log(`جاري تحديث الكود: ${url}`);

    fetch(url, {
        method: 'PATCH',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            data: { 
                "status": "active", 
                "device_id": deviceID 
            } 
        })
    })
    .then(res => {
        if (res.ok) {
            saveToLocal(code);
            finishActivation(btn, spinner);
            grantAccess();
        } else {
            throw new Error(`ServerResponse: ${res.status}`);
        }
    })
    .catch(err => {
        resetButton(btn, spinner);
        let errorMessage = "⚠️ فشل الاتصال أثناء القفل.";
        if (err.message.includes("404")) errorMessage = "❌ خطأ: تأكد من إعدادات SheetDB (Primary Key = code).";
        else if (err.message.includes("403")) errorMessage = "❌ خطأ صلاحيات!";
        
        showFeedback(msgEl, errorMessage, "var(--danger)");
        console.error("خطأ في القفل:", err);
    });
}

function showFeedback(el, text, color) {
    if(el) {
        el.innerText = text;
        el.style.color = color;
    }
}

function resetButton(btn, spinner) {
    btn.disabled = false;
    btn.innerText = "تفعيل";
    spinner.style.display = "none";
}

function finishActivation(btn, spinner) {
    const msgEl = document.getElementById('activation-msg');
    showFeedback(msgEl, "✅ تم التفعيل بنجاح", "var(--success)");
    btn.disabled = false;
    btn.innerText = "تم الدخول";
    spinner.style.display = "none";
}

function saveToLocal(code) {
    const history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    if (!history.includes(code)) {
        history.push(code);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
    }
}

function grantAccess() {
    setTimeout(() => {
        const screen = document.getElementById('activation-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => { screen.style.display = 'none'; },500);
        }
    }, 1000);
}

// =========================================
// 4. قواعد البيانات والأسئلة
// =========================================
const unit_01_DB = [
    { q: "PGCD(120, 48)", a: "24" }, { q: "هل العددان 15 و 28 أوليان فيما بينهما؟ (نعم/لا)", a: "نعم" },
    { q: "PGCD(150, 30)", a: "30" }, { q: "بسط الجذر √18", a: "3√2" },
    { q: "بسط الجذر √75", a: "5√3" }, { q: "احسب √144", a: "12" },
    { q: "احسب √0.25", a: "0.5" }, { q: "ما هو مقلوب العدد √2؟", a: "√2/2" },
    { q: "حل المعادلة x² = 25 (الحل الموجب)", a: "5" }, { q: "بسط العبارة: √2 × √8", a: "4" },
    { q: "العدد المربع الكامل بين 10 و 20 هو؟", a: "16" }, { q: "PGCD(13, 17)", a: "1" },
    { q: "بسط √20 + √45", a: "5√5" }, { q: "كتابة 7/√2 بمقام ناطق؟", a: "7√2/2" },
    { q: "ما هو ربع العدد √16؟", a: "1" }, { q: "قيمة x إذا كان x² = 0", a: "0" },
    { q: "PGCD(81, 27)", a: "27" }, { q: "بسط √8", a: "2√2" },
    { q: "احسب (√5)²", a: "5" }, { q: "هل √2 + √3 = √5؟ (نعم/لا)", a: "لا" },
    { q: "بسط √98", a: "7√2" }, { q: "احسب √121", a: "11" },
    { q: "PGCD(100, 25)", a: "25" }, { q: "بسط √300", a: "10√3" },
    { q: "هل √16 - √9 = √7؟ (نعم/لا)", a: "لا" }, { q: "ما هو العدد الذي جذره 13؟", a: "169" },
    { q: "احسب √1 + √0", a: "1" }, { q: "بسط √28", a: "2√7" },
    { q: "نطق مقام الكسر 1/√5", a: "√5/5" }, { q: "احسب (2√3)²", a: "12" },
    { q: "PGCD(14, 15)", a: "1" }, { q: "بسط √54", a: "3√6" },
    { q: "هل 0 عدد ناطق؟ (نعم/لا)", a: "نعم" }, { q: "جذر العدد 625 هو؟", a: "25" },
    { q: "بسط √108", a: "6√3" }, { q: "احسب √64 / √4", a: "4" },
    { q: "ما هو نصف √4؟", a: "1" }, { q: "PGCD(21, 14)", a: "7" },
    { q: "بسط √40", a: "2√10" }, { q: "هل π عدد ناطق؟ (نعم/لا)", a: "لا" },
    { q: "احسب √225", a: "15" }, { q: "بسط √160", a: "4√10" },
    { q: "قيمة x² إذا كان x=√7", a: "7" }, { q: "PGCD(45, 60)", a: "15" },
    { q: "بسط √24", a: "2√6" }, { q: "احسب √16 × √9", a: "12" },
    { q: "جذر 1.44 هو؟", a: "1.2" }, { q: "بسط √200", a: "10√2" },
    { q: "العدد x حيث x² = -4 (اكتب: لا يوجد)", a: "لا يوجد" }, { q: "احسب √10000", a: "100" },
    { q: "اكتب العدد 4500 على صورة جداء أعداد أولية", a: "2²×3²×5³" },
    { q: "بسط √12 × √3", a: "6" }, { q: "العدد 1/3 هو عدد...؟", a: "ناطق" },
    { q: "أكمل: 2√5 = √...", a: "20" }, { q: "احسب √50", a: "5√2" },
    { q: "هل العدد 17 أولي؟ (نعم/لا)", a: "نعم" }, { q: "قيمة √0.01", a: "0.1" },
    { q: "بسط √32", a: "4√2" }, { q: "مجموع مقامي العددين 1/2 و 1/3 هو؟", a: "6" },
    { q: "الجذور التربيعية للعدد 36 هي؟", a: "6 و -6" }, { q: "هل 2.5 عدد صحيح طبيعي؟ (نعم/لا)", a: "لا" },
    { q: "PGCD(26, 65)", a: "13" }, { q: "قيمة 3√2 × 2√2", a: "12" },
    { q: "بسط (√5+1)²", a: "6+2√5" }, { q: "احسب √(4/9)", a: "2/3" }
];

const unit_03_DB = [
    { q: "انشر: (x+3)²", a: "x²+6x+9" }, { q: "انشر: (x-5)²", a: "x²-10x+25" },
    { q: "حل المعادلة 3x = 12", a: "4" }, { q: "بسط: 5x + 2x - x", a: "6x" },
    { q: "انشر: (x-2)(x+2)", a: "x²-4" }, { q: "حل المعادلة x + 9 = 4", a: "-5" },
    { q: "حل: 2x - 1 = 7", a: "4" }, { q: "تحليل: x² + 2x", a: "x(x+2)" },
    { q: "انشر: 3(2x - 4)", a: "6x-12" }, { q: "حل: (x-1)(x+5) = 0 (الحل الموجب)", a: "1" },
    { q: "بسط: x × x", a: "x²" }, { q: "حل المعادلة: x/2 = 10", a: "20" },
    { q: "انشر: (2x+1)²", a: "4x²+4x+1" }, { q: "حل: 5x + 5 = 0", a: "-1" },
    { q: "تحليل: 3x + 6", a: "3(x+2)" }, { q: "حل المتراجحة 2x > 4 (اكتب: x>2)", a: "x>2" },
    { q: "بسط: -(x - 3)", a: "-x+3" }, { q: "قيمة 2x² من أجل x=3", a: "18" },
    { q: "حل المعادلة: 4x = 2", a: "0.5" }, { q: "انشر: (3-x)(3+x)", a: "9-x²" },
    { q: "حل: 10 - x = 7", a: "3" }, { q: "بسط: 2x + 3 + 4x - 1", a: "6x+2" },
    { q: "تحليل: x² - 16", a: "(x-4)(x+4)" }, { q: "حل: (2x-4)=0", a: "2" },
    { q: "قيمة x+y إذا كان x=1 و y=-1", a: "0" }, { q: "بسط: 3x - (2x + 1)", a: "x-1" },
    { q: "حل: 7x = 0", a: "0" }, { q: "انشر: (x+10)²", a: "x²+20x+100" },
    { q: "حل المعادلة: 2x + 2 = x + 5", a: "3" }, { q: "بسط: x² + x²", a: "2x²" },
    { q: "حل: x/3 = 1", a: "3" }, { q: "انشر: (x-1)(x+1)", a: "x²-1" },
    { q: "قيمة 5x من أجل x=0.2", a: "1" }, { q: "حل: -2x = 10", a: "-5" },
    { q: "تحليل: 5x² - 5x", a: "5x(x-1)" }, { q: "بسط: 10x - 12x", a: "-2x" },
    { q: "حل: x + x = 10", a: "5" }, { q: "انشر: 4x(x + 2)", a: "4x²+8x" },
    { q: "حل المعادلة: 1/x = 1", a: "1" }, { q: "بسط: (x+1) + (x-1)", a: "2x" },
    { q: "حل: 3x = 1", a: "1/3" }, { q: "انشر: (x-4)²", a: "x²-8x+16" },
    { q: "تحليل: x² - 1", a: "(x-1)(x+1)" }, { q: "حل: 2(x+1) = 6", a: "2" },
    { q: "بسط: 0x + 5", a: "5" }, { q: "حل المعادلة: x² = 0", a: "0" },
    { q: "انشر: (x+2)(x-3)", a: "x²-x-6" }, { q: "قيمة x²-1 من أجل x=1", a: "0" },
    { q: "حل: x - 5 = -5", a: "0" }, { q: "بسط: 4x² / 2x", a: "2x" },
    { q: "انشر: (2x-3)(x+4)", a: "2x²+5x-12" }, { q: "حل: x/5 = 5", a: "25" },
    { q: "قيمة 3x² حيث x=-2", a: "12" }, { q: "تحليل: 4x² - 9", a: "(2x-3)(2x+3)" },
    { q: "انشر: -3(2x+1)", a: "-6x-3" }, { q: "حل المتراجحة x < -2", a: "-3" },
    { q: "بسط: x³/x²", a: "x" }, { q: "حل: 2(x-3) = 8", a: "7" },
    { q: "انشر: (3x+1)(3x-1)", a: "9x²-1" }, { q: "قيمة (x+1)² حيث x=4", a: "25" },
    { q: "تحليل: x³ + x", a: "x(x²+1)" }, { q: "حل: 3x+7 = 1", a: "-2" }
];

const unit_05_DB = [
    { q: "في فيثاغورس: AB=6, AC=8 الوتر BC=؟", a: "10" }, { q: "Cos(0°)", a: "1" },
    { q: "Sin(30°)", a: "0.5" }, { q: "تانجانت الزاوية = المقابل / ...؟", a: "المجاور" },
    { q: "مجموع زوايا المربع؟", a: "360" }, { q: "الوتر هو أطول ضلع في المثلث ال...؟", a: "القائم" },
    { q: "مساحة الدائرة: π × ... مربع؟", a: "نصف القطر" }, { q: "في طالس: يجب توفر شرط ال...؟", a: "توازي" },
    { q: "Cos²x + Sin²x =", a: "1" }, { q: "زاوية المثلث المتساوي الأضلاع؟", a: "60" },
    { q: "قطرا المستطيل متساويا و...؟", a: "متناصفان" }, { q: "الزاوية المستقيمة قيسها؟", a: "180" },
    { q: "محيط المربع: الضلع × ...؟", a: "4" }, { q: "مثلث قائم فيه زاوية 45، الزاوية الثالثة؟", a: "45" },
    { q: "المجاور / الوتر هو قانون ال...؟", a: "cos" }, { q: "الزاوية المنفرجة أكبر من؟", a: "90" },
    { q: "مركز الدائرة المحيطة بمثلث قائم هو منتصف ال...؟", a: "الوتر" }, { q: "الضلع المقابل لـ 30° في مثلث قائم يساوي نصف ال...؟", a: "الوتر" },
    { q: "مساحة المستطيل: الطول × ...؟", a: "العرض" }, { q: "متوازي الأضلاع فيه كل ضلعين متقابلين...؟", a: "متوازيان" },
    { q: "Tan(45°)", a: "1" }, { q: "محيط الدائرة: 2 × π × ...؟", a: "نصف القطر" },
    { q: "قيس زاوية المربع؟", a: "90" }, { q: "إذا كان tan x = 1 فإن x = ؟", a: "45" },
    { q: "عدد أقطار المثلث؟", a: "0" }, { q: "المتوسط المتعلق بالوتر يساوي ... الوتر؟", a: "نصف" },
    { q: "صورة نقطة بالانسحاب هي نقطة...؟", a: "واحدة" }, { q: "شعاعان متساويان لهما نفس المنحى والاتجاه و...؟", a: "الطول" },
    { q: "علاقة شال: AB + BC = ؟", a: "AC" }, { q: "مجموع زوايا خماسي منتظم؟", a: "540" },
    { q: "في الدوران نحافظ على ال...؟", a: "الزوايا" }, { q: "منصف الزاوية يقسمها إلى زاويتين...؟", a: "متساويتين" },
    { q: "المسافة بين نقطتين دائما عدد...؟", a: "موجب" }, { q: "الإحداثيات (0,0) هي إحداثيات ال...؟", a: "المبدأ" },
    { q: "الانسحاب يحافظ على ال...؟", a: "المساحات" }, { q: "مساحة شبه المنحرف: (ق1+ق2)× الارتفاع / ...؟", a: "2" },
    { q: "في المثلث القائم: مربع الوتر = مجموع مربعي ال...؟", a: "الضلعين" }, { q: "Sin(90°)", a: "1" },
    { q: "المثلث الذي فيه ضلعان متساويان هو مثلث...؟", a: "متساوي الساقين" }, { q: "النسبة بين المقابل والمجاور؟", a: "tan" },
    { q: "محور قطعة مستقيم يكون ... عليها في منتصفها؟", a: "عمودي" }, { q: "الزاوية المحيطية تساوي ... الزاوية المركزية؟", a: "نصف" },
    { q: "قطرا المعين متناصفان و...؟", a: "متعامدان" }, { q: "قيمة Sin(0°)", a: "0" },
    { q: "المثلث القائم يحقق نظرية ال...؟", a: "فيثاغورس" }, { q: "إذا تساوى شعاعان فإن الشكل متوازي...؟", a: "أضلاع" },
    { q: "عدد أضلاع السداسي؟", a: "6" }, { q: "قيس الزاوية الحادة أصغر من؟", a: "90" },
    { q: "نقطة تلاقي المتوسطات تسمى مركز ... المثلث؟", a: "ثقل" }, { q: "محيط المثلث: مجموع أطوال...؟", a: "أضلاعه" },
    { q: "في المثلث، مجموع زاويتين داخليتين أصغر من الزاوية ...؟", a: "الخارجية" },
    { q: "الزاوية المركزية قيسها 60°، المحيطية المقابلة؟", a: "30°" },
    { q: "إذا كان Sin a = 0.8 فإن Cos²a = ؟", a: "0.36" },
    { q: "مجموع زوايا السداسي؟", a: "720" }, { q: "نقطة المنتصف تقسم القطعة إلى ... متساويتين", a: "قطعتين" },
    { q: "المستقيمان العموديان يشكلان زاوية قياسها؟", a: "90°" },
    { q: "مماس الدائرة يشكل زاوية قائمة مع ...؟", a: "النصف قطر" },
    { q: "الشكل الرباعي الذي أقطاره متساوية هو...؟", a: "مستطيل أو معين" },
    { q: "طول قوس الدائرة؟", a: "α×π×R/180" }, { q: "العلاقة طالس تربط بين أضلاع ... متشابهة", a: "مثلثات" }
];

const unit_08_DB = [
    { q: "f(x)=3x هي دالة...؟", a: "خطية" }, { q: "f(x)=2x+5 هي دالة...؟", a: "تآلفية" },
    { q: "صورة 2 بالدالة f(x)=4x هي؟", a: "8" }, { q: "العدد الذي صورته 10 بالدالة f(x)=5x؟", a: "2" },
    { q: "معامل الدالة f(x)=-x هو؟", a: "-1" }, { q: "f(0) في أي دالة خطية تساوي؟", a: "0" },
    { q: "صورة 1 بالدالة f(x)=x+3؟", a: "4" }, { q: "f(x)=7 هي دالة...؟", a: "ثابتة" },
    { q: "ميل الدالة f(x)=2x-1 هو؟", a: "2" }, { q: "التمثيل البياني للدالة الخطية يمر بـ...؟", a: "المبدأ" },
    { q: "صورة -3 بالدالة f(x)=2x؟", a: "-6" }, { q: "f(x)=ax، يسمى a ال...؟", a: "معامل" },
    { q: "إذا كان f(2)=6 في دالة خطية فإن f(x)=...؟", a: "3x" }, { q: "f(x)=x دالة تسمى الدالة ال...؟", a: "محايدة" },
    { q: "نقطة تقاطع f(x)=2x+3 مع محور التراتيب هي (0,...)؟", a: "3" }, { q: "صورة 5 بالدالة f(x)=0.2x؟", a: "1" },
    { q: "f(x)=ax+b، يسمى b ال...؟", a: "ثابت" }, { q: "الدالة التي تمثيلها مستقيم لا يمر بالمبدأ هي؟", a: "تآلفية" },
    { q: "إذا كان f(x)=4x فإن f(0.5)=؟", a: "2" }, { q: "العدد الذي صورته 0 بالدالة f(x)=x-4؟", a: "4" },
    { q: "f(x)=-3x+1، احسب f(1)", a: "-2" }, { q: "معامل الدالة f(x)=x/2 هو؟", a: "0.5" },
    { q: "f(x)=10x، احسب f(-2)", a: "-20" }, { q: "هل f(x)=x² دالة خطية؟ (نعم/لا)", a: "لا" },
    { q: "صورة 100 بالدالة f(x)=0.01x؟", a: "1" }, { q: "f(x)=5x-5، ما هي f(1)؟", a: "0" },
    { q: "العدد الذي صورته 6 بالدالة f(x)=2x؟", a: "3" }, { q: "f(x)=ax+b تكون خطية إذا كان b=...؟", a: "0" },
    { q: "ميل الدالة f(x)=-4x+7 هو؟", a: "-4" }, { q: "f(x)=3x+3، احسب f(-1)", a: "0" },
    { q: "صورة 0 بالدالة التآلفية f(x)=ax+b هي؟", a: "b" }, { q: "إذا كان f(1)=5 و f(0)=0 فإن الدالة هي f(x)=...؟", a: "5x" },
    { q: "f(x)=1/x هل هي دالة تآلفية؟ (نعم/لا)", a: "لا" }, { q: "صورة 4 بالدالة f(x)=√x هي؟", a: "2" },
    { q: "f(x)=-2x، ما هو العدد الذي صورته 4؟", a: "-2" }, { q: "المستقيم y=3x+2 يمر بالنقطة (1,...)؟", a: "5" },
    { q: "f(x)=0.5x+1، احسب f(4)", a: "3" }, { q: "الدالة الخطية تعبر عن وضعية...؟", a: "تناسبية" },
    { q: "معامل توجيه المستقيم y=x هو؟", a: "1" }, { q: "f(x)=-x-1، احسب f(-1)", a: "0" },
    { q: "العدد الذي صورته 10 بالدالة f(x)=x+10؟", a: "0" }, { q: "صورة 6 بالدالة f(x)=x/3 هي؟", a: "2" },
    { q: "f(x)=2x، احسب f(f(1))", a: "4" }, { q: "هل f(x)=2x+x دالة خطية؟ (نعم/لا)", a: "نعم" },
    { q: "f(x)=4، احسب f(100)", a: "4" }, { q: "ميل المستقيم y=5 هو؟", a: "0" },
    { q: "f(x)=2x-2، احسب f(0)", a: "-2" }, { q: "العدد الذي صورته -1 بالدالة f(x)=x؟", a: "-1" },
    { q: "f(x)=3x، احسب f(1/3)", a: "1" }, { q: "صورة 9 بالدالة f(x)=x-9 هي؟", a: "0" },
    { q: "الدالة f(x)=3/x+1 هي دالة ...؟", a: "عكسية تآلفية" },
    { q: "إذا كان a>0 فإن الدالة الخطية تزايدية؟ (نعم/لا)", a: "نعم" },
    { q: "صورة -2 بالدالة f(x)=-x", a: "2" }, { q: "المعادلة f(x)=g(x) تعني...؟", a: "تقاطع البيانيين" },
    { q: "f(x)=2x+1 و g(x)=3x. حل f(x)=g(x)", a: "1" }, { q: "الدالة الثابتة صورة كل عدد...؟", a: "متساوية" },
    { q: "ميل المستقيم الرأسي...؟", a: "غير معرف" }, { q: "f(x)=x²، صورة 2 هي؟", a: "4" }
];

const examQuestionsDB = [
    { q: "أعطِ كتابة علمية للعدد: 0.000045", a: "4.5×10⁻⁵" }, { q: "احسب PGCD(45, 60)", a: "15" },
    { q: "بسط الجذور التالية: √50 + 2√18", a: "8√2" }, { q: "حل المعادلة: (x - 2)(3x + 9) = 0", a: "2 أو -3" },
    { q: "حل المتراجحة: 5x - 4 > 2x + 2", a: "x > 2" }, { q: "انشر ثم بسّط: K = (2√3 - 1)²", a: "13 - 4√3" },
    { q: "حسّل المقدار: A = (3x)² × 2x", a: "18x³" }, { q: "مثلث ABC قائم في B. AB=3, BC=4. احسب AC", a: "5" },
    { q: "مستقيم (d) معامله الموجهي a=2 وممره b=-1. المعادلة هي؟", a: "y=2x-1" }, { q: "الدالة الخطية f(x)=-3x. احسب f(-2)", a: "6" },
    { q: "زاوية محيطية تقابس قوساً 60°. ما قياسها؟", a: "30°" }, { q: "حسّل الكسر: 2/3 + 1/6", a: "5/6" },
    { q: "تحليل إلى عوامل أولية: 140", a: "2²×5×7" }, { q: "ما هي صورة 5 بالدالة f(x)=0.2x+1؟", a: "2" },
    { q: "Sin(α)=0.5 والزاوية حادة. ما قيمة α؟", a: "30°" }, { q: "نقطتان A(-2, 1) و B(1, 5). المستقيم (AB) ميله؟", a: "4/3" },
    { q: "هل المعادلة x² = -9 لها حل في ح؟ (نعم/لا)", a: "لا" }, { q: "متوازي أضلاع محيطه 20 وأحد أضلاعه 6. الضلع الآخر؟", a: "4" },
    { q: "انشر: (x + 2)(x - 5)", a: "x² - 3x - 10" }, { q: "حل في R: |x - 3| = 2", a: "1 أو 5" },
    { q: "أكتب العدد 123000 بصيغة علمية", a: "1.23×10⁵" }, { q: "بسط √300 + √27", a: "10√3 + 3√3" },
    { q: "حسّل الكسر: 3/4 - 1/2", a: "1/4" }, { q: "حل المعادلة: x/4 = 5", a: "20" },
    { q: "تحليل: 9x² - 16", a: "(3x-4)(3x+4)" }, { q: "انشر: (3x - 2)(x + 4)", a: "3x²+10x-8" },
    { q: "زاوية مركزية 90° تقابل قوساً طوله؟", a: "ربع المحيط" }, { q: "مثلث قائم ضلعاه القائمان 5 و 12. الوتر؟", a: "13" },
    { q: "f(x)=2x-3. احسب f(4)", a: "5" }, { q: "حسّل: (√2 + √3)²", a: "5 + 2√6" },
    { q: "هل العددان 8 و 12 أوليان؟ (نعم/لا)", a: "لا" }, { q: "حل المتراجحة: -3x ≤ 6", a: "x ≥ -2" },
    { q: "انشر: -(2x - 5)", a: "-2x+5" }, { q: "بسط: x⁵ / x²", a: "x³" },
    { q: "العدد √5 هو عدد...؟", a: "غير ناطق" }, { q: "أكمل: Cos²(60) + Sin²(60) = ?", a: "1" },
    { q: "حسّل: 1/3 + 1/4", a: "7/12" }, { q: "حل المعادلة: x² = 49", a: "7 أو -7" },
    { q: "الدالة g(x)=4x-1 صورة -1 هي؟", a: "-5" }, { q: "مساحة مربع ضلعه 6 سم؟", a: "36" },
    { q: "Tan(60) تعادل؟", a: "√3" }, { q: "قطر دائرة نصف قطرها 5؟", a: "10" },
    { q: "نقطة منتصف القطعة [AB] هي...؟", a: "تقسمها بنصفين" }, { q: "حسّل: (2x)³", a: "8x³" },
    { q: "حل: 2(x+3) = 14", a: "4" }, { q: "زاوية تكميلية لـ 40°؟", a: "50°" },
    { q: "معادلة المستقيم المار بالنقطة (0,3) وميله 2؟", a: "y=2x+3" },
    { q: "هل المستقيم y=x-1 يمر بالنقطة (2,1)؟ (نعم/لا)", a: "نعم" },
    { q: "حسّل: 0.5 × 0.2", a: "0.1" }, { q: "بسط: √72", a: "6√2" },
    { q: "مجموع زوايا المثلث؟", a: "180" }, { q: "حل: 3x - 7 = 2x + 1", a: "8" },
    { q: "تحليل: 2x² + 4x", a: "2x(x+2)" }, { q: "أكتب: 0.0034 × 10⁴", a: "34" },
    { q: "هل العدد -3 عدد طبيعي؟ (نعم/لا)", a: "لا" }, { q: "f(x)=x². احسب f(-3)", a: "9" },
    { q: "زاوية تابعة لزاوية 120° في متوازي أضلاع؟", a: "60°" },
    { q: "حل المعادلة: (2x-1)(x+4)=0 (الحل السالب)", a: "-4" },
    { q: "القاسم المشترك الأكبر لـ 36 و 48؟", a: "12" }, { q: "انشر: 5(2x - 3)", a: "10x - 15" },
    { q: "بسط: (√5)²", a: "5" }, { q: "حل في R: |2x| = 4", a: "2 أو -2" },
    { q: "معامل التوجيه للمستقيم y = -x + 5؟", a: "-1" }, { q: "Sin(30) × Cos(60) = ؟", a: "0.25" },
    { q: "حسّل: (10⁻²)", a: "0.01" }, { q: "محيط دائرة قطرها 10 سم؟", a: "10π" },
    { q: "حل: x/2 + 1 = 4", a: "6" }, { q: "ما هو ميل المستقيم الأفقي؟", a: "0" },
    { q: "زاوية خارجية لمثلث متساوي الأضلاع؟", a: "120°" },
    { q: "حسّل الكسر: (1/2) / (1/4)", a: "2" }, { q: "هل 4 عدد أولي؟ (نعم/لا)", a: "لا" },
    { q: "بسط: √12 + √27", a: "5√3" }, { q: "حل المعادلة: 5x = 0", a: "0" },
    { q: "f(x)= -x + 2. f(f(1)) = ؟", a: "1" }, { q: "طول القوس المركزي 180°؟", a: "نصف المحيط" },
    { q: "العدد 1.5 هو عدد...؟", a: "عشري" }, { q: "حسّل: (2√2)²", a: "8" },
    { q: "انشر: (x-1)(x²+x+1)", a: "x³-1" }, { q: "حل المتراجحة: x+3 < 5", a: "x < 2" },
    { q: "قيمة Tan(0°)؟", a: "0" }, { q: "هل الدالة f(x)=x+1 تزايدية؟ (نعم/لا)", a: "نعم" },
    { q: "حسّل: 1/5 + 3/5", a: "4/5" }, { q: "بسط: √45 × √5", a: "15" },
    { q: "مثلث أضلاعه 3, 4, 5 هو...؟", a: "قائم" }, { q: "حل: |x-5|=0", a: "5" },
    { q: "نقطة تقاطع y=3x مع y=-x+4؟", a: "(1,3)" }, { q: "حسّل: 2³ × 2²", a: "32" },
    { q: "هل π عدد جذري؟ (نعم/لا)", a: "لا" }, { q: "انشر: (x+1)³", a: "x³+3x²+3x+1" }
];

// =========================================
// 5. منطق الاختبارات (Game Logic)
// =========================================
let currentQuestions = [];
let currentIdx = 0;
let sessionScore = 0;
let maxScore = 10;
let isExamMode = false;

function startQuiz(unitId) {
    isExamMode = false;
    let db = [];
    if(unitId === 'unit_01') db = unit_01_DB;
    else if(unitId === 'unit_03') db = unit_03_DB;
    else if(unitId === 'unit_05') db = unit_05_DB;
    else if(unitId === 'unit_08') db = unit_08_DB;

    currentQuestions = db.sort(() => 0.5 - Math.random()).slice(0, 10);
    currentIdx = 0;
    sessionScore = 0;
    maxScore = 10;
    
    document.getElementById('main-view').style.display = "none";
    document.getElementById('quiz-view').style.display = "block";
    renderQuestion();
}

function startExamMode() {
    isExamMode = true;
    currentQuestions = [...examQuestionsDB].sort(() => 0.5 - Math.random()).slice(0, 4);
    sessionScore = 0;
    maxScore = 4;
    
    document.getElementById('main-view').style.display = "none";
    document.getElementById('quiz-view').style.display = "block";
    renderExamPaper();
}

function renderQuestion() {
    if (currentIdx >= maxScore) {
        showFinalResult();
        return;
    }

    const item = currentQuestions[currentIdx];
    document.getElementById('current-score').innerText = sessionScore;
    
    const scoreCircleSpans = document.querySelectorAll('.score-circle span');
    if(scoreCircleSpans.length >1) {
        scoreCircleSpans[1].innerText = maxScore;
    }
    
    const container = document.getElementById('quiz-data-container');
    container.innerHTML = `
        <p style="text-align:center; opacity:0.5; margin-bottom:10px;">السؤال ${currentIdx + 1} من ${maxScore}</p>
        <h2 style="text-align:center; margin-bottom:25px; min-height:60px; display:flex; align-items:center; justify-content:center;">
            ${item.q}
        </h2>
        <div class="quiz-input-group">
            <input type="text" id="userInput" placeholder="اكتب إجابتك هنا..." autocomplete="off" autofocus>
            <button class="action-btn" onclick="checkAnswer('${item.a}')">تأكيد الإجابة</button>
        </div>
        <div id="feedback" style="margin-top:20px; font-weight:bold; text-align:center; height:30px;"></div>
    `;

    const inputEl = document.getElementById('userInput');
    if(inputEl) {
        inputEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                checkAnswer(item.a);
            }
        });
    }
}

function checkAnswer(correct) {
    const userVal = document.getElementById('userInput').value.trim().toLowerCase();
    const feedback = document.getElementById('feedback');
    const inputField = document.getElementById('userInput');
    
    inputField.disabled = true;

    const cleanUser = userVal.replace(/\s+/g, '');
    const cleanCorrect = correct.toLowerCase().replace(/\s+/g, '');

    if (cleanUser.includes(cleanCorrect) || cleanCorrect.includes(cleanUser)) {
        sessionScore++;
        feedback.innerHTML = "✅ أصبت! عمل رائع";
        feedback.style.color = "var(--success)";
    } else {
        feedback.innerHTML = `❌ خطأ! الإجابة الصحيحة هي: ${correct}`;
        feedback.style.color = "var(--danger)";
    }

    document.getElementById('current-score').innerText = sessionScore;
    currentIdx++;

    setTimeout(renderQuestion, 1500);
}

function renderExamPaper() {
    document.getElementById('current-score').innerText = "0";
    const scoreCircleSpans = document.querySelectorAll('.score-circle span');
    if(scoreCircleSpans.length > 1) {
        scoreCircleSpans[1].innerText = maxScore;
    }

    const container = document.getElementById('quiz-data-container');
    let htmlContent = `
        <div class="exam-paper">
            <div class="exam-paper-header">
                <h2>امتحان تجريبي - رياضيات</h2>
                <p>المدة: غير محدودة | العلامة: ${maxScore}</p>
            </div>
    `;

    currentQuestions.forEach((item, index) => {
        htmlContent += `
            <div class="exam-question">
                <span class="q-label">السؤال ${index + 1}:</span>
                <div class="q-text">${item.q}</div>
                <input type="text" class="paper-input" id="exam-input-${index}" placeholder="اكتب الإجابة هنا" autocomplete="off">
                <div id="feedback-${index}" style="margin-top:5px; font-size:0.9rem; font-weight:bold; display:none;"></div>
            </div>
        `;
    });

    htmlContent += `
            <button class="submit-btn" onclick="submitExam()">تسليم ورقة الامتحان</button>
        </div>
    `;

    container.innerHTML = htmlContent;
}

function submitExam() {
    let finalScore = 0;

    currentQuestions.forEach((item, index) => {
        const inputField = document.getElementById(`exam-input-${index}`);
        const feedbackDiv = document.getElementById(`feedback-${index}`);
        const userVal = inputField.value.trim().toLowerCase();
        
        const cleanUser = userVal.replace(/\s+/g, '');
        const cleanCorrect = item.a.toLowerCase().replace(/\s+/g, '');

        let isCorrect = (cleanUser.includes(cleanCorrect) || cleanCorrect.includes(cleanUser)) && userVal !== "";

        if (isCorrect) {
            finalScore++;
            inputField.classList.add('correct-answer');
            inputField.classList.remove('wrong-answer');
            feedbackDiv.innerText = "صحيح (+1)";
            feedbackDiv.style.color = "green";
            feedbackDiv.style.display = "block";
        } else {
            inputField.classList.add('wrong-answer');
            inputField.classList.remove('correct-answer');
            feedbackDiv.innerText = `خطأ، الإجابة: ${item.a}`;
            feedbackDiv.style.color = "red";
            feedbackDiv.style.display = "block";
        }
    });

    sessionScore = finalScore;
    document.getElementById('current-score').innerText = sessionScore;

    const container = document.getElementById('quiz-data-container');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result-box';
    
    let msg = "";
    if (finalScore === 4) msg = "ممتاز! نتيجة كاملة 🌟";
    else if (finalScore === 3) msg = "جيد جداً 👍";
    else if (finalScore === 2) msg = "متوسط، حاول مرة أخرى";
    else msg = "ضعيف، راجع الدروس";

    resultDiv.innerHTML = `
        <h3>نتيجة الامتحان</h3>
        <div class="result-score">${finalScore} / ${maxScore}</div>
        <p>${msg}</p>
        <button class="action-btn" style="margin-top:15px; background:#000; color:#fff;" onclick="showHome()">العودة للرئيسية</button>
    `;
    
    const submitBtn = container.querySelector('.submit-btn');
    if(submitBtn) submitBtn.remove();
    container.querySelector('.exam-paper').appendChild(resultDiv);
}

function showFinalResult() {
    const container = document.getElementById('quiz-data-container');
    let message = sessionScore >= (maxScore/2) ? "أداء ممتاز! 🔥" : "حاول مرة أخرى لتحسين النتيجة 💪";
    
    container.innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <h2 style="color:var(--accent-color); margin-bottom:15px;">انتهى التحدي</h2>
            <div style="font-size: 4rem; font-weight:900; margin-bottom:10px;">${sessionScore}/${maxScore}</div>
            <p style="font-size:1.2rem; margin-bottom:30px;">${message}</p>
            <button class="action-btn" onclick="showHome()">العودة للمجالات</button>
        </div>
    `;
}

function showHome() {
    document.getElementById('main-view').style.display = "block";
    document.getElementById('quiz-view').style.display = "none";
}

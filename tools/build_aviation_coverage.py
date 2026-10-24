#!/usr/bin/env python3
"""Add vocabulary missing from the Rishe dictionary by comparing it with a source text.

The importer intentionally keeps the dictionary data model local-first. Source-derived
entries are marked Draft; this tool does not claim editorial/etymological verification.
Usage: python tools/build_aviation_coverage.py data.json tools/aviation_source/aviation_text_4000.txt [output.json]
"""
from __future__ import annotations
import collections, json, re, sys
from pathlib import Path

TOKEN_RE = re.compile(r"\b[A-Za-z]+(?:[-'][A-Za-z]+)*\b")
POSSESSIVE_RE = re.compile(r"['’]s$", re.I)

# Root-family members observed in the source. These explicit groups are deliberately
# conservative: unrelated words with similar spelling are not merged automatically.
ROOT_GROUPS = {
    'control': 'controlled controller controllers controlling controls',
    'dispatch': 'dispatched dispatcher dispatchers',
    'expect': 'expectation expectations expected',
    'indicate': 'indicated indicates indication indications',
    'operate': 'operationally operations operator operators',
    'respond': 'response responsibilities responsibility responsible',
    'address': 'addressed addresses',
    'approve': 'approval approved',
    'check': 'checked checking checks cross-checking cross-checks',
    'document': 'documentation documented',
    'effect': 'effective effectiveness effects',
    'hazard': 'hazardous hazards',
    'make': 'makes making',
    'report': 'reported reporting reports',
    'specify': 'specified specifies specific specifications',
    'stabilize': 'stabilized stabilizer stabilizing',
    'step': 'stepped-on steps',
    'time': 'timely timing',
    'accelerate': 'accelerations',
    'add': 'adds',
    'aerodrome': 'aerodromes',
    'affect': 'affected',
    'aid': 'aids',
    'airport': 'airports',
    'airworthy': 'airworthiness',
    'alternate': 'alternates',
    'altitude': 'altitudes',
    'amendment': 'amendments',
    'annunciate': 'annunciation annunciator',
    'appropriate': 'appropriately',
    'area': 'areas',
    'assess': 'assessment',
    'attempt': 'attempting attempts',
    'attitude': 'attitudes',
    'available': 'availability',
    'balance': 'balances balancing',
    'become': 'becomes',
    'brake': 'brakes braking',
    'characteristic': 'characteristics',
    'chemical': 'chemicals',
    'clearance': 'clearances',
    'compartment': 'compartments',
    'condition': 'conditions',
    'crew': 'crews',
    'damage': 'damaging',
    'defect': 'defects',
    'deliberate': 'deliberately',
    'departure': 'departures',
    'deteriorate': 'deterioration',
    'determine': 'determines',
    'discipline': 'disciplined',
    'distinguish': 'distinguished',
    'efficient': 'efficiency',
    'equip': 'equipment equipped',
    'exceed': 'exceeded',
    'execute': 'executes execution',
    'factor': 'factors',
    'fix': 'fixed fixes',
    'force': 'forces',
    'forecast': 'forecasts',
    'framework': 'frameworks',
    'function': 'functional functions',
    'gap': 'gaps',
    'head': 'heading headings',
    'headwind': 'headwinds',
    'identity': 'identical',
    'identify': 'identifies',
    'include': 'includes including',
    'instrument': 'instruments',
    'intense': 'intensity',
    'it': 'its',
    'item': 'items',
    'layer': 'layered layers',
    'light': 'lighting',
    'liquid': 'liquids',
    'load': 'loading loads',
    'look': 'looks',
    'margin': 'margins',
    'mark': 'marking',
    'material': 'materials',
    'monitor': 'monitoring',
    'name': 'named names',
    'normal': 'normally',
    'package': 'packaging',
    'panel': 'panels',
    'passenger': 'passengers',
    'penetrate': 'penetrant',
    'pilot': 'pilots',
    'point': 'points',
    'present': 'presenting',
    'pressure': 'pressures pressurization',
    'problem': 'problems',
    'program': 'programmed programs',
    'readback': 'readbacks',
    'release': 'released',
    'relevant': 'relevance',
    'route': 'routing',
    'seat': 'seated',
    'shipment': 'shipments',
    'show': 'shows',
    'stage': 'stages',
    'stall': 'stalls',
    'store': 'stores',
    'structure': 'structured structures',
    'support': 'supported supports',
    'system': 'systems',
    'task': 'tasks',
    'temperature': 'temperatures',
    'thunderstorm': 'thunderstorms',
    'track': 'tracks',
    'trend': 'trends',
    'warn': 'warning warnings',
    'wing': 'wings',
    'zone': 'zones',
}

# English headword -> concise Persian meaning in the context of the supplied text.
# These are draft translations and are flagged as such in the data.
GLOSSARY = {
    'a':'یک؛ حرف تعریف نامعین', 'en-route':'در مسیر؛ در راه', 'the':'حرف تعریف معین؛ این/آن بسته به بافت', 'from':'از',
    'attempt':'تلاش؛ تلاش کردن', 'axis':'محور', 'balance':'تعادل؛ متعادل کردن', 'brake':'ترمز؛ ترمز گرفتن',
    'annunciate':'اعلام کردن؛ اعلام وضعیت', 'accelerate':'شتاب گرفتن؛ سرعت را افزایش دادن', 'accelerations':'شتاب‌ها؛ افزایش‌های سرعت', 'alternate':'جایگزین؛ فرودگاه جایگزین', 'altitude':'ارتفاع',
    'amendment':'اصلاحیه؛ تغییر رسمی', 'characteristic':'ویژگی؛ مشخصه', 'instrument':'ابزار؛ دستگاه؛ سازِ پرواز',
    'intense':'شدید؛ پرشدت', 'penetrate':'نفوذ کردن؛ وارد شدن به', 'step':'گام؛ مرحله',
    'dispatch':'دیسپچ؛ برنامه‌ریزی و اعزام پرواز', 'indicate':'نشان دادن؛ مشخص کردن', 'operate':'کار کردن؛ بهره‌برداری کردن',
    'specify':'مشخص کردن؛ تعیین کردن', 'stabilize':'پایدار کردن؛ تثبیت کردن', 'warn':'هشدار دادن',
    'respond':'پاسخ دادن؛ واکنش نشان دادن', 'equip':'مجهز کردن', 'execute':'اجرا کردن', 'fix':'اصلاح کردن؛ تثبیت کردن',
    'function':'کارکرد؛ تابع؛ عمل کردن', 'layer':'لایه', 'load':'بار؛ بارگذاری کردن', 'name':'نام؛ نام‌گذاری کردن',
    'program':'برنامه؛ برنامه‌ریزی کردن', 'rudder':'سکان عمودی؛ رادر', 'microburst':'ریزتندباد همرفتی',
    'notam':'نوتام؛ اطلاعیهٔ هوانوردی', 'sigmet':'سیگمت؛ هشدار هواشناسی مهم برای پرواز', 'axis':'محور',
    'discarding':'کنار گذاشتن؛ دور انداختن', 'effect':'اثر؛ تأثیر', 'equip':'مجهز کردن', 'execute':'اجرا کردن',
    'fix':'ثابت کردن؛ اصلاح کردن؛ نقطهٔ مشخص مسیر', 'function':'کارکرد؛ تابع؛ عمل کردن', 'indicate':'نشان دادن؛ مشخص کردن',
    'layer':'لایه', 'lithium':'لیتیوم', 'load':'بار؛ بارگذاری کردن', 'microburst':'ریزتندباد همرفتی', 'name':'نام؛ نام‌گذاری کردن',
    'notam':'نوتام؛ اطلاعیهٔ هوانوردی', 'oxidizer':'اکسیدکننده؛ مادهٔ اکسیدکننده', 'oxidizers':'اکسیدکننده‌ها؛ مواد اکسیدکننده', 'accelerations':'شتاب‌ها؛ افزایش‌های سرعت', 'program':'برنامه؛ برنامه‌ریزی کردن', 'rudder':'سکان عمودی؛ رادر',
    'sigmet':'سیگمت؛ هشدار هواشناسی مهم برای پرواز', 'warn':'هشدار دادن', 'abbreviations':'مخفف‌ها', 'ability':'توانایی', 'about':'دربارهٔ',
    'absence':'نبود؛ غیاب', 'access':'دسترسی', 'according':'بر اساس؛ مطابق با', 'accumulation':'تجمع؛ انباشت',
    'actual':'واقعی', 'add':'افزودن', 'additional':'اضافی', 'address':'رسیدگی کردن؛ نشانی',
    'addressed':'رسیدگی‌شده؛ مورد توجه قرارگرفته', 'addresses':'رسیدگی می‌کند؛ نشانی‌ها', 'adds':'می‌افزاید',
    'adequately':'به‌اندازهٔ کافی', 'adjacent':'مجاور', 'adjustable':'قابل تنظیم', 'aerodrome':'فرودگاه؛ میدان هوایی',
    'aerodromes':'فرودگاه‌ها؛ میدان‌های هوایی', 'aerodynamic':'آیرودینامیکی', 'aeronautical':'هوانوردی؛ مربوط به هوانوردی',
    'affect':'تأثیر گذاشتن بر', 'affected':'متأثر؛ تحت تأثیر قرارگرفته', 'after':'پس از؛ بعد از', 'age':'سن؛ عمر',
    'aid':'کمک؛ وسیلهٔ کمک‌ناوبری', 'aids':'کمک‌ها؛ تجهیزات کمک‌ناوبری', 'aileron':'شهپر', 'ailerons':'شهپرها',
    'air':'هوا', 'aircraft':'هواگرد؛ هواپیما', 'aircraft-specific':'ویژهٔ نوع هواگرد؛ مختص هواگرد',
    'airflow':'جریان هوا', 'airframe':'سازه و بدنهٔ هواگرد', 'airline':'شرکت هواپیمایی', 'airmen':'هوانوردان؛ کارکنان پرواز',
    'airport':'فرودگاه', 'airports':'فرودگاه‌ها', 'airspace':'فضای هوایی', 'airspeed':'سرعت هوایی', 'airways':'مسیرهای هوایی؛ کریدورهای هوایی',
    'airworthiness':'صلاحیت پروازی', 'airworthy':'دارای صلاحیت پروازی', 'alarms':'هشدارها', 'alerts':'اخطارها؛ آگاه‌سازی‌ها',
    'all':'همه؛ تمام', 'alloys':'آلیاژها', 'also':'همچنین', 'alter':'تغییر دادن', 'aluminum':'آلومینیوم',
    'amount':'مقدار', 'an':'یک؛ حرف تعریف نامعین', 'and':'و', 'angle':'زاویه', 'annunciate':'اعلام کردن؛ نمایش دادن وضعیت',
    'annunciation':'اعلان؛ نمایش وضعیت سامانه', 'annunciator':'اعلانگر؛ نشانگر وضعیت', 'antennas':'آنتن‌ها',
    'anti-icing':'سامانهٔ ضدیخ؛ جلوگیری از تشکیل یخ', 'any':'هر؛ هرگونه', 'anticipated':'پیش‌بینی‌شده؛ مورد انتظار',
    'appropriate':'مناسب', 'appropriately':'به‌شکل مناسب', 'approval':'تأیید؛ تصویب', 'approve':'تأیید کردن', 'approved':'تأییدشده؛ مصوب',
    'approximately':'تقریباً', 'arbitrary':'دلخواه؛ خودسرانه', 'are':'هستند', 'area':'منطقه؛ ناحیه', 'area-navigation':'ناوبری منطقه‌ای (RNAV)',
    'areas':'مناطق؛ نواحی', 'arise':'پدید آمدن؛ رخ دادن', 'articles':'اقلام؛ اشیا', 'as':'به‌عنوان؛ همان‌طور که',
    'assess':'ارزیابی کردن', 'assessment':'ارزیابی', 'assigned':'تخصیص‌یافته؛ واگذارشده', 'assumptions':'فرض‌ها', 'at':'در؛ هنگام',
    'atmospheric':'جوی؛ مربوط به جو', 'attempting':'تلاش کردن؛ در حال تلاش', 'attempts':'تلاش‌ها؛ تلاش می‌کند',
    'attitude':'وضعیت زاویه‌ای؛ نگرش', 'attitudes':'وضعیت‌های زاویه‌ای؛ نگرش‌ها', 'authorized':'مجاز؛ تأییدشده',
    'availability':'دسترس‌پذیری؛ موجود بودن', 'available':'در دسترس؛ موجود', 'aviation':'هوانوردی', 'avoid':'اجتناب کردن؛ دوری کردن',
    'awareness':'آگاهی؛ شناخت', 'axes':'محورها', 'backup':'پشتیبان؛ جایگزین', 'badge':'نشان؛ کارت شناسایی', 'baggage':'بار همراه؛ توشه',
    'balances':'تعادل‌ها؛ متعادل می‌کند', 'balancing':'متعادل‌سازی؛ متعادل کردن', 'based':'مبتنی بر؛ بر پایهٔ', 'basic':'پایه‌ای؛ اساسی',
    'bay':'محفظه؛ جایگاه', 'be':'بودن', 'bearings':'سمت‌ها؛ آزیموت‌ها', 'become':'شدن', 'becomes':'می‌شود', 'before':'پیش از؛ قبل از',
    'begins':'آغاز می‌شود', 'behavior':'رفتار؛ عملکرد', 'better':'بهتر', 'between':'بین؛ میان', 'bias':'سوگیری؛ خطای ناشی از پیش‌داوری',
    'blockage':'انسداد؛ گرفتگی', 'boundaries':'مرزها؛ حدود', 'brakes':'ترمزها', 'braking':'ترمزگیری', 'briefers':'تهیه‌کنندگان توجیه عملیاتی',
    'burned':'سوخته؛ سوزانده‌شده', 'but':'اما؛ ولی', 'by':'به‌وسیلهٔ؛ توسط', 'bypass':'مسیر جانبی؛ گذرگاه میان‌بر',
    'cabin':'کابین؛ بخش مسافران', 'calculations':'محاسبات', 'calendar':'تقویمی؛ تقویم', 'call':'تماس؛ فراخوان', 'can':'می‌تواند', 'cannot':'نمی‌تواند',
    'cards':'کارت‌ها', 'cargo':'بار؛ محموله', 'cargo-compartment':'محفظهٔ بار', 'carts':'چرخ‌دستی‌ها؛ گاری‌ها', 'categories':'دسته‌ها؛ طبقه‌ها',
    'cause':'علت؛ موجب شدن', 'caution':'احتیاط', 'cells':'سلول‌ها؛ هسته‌های همرفتی', 'centers':'مراکز', 'certain':'معین؛ برخی',
    'chain':'زنجیره', 'channel':'کانال؛ مجرا', 'charts':'نقشه‌ها؛ چارت‌ها', 'checked':'بررسی‌شده؛ کنترل کرد', 'checking':'بررسی کردن؛ کنترل',
    'checkpoint':'نقطهٔ کنترل', 'checks':'بررسی‌ها؛ کنترل می‌کند', 'chemical':'شیمیایی', 'chemicals':'مواد شیمیایی', 'chord':'وتر؛ خط مستقیم میان دو نقطهٔ مقطع بال',
    'circulars':'بخشنامه‌ها؛ اطلاعیه‌های دوره‌ای', 'circumstances':'شرایط؛ اوضاع', 'clarification':'شفاف‌سازی؛ رفع ابهام', 'classification':'طبقه‌بندی',
    'classified':'طبقه‌بندی‌شده', 'clear':'روشن؛ خالی؛ مجاز', 'clear-air':'هوای صاف؛ هوای بدون ابر', 'clearance':'مجوز؛ اجازهٔ کنترل ترافیک هوایی',
    'clearances':'مجوزها؛ اجازه‌ها', 'closest':'نزدیک‌ترین', 'closures':'بسته‌شدن‌ها؛ تعطیلی‌ها', 'cockpit':'کابین خلبان', 'collections':'مجموعه‌ها',
    'collision':'برخورد؛ تصادم', 'combinations':'ترکیب‌ها', 'combustor':'محفظهٔ احتراق', 'comes':'می‌آید؛ رخ می‌دهد', 'commanded':'دستور داده‌شده؛ فرمان‌داده‌شده',
    'commercial':'تجاری؛ بازرگانی', 'commonly':'معمولاً؛ به‌طور رایج', 'communications':'ارتباطات؛ مخابرات', 'compact':'فشرده؛ متراکم',
    'compartment':'محفظه؛ بخش جداشده', 'compartments':'محفظه‌ها', 'compasses':'قطب‌نماها', 'compliance':'انطباق؛ رعایت الزامات', 'comply':'رعایت کردن؛ تبعیت کردن',
    'components':'اجزا؛ مؤلفه‌ها', 'compressor':'کمپرسور؛ متراکم‌کننده', 'conceal':'پنهان کردن', 'concentrations':'غلظت‌ها؛ تمرکزها', 'concern':'نگرانی؛ مسئله',
    'condition':'شرایط؛ وضعیت', 'condition-monitoring':'پایش وضعیت', 'conditions':'شرایط؛ وضعیت‌ها', 'conform':'مطابقت داشتن', 'constraints':'محدودیت‌ها؛ قیود',
    'consult':'مراجعه کردن؛ مشورت گرفتن', 'contaminated':'آلوده؛ آغشته', 'contributes':'مشارکت دارد؛ سهم دارد', 'control':'کنترل؛ مهار کردن',
    'controlled':'کنترل‌شده؛ تحت کنترل', 'controller':'کنترل‌کننده؛ مراقب پرواز (بسته به بافت)', 'controllers':'کنترل‌کنندگان؛ مراقبان پرواز',
    'controlling':'کنترل کردن؛ در حال کنترل', 'controls':'کنترل‌ها؛ کنترل می‌کند', 'conventions':'قواعد؛ قراردادها', 'core':'هسته', 'corrected':'اصلاح‌شده؛ تصحیح کرد',
    'corrosive':'خورنده؛ زنگ‌زا', 'counterfeit':'تقلبی؛ جعلی', 'country':'کشور', 'cracks':'ترک‌ها؛ شکاف‌ها', 'crew':'خدمه', 'crews':'خدمه‌ها',
    'criteria':'معیارها؛ ملاک‌ها', 'critical':'بحرانی؛ تعیین‌کننده', 'cross-checking':'بازبینی متقابل؛ تطبیق دوباره', 'cross-checks':'بازبینی‌های متقابل',
    'crosswind':'باد جانبی', 'curing':'عمل‌آوری؛ پخت', 'currents':'جریان‌ها؛ جریان‌های هوا', 'damage':'آسیب؛ خسارت', 'damaging':'آسیب‌زننده؛ آسیب‌رسانی',
    'dangerous-goods':'کالاهای خطرناک', 'data':'داده‌ها؛ اطلاعات', 'de-icing':'یخ‌زدایی؛ زدودن یخ', 'deck':'عرشه؛ عرشهٔ پرواز', 'declaration':'اعلام؛ اظهار',
    'declines':'کاهش می‌یابد؛ افت می‌کند', 'defect':'نقص؛ عیب', 'defects':'نقص‌ها؛ عیب‌ها', 'defenses':'دفاع‌ها؛ لایه‌های حفاظتی', 'deferred':'به‌تعویق‌افتاده؛ واگذارشده به بعد',
    'definitions':'تعریف‌ها', 'deliberate':'عمدی؛ سنجیده', 'deliberately':'عمداً؛ آگاهانه', 'density':'چگالی؛ تراکم', 'department':'بخش؛ واحد سازمانی',
    'departure':'عزیمت؛ برخاست', 'departures':'عزیمت‌ها؛ پروازهای خروجی', 'details':'جزئیات', 'detect':'تشخیص دادن؛ کشف کردن', 'deteriorate':'بدتر شدن؛ افت کردن',
    'deterioration':'زوال؛ افت کیفیت', 'determine':'تعیین کردن؛ مشخص کردن', 'determines':'تعیین می‌کند', 'deviations':'انحراف‌ها؛ تغییر مسیرها', 'device':'دستگاه؛ وسیله',
    'difficulty':'دشواری؛ مشکل', 'directional':'جهتی؛ مربوط به جهت', 'disc​arding':'کنار گذاشتن', 'disc​arding':'دور انداختن', 'discards':'دور انداختن',
    'discipline':'انضباط؛ رشتهٔ تخصصی', 'disciplined':'منضبط؛ منظم', 'dispatch':'دیسپچ؛ اعزام و برنامه‌ریزی پرواز', 'dispatched':'اعزام‌شده؛ ارسال‌شده',
    'dispatcher':'دیسپچر؛ مسئول اعزام پرواز', 'dispatchers':'دیسپچرها؛ مسئولان اعزام پرواز', 'displays':'نمایشگرها؛ نمایش می‌دهد', 'dissimilar':'غیرمشابه؛ ناهمگون',
    'dissipate':'پراکنده کردن؛ مستهلک کردن', 'distances':'فاصله‌ها', 'distinguish':'تمایز قائل شدن؛ تشخیص دادن', 'distinguished':'متمایز؛ تفکیک‌شده',
    'distress':'وضعیت اضطراری؛ پریشانی', 'distribution':'توزیع؛ پراکندگی', 'do':'انجام دادن', 'document':'سند؛ مستند کردن', 'documentation':'مستندات؛ مدارک',
    'documented':'مستندشده؛ ثبت‌شده', 'does':'انجام می‌دهد', 'down':'پایین؛ رو به پایین', 'drag':'پسا؛ نیروی مقاومت هوا', 'drawn':'کشیده‌شده؛ ترسیم‌شده',
    'drift':'رانش؛ انحراف تدریجی', 'droplets':'قطرات ریز', 'duration':'مدت؛ طول زمان', 'dye':'رنگ؛ مادهٔ رنگی', 'easier':'آسان‌تر', 'eddy-current':'جریان گردابی',
    'effective':'مؤثر؛ کارآمد', 'effectiveness':'اثربخشی؛ میزان کارایی', 'effects':'تأثیرات؛ آثار', 'efficiency':'کارایی؛ بازده', 'efficient':'کارآمد؛ پربازده',
    'elements':'عناصر؛ اجزا', 'elevators':'الویتورها؛ سطوح کنترل پیچ', 'eliminate':'حذف کردن؛ از بین بردن', 'else':'دیگر؛ در غیر این صورت', 'empennage':'مجموعهٔ دم هواگرد',
    'en':'در؛ بر روی (بسته به توکن‌سازی متن)', 'engine-monitoring':'پایش موتور', 'engineers':'مهندسان', 'entire':'تمام؛ کامل', 'equipment':'تجهیزات', 'equipped':'مجهز',
    'errors':'خطاها', 'escalation':'افزایش؛ ارجاع به سطح بالاتر', 'especially':'به‌ویژه؛ مخصوصاً', 'essential':'ضروری؛ حیاتی', 'established':'تعیین‌شده؛ برقرارشده',
    'exact':'دقیق؛ عیناً', 'examinations':'معاینات؛ بازرسی‌ها', 'exceed':'فراتر رفتن؛ تجاوز کردن از حد', 'exceeded':'از حد گذشت؛ فراتر رفت', 'excess':'مازاد؛ بیش از حد',
    'executes':'اجرا می‌کند', 'execution':'اجرا؛ انجام', 'expect':'انتظار داشتن', 'expectation':'انتظار؛ پیش‌بینی', 'expectations':'انتظارات؛ پیش‌بینی‌ها', 'expected':'مورد انتظار؛ پیش‌بینی‌شده',
    'explosives':'مواد منفجره', 'exposed':'در معرض؛ آشکارشده', 'external':'بیرونی؛ خارجی', 'extra':'اضافی', 'facilities':'امکانات؛ تأسیسات', 'factor':'عامل', 'factors':'عوامل',
    'failure':'خرابی؛ شکست', 'false':'نادرست؛ کاذب', 'fan':'فن؛ پروانه', 'far':'دور؛ بسیار', 'fasteners':'اتصالات؛ بست‌ها', 'fatigue':'خستگی؛ خستگی سازه‌ای',
    'faults':'خرابی‌ها؛ نقص‌ها', 'filtering':'پالایش؛ فیلترکردن', 'findings':'یافته‌ها', 'fixed':'ثابت؛ تعمیرشده', 'fixed-wing':'بال‌ثابت', 'fixes':'نقاط یا اصلاحات؛ اصلاح می‌کند',
    'flammable':'قابل اشتعال', 'flaps':'فلپ‌ها؛ بالچه‌های کمکی', 'flare':'گردشدن نهایی پیش از تماس؛ فلر', 'flaws':'نقص‌ها؛ عیب‌ها', 'focuses':'تمرکز می‌کند', 'for':'برای',
    'forbidden':'ممنوع', 'force':'نیرو؛ وادار کردن', 'forces':'نیروها', 'forecast':'پیش‌بینی', 'forecasts':'پیش‌بینی‌ها', 'foreseeable':'قابل پیش‌بینی', 'forgotten':'فراموش‌شده',
    'framework':'چارچوب', 'frameworks':'چارچوب‌ها', 'freeze':'یخ زدن؛ منجمد شدن', 'frequency':'بسامد؛ فرکانس', 'frontal':'جبهه‌ای؛ مربوط به جبههٔ هوا', 'functional':'کارکردی؛ عملکردی',
    'functions':'کارکردها؛ عملکردها', 'further':'بیشتر؛ افزون بر این', 'fuselage':'بدنهٔ هواپیما', 'future':'آینده', 'gap':'فاصله؛ شکاف', 'gaps':'فاصله‌ها؛ شکاف‌ها',
    'gas':'گاز', 'gases':'گازها', 'gate':'نقطهٔ تعیین‌شده؛ گیت', 'gear':'چرخ‌ها؛ ارابهٔ فرود؛ چرخ‌دنده', 'geographically':'از نظر جغرافیایی', 'give':'دادن', 'glideslope':'شیب نزول؛ گلاید اسلوپ',
    'go':'رفتن؛ عمل کردن', 'go-around':'مانور برخاست مجدد پس از لغو فرود', 'good':'خوب؛ مناسب', 'goods':'کالاها؛ اجناس', 'ground':'زمین', 'ground-based':'مستقر در زمین؛ زمینی',
    'groundspeed':'سرعت زمینی', 'group':'گروه؛ دسته', 'guidance':'هدایت؛ راهنمایی', 'guide':'راهنما؛ هدایت کردن', 'gusts':'تندبادهای لحظه‌ای', 'hail':'تگرگ', 'hangars':'آشیانه‌های هواپیما',
    'hard':'سخت؛ دشوار', 'harm':'آسیب؛ زیان', 'has':'دارد', 'have':'داشتن', 'hazard':'خطر؛ عامل خطر', 'hazardous':'خطرناک', 'hazards':'خطرها؛ عوامل خطر',
    'heading':'سمت دماغه؛ هدینگ', 'headings':'سمت‌ها؛ هدینگ‌ها', 'headwind':'باد مخالف', 'headwinds':'بادهای مخالف', 'hidden':'پنهان', 'hiding':'پنهان کردن', 'high':'زیاد؛ بالا',
    'high-bypass':'با نسبت کنارگذر بالا', 'high-speed':'پرسرعت؛ سرعت بالا', 'higher':'بالاتر', 'history':'تاریخچه', 'holding':'انتظار؛ نگه‌داشتن', 'horizon':'افق', 'horizontal':'افقی', 'hostile':'خصمانه؛ دشمنانه',
    'hot':'داغ؛ گرم', 'hours':'ساعت‌ها', 'how':'چگونه', 'hydraulics':'سامانهٔ هیدرولیک', 'icing':'یخ‌زدگی؛ تشکیل یخ', 'identical':'یکسان؛ کاملاً مشابه', 'identification':'شناسایی',
    'identifies':'شناسایی می‌کند', 'identify':'شناسایی کردن؛ تشخیص دادن', 'identity':'هویت؛ یکسانی', 'if':'اگر', 'image':'تصویر', 'impact':'ضربه؛ برخورد؛ تأثیر', 'implementation':'پیاده‌سازی؛ اجرا',
    'important':'مهم', 'impossible':'ناممکن', 'improvising':'بداهه‌کاری کردن؛ بدون دستورالعمل عمل کردن', 'in':'در؛ داخل', 'inadvertent':'غیرعمدی؛ ناخواسته', 'includes':'شامل می‌شود', 'including':'از جمله؛ شامل',
    'incoming':'ورودی؛ واردشونده', 'incompatible':'ناسازگار', 'indicated':'نشان‌داده‌شده؛ نشان داد', 'indicates':'نشان می‌دهد', 'indication':'نشانه؛ نشانگر', 'indications':'نشانه‌ها؛ نمایشگرها',
    'induced':'القاشده؛ ایجادشده', 'inertial':'اینرسی؛ لَختی', 'infallible':'خطاناپذیر', 'initialization':'مقداردهی اولیه', 'injury':'آسیب؛ جراحت', 'inlets':'ورودی‌ها؛ دهانه‌های ورودی',
    'inspections':'بازرسی‌ها', 'instructions':'دستورالعمل‌ها', 'insufficient':'ناکافی', 'inter-turbine':'بین توربین‌ها؛ میان‌توربینی', 'internal':'داخلی', 'intervals':'فاصله‌های زمانی؛ بازه‌ها',
    'into':'به داخل', 'is':'است', 'isolation':'جداسازی؛ ایزولاسیون', 'issue':'مسئله؛ صادر کردن', 'it':'آن؛ این', 'item':'مورد؛ قلم', 'items':'موارد؛ اقلام', 'its':'مال آن؛ متعلق به آن',
    'itself':'خودش؛ خود آن', 'jamming':'اخلال رادیویی؛ پارازیت‌اندازی', 'jet':'جت؛ فوران', 'joints':'اتصالات؛ مفصل‌ها', 'known':'شناخته‌شده', 'labeling':'برچسب‌گذاری', 'lacks':'فاقد است؛ کم دارد',
    'laminates':'لایه‌چینی‌ها؛ ورقه‌های لایه‌ای', 'landing':'فرود', 'large':'بزرگ', 'lateral':'جانبی؛ عرضی', 'latitude':'عرض جغرافیایی', 'layered':'لایه‌بندی‌شده', 'layers':'لایه‌ها', 'leak':'نشت', 'leakage':'نشت؛ تراوش',
    'leave':'ترک کردن؛ باقی گذاشتن', 'level':'سطح؛ تراز', 'light':'نور؛ روشن', 'lighting':'روشنایی؛ چراغ‌ها', 'lightning':'آذرخش؛ صاعقه', 'likely':'محتمل؛ احتمالاً', 'limitations':'محدودیت‌ها', 'line':'خط؛ مسیر',
    'liquid':'مایع', 'liquids':'مایعات', 'list':'فهرست', 'listening':'گوش دادن', 'lithium-battery':'باتری لیتیومی', 'little':'کم؛ اندک', 'loading':'بارگیری؛ بارگذاری', 'loads':'بارها؛ بارگذاری می‌کند',
    'locations':'مکان‌ها؛ موقعیت‌ها', 'long':'طولانی؛ بلند', 'longitude':'طول جغرافیایی', 'look':'نگاه کردن؛ به نظر رسیدن', 'looks':'به نظر می‌رسد؛ نگاه می‌کند', 'loss':'از دست دادن؛ افت', 'low':'کم؛ پایین',
    'low-level':'سطح پایین؛ ارتفاع کم', 'lower':'پایین‌تر؛ کاهش دادن', 'lowest':'پایین‌ترین', 'lubrication':'روان‌کاری', 'machine':'ماشین؛ دستگاه', 'magnetic':'مغناطیسی', 'major':'عمده؛ اصلی', 'make':'ساختن؛ باعث شدن',
    'makes':'می‌سازد؛ باعث می‌شود', 'making':'ساختن؛ ایجاد کردن', 'many':'بسیاری؛ تعداد زیادی', 'margin':'حاشیه؛ حاشیهٔ ایمنی', 'margins':'حاشیه‌ها؛ حاشیه‌های ایمنی', 'mark':'علامت؛ علامت‌گذاری کردن', 'marking':'علامت‌گذاری؛ برچسب‌گذاری',
    'mass':'جرم', 'material':'ماده؛ مصالح', 'materials':'مواد؛ مصالح', 'maximum':'حداکثر', 'may':'ممکن است؛ می‌تواند', 'means':'معنی؛ روش‌ها', 'measurements':'اندازه‌گیری‌ها؛ مقادیر اندازه‌گیری‌شده', 'mechanical':'مکانیکی',
    'meets':'برآورده می‌کند؛ ملاقات می‌کند', 'member':'عضو', 'messages':'پیام‌ها', 'met':'برآورده کرد؛ ملاقات کرد', 'metals':'فلزها', 'metar':'متار؛ گزارش هواشناسی فرودگاه', 'meteorological':'هواشناسی؛ مربوط به هواشناسی',
    'methods':'روش‌ها', 'microbursts':'ریزتندبادهای همرفتی', 'military':'نظامی', 'minima':'حداقل‌ها؛ کمینه‌ها', 'missed-approach':'روش تقرب ناموفق؛ رویهٔ اوج‌گیری مجدد', 'missions':'مأموریت‌ها', 'misunderstandings':'سوءبرداشت‌ها؛ بدفهمی‌ها',
    'mitigation':'کاهش ریسک؛ تخفیف اثر', 'modern':'مدرن؛ امروزی', 'moisture':'رطوبت', 'monitor':'پایشگر؛ پایش کردن', 'monitoring':'پایش؛ نظارت', 'more':'بیشتر', 'most':'بیشترِ؛ بیشترین', 'motion':'حرکت', 'mountain-wave':'موج کوهستانی',
    'must':'باید', 'named':'نام‌گذاری‌شده', 'names':'نام‌ها', 'no':'نه؛ هیچ', 'non-destructive':'غیرمخرب', 'normal':'عادی؛ معمول', 'normally':'معمولاً', 'not':'نه؛ نیست', 'notams':'نوتام‌ها؛ اطلاعیه‌های هوانوردی',
    'observed':'مشاهده‌شده', 'occupants':'سرنشینان؛ افراد داخل هواگرد', 'occurs':'رخ می‌دهد', 'of':'از؛ ـِ', 'offices':'دفترها؛ اداره‌ها', 'offs':'خاموشی‌ها؛ قطع‌ها', 'omnidirectional':'همه‌جهته؛ همه‌سویه', 'on':'روی؛ روشن', 'onboard':'داخل هواگرد؛ نصب‌شده روی وسیله',
    'one':'یک؛ یکی', 'only':'فقط؛ تنها', 'operationally':'از نظر عملیاتی', 'operations':'عملیات', 'operator':'اپراتور؛ بهره‌بردار', 'operators':'اپراتورها؛ بهره‌برداران', 'opportunity':'فرصت', 'options':'گزینه‌ها', 'or':'یا',
    'original':'اصلی؛ اولیه', 'others':'دیگران؛ موارد دیگر', 'outage':'ازکارافتادگی؛ قطعی', 'over':'بر؛ بیش از', 'overlap':'هم‌پوشانی داشتن', 'override':'نادیده گرفتن؛ لغو کردن فرمان پیشین', 'oxidizers':'مواد اکسیدکننده',
    'package':'بسته؛ بسته‌بندی', 'packaging':'بسته‌بندی', 'panel':'پنل؛ صفحه', 'panels':'پنل‌ها؛ صفحات', 'paperwork':'مدارک اداری؛ کاغذبازی', 'parameters':'پارامترها؛ متغیرها', 'parasite':'انگلی؛ پارازیتی', 'particular':'خاص؛ مشخص', 'particularly':'به‌ویژه؛ مخصوصاً',
    'parts':'قطعات؛ بخش‌ها', 'passage':'عبور؛ گذر', 'passenger':'مسافر', 'passengers':'مسافران', 'passes':'عبور می‌کند؛ گذرگاه‌ها', 'path':'مسیر؛ مسیر حرکت', 'patterns':'الگوها', 'period':'دوره؛ بازه', 'phase':'مرحله؛ فاز', 'phraseology':'عبارت‌شناسی استاندارد رادیویی', 'picture':'تصویر؛ نمای کلی', 'pilot':'خلبان', 'pilots':'خلبانان', 'pitch':'گام؛ زاویهٔ پیچ', 'placarding':'نصب برچسب هشدار', 'planners':'برنامه‌ریزان',
    'pneumatic':'پنوماتیکی؛ بادی', 'point':'نقطه', 'points':'نقاط', 'positioning':'موقعیت‌یابی', 'possible':'ممکن', 'potential':'بالقوه؛ ظرفیت بالقوه', 'powerplant':'نیروگاه محرکه؛ مجموعهٔ موتور', 'practical':'عملی؛ کاربردی', 'precipitation':'بارش', 'precisely':'دقیقاً', 'predictions':'پیش‌بینی‌ها',
    'presence':'وجود؛ حضور', 'present':'حاضر؛ ارائه کردن', 'presenting':'ارائه کردن؛ مطرح کردن', 'pressures':'فشارها', 'pressurization':'فشاردهی؛ تنظیم فشار کابین', 'primary':'اصلی؛ اولیه', 'probes':'حسگرها؛ پروب‌ها', 'problem':'مسئله؛ مشکل', 'problems':'مسائل؛ مشکلات', 'procedures':'رویه‌ها؛ دستورالعمل‌ها', 'products':'محصولات؛ فرآورده‌ها', 'profile':'مشخصات؛ نمایه', 'programmed':'برنامه‌ریزی‌شده', 'programs':'برنامه‌ها', 'progressed':'پیشرفت کرد', 'prohibited':'ممنوع', 'promptly':'به‌سرعت؛ بی‌درنگ', 'propellers':'ملخ‌ها', 'property':'ویژگی؛ خاصیت؛ اموال', 'proportion':'نسبت؛ سهم', 'proposed':'پیشنهادشده؛ طرح‌شده', 'propulsive':'پیشرانشی؛ مربوط به ایجاد رانش', 'provenance':'منشأ؛ سابقهٔ اصالت', 'provides':'فراهم می‌کند؛ ارائه می‌دهد', 'publications':'انتشارات؛ نشریات', 'pull-up':'مانور بالا کشیدن دماغه؛ پول‌آپ', 'qualified':'واجد صلاحیت؛ تأییدصلاحیت‌شده', 'quantity':'مقدار؛ کمیت', 'queues':'صف‌ها؛ صف انتظار', 'quickly':'به‌سرعت', 'radar':'رادار', 'radio':'رادیو؛ مخابرات رادیویی', 'radioactive':'رادیواکتیو؛ پرتوزا', 'range':'برد؛ دامنه', 'rapid':'سریع', 'rapidly':'به‌سرعت', 'rate':'نرخ؛ میزان', 'readback':'بازخوانی پیام؛ تکرار مجدد مجوز', 'readbacks':'بازخوانی‌ها؛ تکرار مجدد مجوزها', 'realistic':'واقع‌بینانه', 'rear':'عقب؛ پشتی', 'redundancy':'افزونگی؛ پشتیبان‌سازی', 'references':'مراجع؛ نشانه‌ها', 'reflectivity':'بازتابندگی', 'regions':'مناطق؛ نواحی', 'registration':'ثبت؛ شمارهٔ ثبت', 'regulations':'مقررات؛ آیین‌نامه‌ها', 'regulatory':'مقرراتی؛ قانون‌گذارانه', 'relationships':'روابط؛ ارتباط‌ها', 'release':'آزادسازی؛ اجازهٔ انجام پرواز', 'released':'منتشرشده؛ آزادشده', 'relevance':'ارتباط؛ میزان مرتبط بودن', 'relevant':'مرتبط؛ مربوط', 'reliability':'قابلیت اطمینان', 'reported':'گزارش‌شده؛ گزارش داد', 'reporting':'گزارش‌دهی', 'reports':'گزارش‌ها؛ گزارش می‌کند', 'represents':'نمایندگی می‌کند؛ نشان می‌دهد', 'request':'درخواست؛ درخواست کردن', 'requirements':'الزامات؛ نیازمندی‌ها', 'rerouting':'تغییر مسیر مجدد', 'resolving':'حل‌وفصل کردن', 'respond':'پاسخ دادن؛ واکنش نشان دادن', 'response':'پاسخ؛ واکنش', 'responsibilities':'مسئولیت‌ها', 'responsibility':'مسئولیت', 'responsible':'مسئول؛ پاسخ‌گو', 'results':'نتایج؛ حاصل می‌شود', 'rises':'بالا می‌رود؛ افزایش می‌یابد', 'robust':'مقاوم؛ قابل اتکا', 'rooms':'اتاق‌ها', 'route':'مسیر؛ مسیر پرواز', 'routinely':'به‌طور معمول؛ به‌صورت روتین', 'routing':'مسیریابی؛ تعیین مسیر', 'rudders':'سکان‌های عمودی؛ رادرها', 'sabotage':'خرابکاری', 'safer':'ایمن‌تر', 'satellite-based':'مبتنی بر ماهواره', 'says':'می‌گوید', 'scheduled':'برنامه‌ریزی‌شده؛ زمان‌بندی‌شده', 'screening':'بازرسی؛ غربالگری', 'seal':'مهروموم؛ درزبند', 'seat':'صندلی؛ جایگاه', 'seated':'نشسته', 'sectors':'بخش‌ها؛ سکتورها', 'segments':'قطعه‌ها؛ بخش‌ها', 'segregation':'جداسازی؛ تفکیک', 'self-managing':'خودمدیر؛ خودگردان', 'sequence':'توالی؛ دنباله', 'services':'خدمات؛ سرویس‌ها', 'severity':'شدت؛ وخامت', 'shear':'برش؛ برش باد', 'shipment':'محموله؛ ارسال کالا', 'shipments':'محموله‌ها؛ ارسال‌های کالا', 'short':'کوتاه', 'shorten':'کوتاه کردن', 'shorter':'کوتاه‌تر', 'should':'باید؛ بهتر است', 'show':'نشان دادن؛ نمایش', 'shows':'نشان می‌دهد؛ نمایش‌ها', 'sigmets':'سیگمت‌ها؛ هشدارهای هواشناسی مهم', 'sign-offs':'امضاهای تأیید کار؛ ثبت نهایی انجام کار', 'significant-weather':'آب‌وهوای مهم؛ وضعیت جوی قابل توجه', 'similar-sounding':'دارای آوای مشابه؛ شبیه‌صدا', 'simplified':'ساده‌شده', 'single':'تک؛ واحد', 'situation':'وضعیت؛ موقعیت', 'skin-friction':'اصطکاک سطحی؛ اصطکاک پوستۀ جریان', 'slot':'اسلات؛ بازهٔ زمانی تخصیص‌یافته', 'slower':'کندتر', 'small':'کوچک', 'smoke':'دود', 'some':'برخی؛ مقداری', 'someone':'کسی؛ فردی', 'sophisticated':'پیشرفته؛ پیچیده', 'source':'منبع', 'spaces':'فضاها؛ مکان‌ها', 'specialists':'متخصصان', 'specific':'مشخص؛ ویژه', 'specifications':'مشخصات؛ الزامات فنی', 'specified':'مشخص‌شده؛ تعیین‌شده', 'specifies':'مشخص می‌کند؛ تعیین می‌کند', 'specify':'مشخص کردن؛ تعیین کردن', 'spoilers':'اسپویلرها؛ صفحات کاهندهٔ برا', 'spoofing':'جعل سیگنال؛ فریب سامانهٔ ناوبری', 'stabilized':'پایدارشده', 'stabilizer':'پایدارکننده؛ پایدارساز', 'stabilizing':'پایدارسازی؛ پایدار کردن', 'staff':'کارکنان؛ پرسنل', 'stage':'مرحله؛ طبقه', 'stages':'مراحل؛ طبقات', 'stall':'واماندگی؛ استال', 'stalls':'وامانده می‌شود؛ واماندگی‌ها', 'standards':'استانداردها؛ معیارها', 'stations':'ایستگاه‌ها', 'steady':'پایدار؛ ثابت', 'steel':'فولاد', 'steep':'تند؛ پرشیب', 'stepped-on':'قطع‌شده توسط ارسال هم‌زمان؛ روی‌هم‌افتاده', 'steps':'گام‌ها؛ مراحل', 'stopping':'توقف؛ متوقف کردن', 'store':'ذخیره کردن؛ فروشگاه', 'stores':'ذخیره می‌کند؛ فروشگاه‌ها', 'stream':'جریان؛ شار', 'strength':'استحکام؛ قدرت', 'stress':'تنش؛ فشار روانی', 'strong':'قوی؛ شدید', 'structured':'ساختاریافته', 'structures':'سازه‌ها؛ ساختارها', 'subsonic':'زیرصوت', 'substances':'مواد؛ ترکیبات', 'substantially':'به‌طور قابل توجه؛ اساساً', 'substitutes':'جایگزین‌ها؛ جایگزین می‌کند', 'success':'موفقیت', 'such':'چنین؛ این‌گونه', 'supplies':'تأمین می‌کند؛ لوازم', 'supported':'پشتیبانی‌شده؛ حمایت‌شده', 'supports':'پشتیبانی می‌کند؛ تکیه‌گاه‌ها', 'surrounding':'پیرامون؛ اطراف', 'surveillance':'مراقبت؛ پایش و نظارت', 'suspicious':'مشکوک', 'system':'سامانه؛ سیستم', 'systems':'سامانه‌ها؛ سیستم‌ها', 'taf':'تی‌ای‌اف؛ پیش‌بینی هواشناسی فرودگاه', 'tailwind':'باد پشت؛ باد موافق', 'takeoff':'برخاست؛ تیک‌آف', 'targeted':'هدفمند؛ مورد هدف قرارگرفته', 'task':'وظیفه؛ کار', 'tasks':'وظایف؛ کارها', 'technicians':'تکنسین‌ها؛ متخصصان فنی', 'techniques':'روش‌ها؛ فنون', 'temperature':'دما', 'temperatures':'دماها', 'terminal':'پایانه؛ نهایی', 'than':'از؛ نسبت به', 'that':'که؛ آن', 'their':'مال آن‌ها؛ متعلق به آن‌ها', 'then':'سپس؛ آن‌گاه', 'there':'آنجا؛ وجود دارد', 'thermal':'حرارتی؛ گرمایی', 'these':'این‌ها', 'they':'آن‌ها', 'this':'این', 'threat':'تهدید؛ خطر', 'three':'سه', 'thresholds':'آستانه‌ها', 'thrust':'رانش؛ نیروی پیشران', 'thunderstorm':'توفان تندری؛ رعدوبرق', 'thunderstorms':'توفان‌های تندری', 'time':'زمان؛ وقت', 'timely':'به‌موقع', 'timing':'زمان‌بندی', 'titanium':'تیتانیوم', 'to':'به؛ برای؛ نشانۀ مصدر', 'tool':'ابزار', 'touchdown':'تماس چرخ‌ها با زمین؛ تاچ‌داون', 'toxic':'سمی', 'track':'مسیر روی زمین؛ ترک', 'tracks':'مسیرها؛ ردها', 'training':'آموزش؛ تمرین', 'transitions':'گذارها؛ تغییر وضعیت‌ها', 'transmissions':'ارسال‌ها؛ مخابره‌ها', 'transponder':'ترانسپوندر؛ پاسخ‌گوی راداری', 'travel':'سفر کردن؛ جابه‌جایی', 'trend':'روند', 'trends':'روندها', 'trim':'تریم؛ تنظیم تعادل', 'trip':'مسیر؛ سفر', 'true':'واقعی؛ حقیقی', 'turbine':'توربین', 'turbofan':'توربوفن', 'two':'دو', 'typical':'معمول؛ نمونه‌وار', 'ultrasonic':'فراصوتی؛ اولتراسونیک', 'unapproved':'تأییدنشده؛ غیرمجاز', 'unattended':'بدون مراقبت؛ رهاشده', 'unauthorized':'غیرمجاز؛ بدون مجوز', 'under':'زیر؛ تحت', 'undergo':'متحمل شدن؛ از سر گذراندن', 'unexpected':'غیرمنتظره', 'unnecessarily':'به‌طور غیرضروری', 'unusual':'غیرعادی', 'updates':'به‌روزرسانی‌ها؛ به‌روز می‌کند', 'upper':'بالایی؛ فوقانی', 'upper-air':'لایه‌های بالایی جو؛ هوای ارتفاعات', 'urgency':'فوریت؛ اضطرار', 'variations':'تغییرات؛ تنوع‌ها', 'varies':'متغیر است؛ فرق می‌کند', 'various':'گوناگون؛ مختلف', 'verbalizing':'بیان شفاهی؛ با صدای بلند گفتن', 'very':'بسیار؛ خیلی', 'vibration':'لرزش؛ ارتعاش', 'volumes':'حجم‌ها؛ گستره‌ها', 'warning':'هشدار', 'warnings':'هشدارها', 'way':'راه؛ روش', 'weather':'آب‌وهوا؛ هواشناسی', 'well':'خوب؛ به‌خوبی', 'what':'چه؛ آنچه', 'when':'وقتی که؛ چه زمانی', 'where':'کجا؛ جایی که', 'which':'کدام؛ که', 'who':'چه کسی؛ کسی که', 'will':'خواهد؛ فعل کمکی آینده', 'willingness':'تمایل؛ آمادگی', 'wind-shear':'برش باد؛ تغییر ناگهانی سرعت یا جهت باد', 'wing':'بال هواپیما', 'wings':'بال‌ها', 'with':'با؛ همراه با', 'withstand':'تحمل کردن؛ تاب آوردن', 'would':'می‌کرد؛ فعل کمکی شرطی', 'zone':'منطقه؛ ناحیه', 'zones':'مناطق؛ نواحی',
}

# Source-derived terms whose relationship to a current family is clear and useful.
# Terms absent from this table remain standalone unless explicitly grouped above.
EXISTING_ROOT_MAP = {
    'access':'access', 'adequately':'adequate', 'anticipated':'anticipate', 'assumptions':'assumption',
    'authorized':'authorize', 'begins':'begin', 'burned':'burn', 'calculations':'calculate', 'closures':'closure',
    'collections':'collection', 'combinations':'combination', 'communications':'communicate', 'components':'component',
    'compressor':'compress', 'concentrations':'concentrate', 'conventions':'convention', 'corrected':'correct',
    'currents':'current', 'decisions':'decision', 'declaration':'declare', 'deferred':'defer', 'directional':'direction',
    'displays':'display', 'distances':'distance', 'distribution':'distribute', 'established':'establish',
    'examinations':'examination', 'excess':'excess', 'exposed':'expose', 'external':'external',
    'geographically':'geographic', 'hiding':'hide', 'holding':'hold', 'hydraulics':'hydraulic', 'icing':'ice',
    'important':'important', 'improvising':'improvise', 'initialization':'initialize', 'instructions':'instruction',
    'internal':'internal', 'jamming':'jam', 'joints':'joint', 'lateral':'lateral', 'leave':'leave', 'limitations':'limitation',
    'locations':'location', 'magnetic':'magnetic', 'measurements':'measurement', 'messages':'message', 'missions':'mission',
    'mitigation':'mitigate', 'occurs':'occur', 'others':'other', 'planners':'planner', 'positioning':'position',
    'precisely':'precise', 'progressed':'progress', 'propellers':'propeller', 'proposed':'propose', 'propulsive':'propulsive',
    'provenance':'provenance', 'provides':'provide', 'references':'reference', 'reflectivity':'reflectivity',
    'regulations':'regulation', 'relationships':'relationship', 'requirements':'requirement', 'resolving':'resolve',
    'rises':'rise', 'routinely':'routine', 'scheduled':'schedule', 'screening':'screen', 'sectors':'sector',
    'segments':'segment', 'short':'short', 'shorten':'shorten', 'simplified':'simplify', 'sounding':'sound',
    'standards':'standard', 'stations':'station', 'substances':'substance', 'substantially':'substantial',
    'supplies':'supply', 'technicians':'technician', 'techniques':'technique', 'training':'train',
    'transmissions':'transmission', 'volumes':'volume',
}

# More context-sensitive vocabulary for terms that can be mistranslated by a generic suffix rule.
WORD_POS = {
    'a':'det','according':'prep','from':'prep','about':'prep','after':'prep','all':'det','an':'det','and':'conj','are':'v','as':'prep',
    'at':'prep','be':'v','before':'prep','between':'prep','but':'conj','by':'prep','can':'v','cannot':'v',
    'for':'prep','from':'prep','if':'conj','in':'prep','into':'prep','is':'v','it':'pron','its':'det',
    'of':'prep','on':'prep','one':'det','only':'adv','or':'conj','over':'prep','some':'det','such':'det',
    'than':'conj','that':'det','their':'det','then':'adv','there':'adv','these':'det','they':'pron','this':'det',
    'to':'prep','under':'prep','what':'pron','when':'adv','where':'adv','which':'det','who':'pron','with':'prep',
    'will':'v','would':'v','very':'adv','well':'adv','also':'adv','approximately':'adv','appropriately':'adv',
    'commonly':'adv','deliberately':'adv','geographically':'adv','likely':'adj','normally':'adv','operationally':'adv',
    'precisely':'adv','promptly':'adv','quickly':'adv','rapidly':'adv','routinely':'adv','substantially':'adv',
    'timely':'adj','unnecessarily':'adv','unexpected':'adj','unusual':'adj','hazardous':'adj','aerodynamic':'adj',
    'aeronautical':'adj','airworthy':'adj','available':'adj','approved':'adj','appropriate':'adj','critical':'adj',
    'commercial':'adj','contaminated':'adj','corrosive':'adj','dangerous-goods':'n','effective':'adj','efficient':'adj',
    'external':'adj','fixed-wing':'adj','flammable':'adj','high-bypass':'adj','high-speed':'adj','horizontal':'adj',
    'hostile':'adj','incompatible':'adj','inertial':'adj','internal':'adj','lateral':'adj','low-level':'adj',
    'non-destructive':'adj','operationally':'adv','potential':'adj','practical':'adj','propulsive':'adj','radioactive':'adj',
    'realistic':'adj','relevant':'adj','robust':'adj','satellite-based':'adj','self-managing':'adj','similar-sounding':'adj',
    'significant-weather':'n','sophisticated':'adj','specific':'adj','steady':'adj','steep':'adj','subsonic':'adj',
    'suspicious':'adj','thermal':'adj','toxic':'adj','typical':'adj','ultrasonic':'adj','unapproved':'adj',
    'unattended':'adj','unauthorized':'adj','upper-air':'n','upper':'adj','various':'adj','very':'adv','well':'adv',
}

# Components of compounds can be added as roots when absent, but prefix fragments are not
# treated as independent vocabulary (e.g., anti-, de-, non-).
COMPOUND_ROOTS = {
    'aircraft-specific': ['aircraft','specific'], 'anti-icing':['ice'], 'area-navigation':['area','navigation'],
    'cargo-compartment':['cargo','compartment'], 'clear-air':['clear','air'], 'condition-monitoring':['condition','monitor'],
    'cross-checking':['cross','check'], 'cross-checks':['cross','check'], 'dangerous-goods':['dangerous','goods'],
    'de-icing':['ice'], 'eddy-current':['eddy','current'], 'engine-monitoring':['engine','monitor'],
    'fixed-wing':['fixed','wing'], 'go-around':['go','around'], 'ground-based':['ground','based'],
    'high-bypass':['high','bypass'], 'high-speed':['high','speed'], 'inter-turbine':['turbine'],
    'lithium-battery':['lithium','battery'], 'low-level':['low','level'], 'missed-approach':['missed','approach'],
    'mountain-wave':['mountain','wave'], 'non-destructive':['destructive'], 'pull-up':['pull','up'],
    'satellite-based':['satellite','based'], 'self-managing':['manage'], 'sign-offs':['sign-off'],
    'significant-weather':['significant','weather'], 'similar-sounding':['similar','sound'], 'skin-friction':['skin','friction'],
    'stepped-on':['step'], 'upper-air':['upper','air'], 'wind-shear':['wind','shear'],
}

# Words needed as component roots but not necessarily present as standalone source tokens.
COMPONENT_GLOSSES = {
    'navigation':'ناوبری', 'dangerous':'خطرناک', 'eddy':'گردابه؛ گردابی', 'engine':'موتور', 'around':'اطراف؛ پیرامون',
    'ground':'زمین', 'speed':'سرعت', 'battery':'باتری', 'missed':'ناموفق؛ ازدست‌رفته', 'approach':'تقرب؛ نزدیک‌شدن',
    'mountain':'کوه', 'wave':'موج', 'destructive':'مخرب', 'pull':'کشیدن', 'up':'بالا', 'satellite':'ماهواره',
    'manage':'مدیریت کردن', 'sign-off':'تأیید نهایی؛ امضای انجام کار', 'significant':'قابل‌توجه؛ مهم', 'similar':'مشابه',
    'sound':'صدا؛ به نظر رسیدن', 'skin':'پوست؛ سطح خارجی', 'friction':'اصطکاک', 'wind':'باد', 'shear':'برش؛ تغییر ناگهانی باد',
    'fixed':'ثابت', 'based':'مبتنی بر', 'high':'بالا؛ زیاد', 'bypass':'گذرگاه جانبی', 'low':'پایین؛ کم', 'level':'سطح',
    'cross':'متقاطع؛ متقاطع کردن', 'clear':'روشن؛ صاف', 'air':'هوا', 'cargo':'بار', 'compartment':'محفظه',
    'condition':'وضعیت', 'monitor':'پایش', 'check':'بررسی؛ کنترل', 'ice':'یخ', 'current':'جریان',
}

# A small, explicit list of irregular lemma links in the source corpus.
ROOT_OVERRIDES = {
    'respond':'respond', 'response':'respond', 'responsibilities':'respond', 'responsibility':'respond', 'responsible':'respond',
    'indicated':'indicate', 'indicates':'indicate', 'indication':'indicate', 'indications':'indicate',
    'annunciation':'annunciate', 'annunciator':'annunciate', 'airworthiness':'airworthy', 'accelerations':'accelerate',
    'aerodromes':'aerodrome', 'headings':'head', 'headwind':'headwind', 'headwinds':'headwind',
    'hydraulics':'hydraulic', 'microbursts':'microburst', 'minima':'minimum', 'oxiders':'oxidizer',
    'readbacks':'readback', 'rudders':'rudder', 'ailerons':'aileron', 'gases':'gas', 'axes':'axis',
    'metar':'metar', 'notams':'notam', 'sigmets':'sigmet', 'oxidizers':'oxidizer', 'taf':'taf',
}

# POS overrides for new dictionary records. Remaining records inherit from their family
# where possible; otherwise the importer uses a conservative suffix-based guess.

def normalise_token(raw: str) -> str:
    token = raw.casefold().replace('’', "'")
    return POSSESSIVE_RE.sub('', token)

def tokenize(text: str) -> list[str]:
    # Preserve the established aviation phrase 'en route' as one lexical expression;
    # it is not useful to teach the French preposition 'en' as a standalone English word.
    token_text = re.sub(r'\ben\s+route\b', 'en-route', text, flags=re.I)
    return [normalise_token(m.group(0)) for m in TOKEN_RE.finditer(token_text)]

def sentence_for(token: str, sentences: list[str]) -> str | None:
    # Token-level matching, with hyphens retained and possessives allowed.
    escaped = re.escape(token).replace(r'\-', r'[-\s]+')
    pat = re.compile(r'(?<![A-Za-z])' + escaped + r"(?:['’]s)?(?![A-Za-z])", re.I)
    for sentence in sentences:
        if pat.search(sentence):
            return sentence.strip()
    return None

def pos_guess(word: str, inherited: str | None = None) -> str:
    if word in WORD_POS:
        return WORD_POS[word]
    if inherited:
        return inherited
    if word.endswith('ly'):
        return 'adv'
    if word.endswith(('ous','ive','al','ic','ical','able','ible','ary','ory','ful','less','ed')):
        return 'adj'
    if word.endswith(('tion','sion','ment','ness','ity','ance','ence','ship','age','ism','ist','er','or')):
        return 'n'
    if word.endswith(('ing',)):
        return 'v'
    if word.endswith(('s',)) and len(word) > 3:
        return 'n'
    return 'n'

def variants(word: str) -> list[str]:
    """Conservative reverse morphology candidates; only exact existing headwords are used."""
    out = []
    if word.endswith('ies') and len(word) > 4: out.append(word[:-3] + 'y')
    if word.endswith('ves') and len(word) > 4: out.extend([word[:-3] + 'f', word[:-3] + 'fe'])
    if word.endswith('es') and len(word) > 4: out.extend([word[:-2], word[:-1]])
    if word.endswith('s') and len(word) > 3: out.append(word[:-1])
    if word.endswith('ied') and len(word) > 4: out.append(word[:-3] + 'y')
    if word.endswith('ed') and len(word) > 4: out.extend([word[:-2], word[:-1], word[:-2] + 'e'])
    if word.endswith('ing') and len(word) > 5: out.extend([word[:-3], word[:-3] + 'e', word[:-4]])
    for suffix, replacements in [
        ('ations', ['ate','ation']), ('ation',['ate']), ('ition',['ite']), ('tion',['te']),
        ('sion',['de','d']), ('ment',['','e']), ('ness',['','y']), ('ability',['able']),
        ('ity',['e','able']), ('ically',['ic','ical']), ('ical',['ic']), ('ally',['al']),
        ('ly',['']), ('er',['','e']), ('or',['','e']), ('ive',['e','']), ('ous',['e','']),
        ('ance',['e']), ('ence',['e']), ('able',['e']), ('ible',['e']), ('ary',['']), ('ory',['']),
        ('ization',['ize']), ('izing',['ize']), ('ized',['ize']), ('ification',['ify'])]:
        if word.endswith(suffix) and len(word) > len(suffix) + 2:
            root = word[:-len(suffix)]
            out.extend(root + rep for rep in replacements)
    return list(dict.fromkeys(x for x in out if x and x != word))

def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit('Usage: python tools/build_aviation_coverage.py data.json tools/aviation_source/aviation_text_4000.txt [output.json]')
    source_path, text_path = Path(sys.argv[1]), Path(sys.argv[2])
    out_path = Path(sys.argv[3]) if len(sys.argv) > 3 else source_path
    data = json.loads(source_path.read_text(encoding='utf-8'))
    text = text_path.read_text(encoding='utf-8')
    tokens = tokenize(text)
    unique_source = set(tokens)
    words: list[dict] = data['words']
    families: list[dict] = data['families']
    by_word = {str(w.get('w','')).casefold(): i for i,w in enumerate(words)}
    fam_by_id = {f['id']: f for f in families}
    original_word_count, original_family_count = len(words), len(families)
    existing_ids = set(by_word)
    missing = sorted(unique_source - existing_ids)
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', text) if s.strip() and len(TOKEN_RE.findall(s)) >= 5]

    # One token can have a single best known family. We never force a fuzzy match when
    # the source's family data is ambiguous.
    def family_for_root(root: str) -> int | None:
        root = root.casefold()
        if root in by_word:
            return words[by_word[root]].get('f')
        ids = {f['id'] for f in families if str(f.get('base','')).casefold() == root}
        return next(iter(ids)) if len(ids) == 1 else None

    # Explicit root groups take precedence over heuristic matching.
    root_of: dict[str, str] = {}
    for root, member_text in ROOT_GROUPS.items():
        root_of[root] = root
        for member in member_text.split():
            root_of[member] = root
    for word, root in ROOT_OVERRIDES.items():
        root_of[word] = root
        root_of.setdefault(root, root)

    # Reuse an existing family only when the selected headword is unambiguous.
    def existing_family_for(word: str) -> tuple[int | None, str | None]:
        root = EXISTING_ROOT_MAP.get(word) or root_of.get(word)
        if root:
            fid = family_for_root(root)
            if fid is not None:
                return fid, root
        for cand in variants(word):
            if cand in by_word:
                return words[by_word[cand]].get('f'), cand
        return None, None

    # Determine all roots to create before writing records, so family IDs/order are stable.
    new_root_names = {root for root in (set(ROOT_GROUPS) | set(ROOT_OVERRIDES.values())) if root not in by_word}
    assignments: dict[str, tuple[str, str | int]] = {}
    # assignments[word] = ('family', root or existing fid) or ('solo', canonical word)
    for word in missing:
        root = root_of.get(word)
        if root:
            fid = family_for_root(root)
            if fid is not None:
                assignments[word] = ('family', fid)
            else:
                assignments[word] = ('family', root)
                if root not in by_word:
                    new_root_names.add(root)
            continue
        fid, root_guess = existing_family_for(word)
        if fid is not None:
            # Avoid known lexical false friends and weak heuristic matches.
            if word in {'likely','important','hydraulics','curing','frontal','products','substances','lateral'}:
                fid = None
            else:
                assignments[word] = ('family', fid)
        if fid is None:
            assignments[word] = ('solo', word)

    # Root words required by compound expressions should be searchable too, unless the
    # token is a prefix or grammatical fragment rather than an independent word.
    extra_components = set()
    for compound, roots in COMPOUND_ROOTS.items():
        if compound in unique_source:
            for comp in roots:
                if comp not in existing_ids and comp not in unique_source and comp not in {'anti','de','non','self','inter','up'}:
                    extra_components.add(comp)
    for root in new_root_names:
        if root not in existing_ids and root not in unique_source:
            # A derived base should appear as a real searchable word in its family.
            extra_components.add(root)

    # Translate root-only additions using the best available source glossary entry.
    for comp in sorted(extra_components):
        if comp not in GLOSSARY:
            if comp in COMPONENT_GLOSSES: GLOSSARY[comp] = COMPONENT_GLOSSES[comp]
            elif comp in root_of and root_of[comp] in GLOSSARY: GLOSSARY[comp] = GLOSSARY[root_of[comp]]

    # Ensure all root/component records have a canonical assignment.
    for comp in sorted(extra_components):
        if comp in by_word or comp in assignments:
            continue
        root = root_of.get(comp)
        if comp in new_root_names:
            existing_fid = family_for_root(comp)
            assignments[comp] = ('family', existing_fid if existing_fid is not None else comp)
        elif root and family_for_root(root) is not None:
            assignments[comp] = ('family', family_for_root(root))
        else:
            assignments[comp] = ('solo', comp)

    next_fid = max(int(f['id']) for f in families) + 1
    family_by_key: dict[str, int] = {}
    for word, (kind, value) in assignments.items():
        if kind != 'family' or isinstance(value, int):
            continue
        family_by_key[str(value)] = 0
    for root in sorted(family_by_key):
        if root in by_word:
            fid = words[by_word[root]].get('f')
            if fid is not None:
                family_by_key[root] = fid
                continue
        fam = {
            'id': next_fid, 'base': root, 'root': '', 'pos': pos_guess(root),
            'fa': GLOSSARY.get(root) or COMPONENT_GLOSSES.get(root) or 'نیازمند بازبینی ترجمه',
            'pattern': 'aviation-source root family', 'cefr': None,
            'topic': 'Aviation / source text', 'ex': None, 'exFa': None,
            'words': [], 'draft': 1, 'review_status': 'draft', 'source': 'aviation_text_4000.txt'
        }
        families.append(fam); fam_by_id[next_fid] = fam
        family_by_key[root] = next_fid
        next_fid += 1

    # Every exact source word absent from the project gets one record, with its first
    # source sentence as a word-specific example. Possessive apostrophe-s is normalized
    # to the base headword; hyphenated aviation terms remain intact.
    added_words, added_families = [], []
    added_family_members = collections.Counter()
    missing_gloss: list[str] = []
    for word in sorted(assignments):
        if word in by_word:
            continue
        kind, value = assignments[word]
        if kind == 'family':
            fid = value if isinstance(value, int) else family_by_key[str(value)]
            fam = fam_by_id[fid]
            inherited = None
            root = str(value) if not isinstance(value, int) else str(fam.get('base',''))
            if root in by_word:
                inherited = words[by_word[root]].get('pos')
            pos = pos_guess(word, inherited)
            meaning = GLOSSARY.get(word)
            if not meaning and root in GLOSSARY:
                meaning = GLOSSARY[root]
            if not meaning:
                meaning = str(fam.get('fa') or '')
        else:
            fid = next_fid; next_fid += 1
            meaning = GLOSSARY.get(word) or COMPONENT_GLOSSES.get(word)
            pos = pos_guess(word)
            fam = {
                'id': fid, 'base': word, 'root': '', 'pos': pos, 'fa': meaning or '',
                'pattern': '', 'cefr': None, 'topic': 'Aviation / source text',
                'ex': None, 'exFa': None, 'words': [], 'draft': 1, 'solo': 1,
                'review_status': 'draft', 'source': 'aviation_text_4000.txt'
            }
            families.append(fam); fam_by_id[fid] = fam
        if not meaning:
            missing_gloss.append(word)
        example = sentence_for(word, sentences)
        rec = {
            'w': word, 'f': fid, 'pos': pos, 'fa': meaning or '',
            'review_status': 'draft', 'source': 'aviation_text_4000.txt'
        }
        if example:
            rec['ex'] = example
            rec['example_status'] = 'source-text-example'
        if word in ROOT_OVERRIDES or word in root_of:
            root_name = root_of.get(word, ROOT_OVERRIDES.get(word))
            if root_name and word != root_name:
                rec['form_of'] = root_name
        idx = len(words); words.append(rec); fam['words'].append(idx)
        by_word[word] = idx
        added_words.append(word); added_family_members[fid] += 1

    # Component roots not found in the text are intentionally searchable, and marked Draft.
    for comp in sorted(extra_components):
        if comp in by_word:
            continue
        # If this component is already the base of an added root family, add it there.
        fid = family_by_key.get(comp)
        if fid is None:
            fid = next_fid; next_fid += 1
            fam = {
                'id': fid, 'base': comp, 'root': '', 'pos': pos_guess(comp),
                'fa': GLOSSARY.get(comp) or COMPONENT_GLOSSES.get(comp) or 'نیازمند بازبینی ترجمه',
                'pattern': '', 'cefr': None, 'topic': 'Aviation root / source text',
                'ex': None, 'exFa': None, 'words': [], 'draft': 1, 'solo': 1,
                'review_status': 'draft', 'source': 'aviation_text_4000.txt'
            }
            families.append(fam); fam_by_id[fid] = fam
        else:
            fam = fam_by_id[fid]
        rec = {'w': comp, 'f': fid, 'pos': pos_guess(comp), 'fa': GLOSSARY.get(comp) or COMPONENT_GLOSSES.get(comp) or fam.get('fa',''),
               'review_status':'draft','source':'aviation_text_4000.txt'}
        idx = len(words); words.append(rec); fam['words'].append(idx); by_word[comp] = idx
        added_words.append(comp)

    # A word may have an inherited/derived family meaning even if the exact surface gloss
    # wasn't manually curated. Report those fallbacks separately for editorial review.
    for word in added_words:
        idx = by_word[word]; rec = words[idx]
        if not str(rec.get('fa') or '').strip():
            rec['fa'] = 'نیازمند بازبینی ترجمه'
            missing_gloss.append(word)
    report = {
        'release': '1.6.2', 'source': text_path.as_posix(),
        'source_token_occurrences': len(tokens), 'source_unique_lexical_tokens': len(unique_source),
        'source_unique_base_tokens_after_possessive_normalization': len(set(tokens)),
        'preexisting_dictionary_forms': original_word_count,
        'new_source_vocabulary_records_including_roots': len(added_words),
        'new_vocabulary_records_directly_from_source': len(set(added_words) & unique_source),
        'new_root_component_records': len(set(added_words) - unique_source),
        'new_unique_standalone_records': sum(1 for word in set(added_words) if fam_by_id[words[by_word[word]]['f']].get('solo')),
        'new_root_family_records': sum(1 for word in set(added_words) if not fam_by_id[words[by_word[word]]['f']].get('solo')),
        'new_family_records_total': len(families) - original_family_count,
        'unmatched_source_tokens_after_import': sorted(unique_source - set(by_word)),
        'records_with_missing_translation': sorted(set(missing_gloss)),
        'records_requiring_editorial_review': sorted(set(added_words)),
        'note': 'All imported entries are marked Draft; populated translations are provisional and every imported record requires editorial review of translation, POS, and root-family links.'
    }
    out_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    report_path = out_path.parent / 'tools' / 'reports' / 'aviation_coverage_report_1.6.2.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ['source_token_occurrences','source_unique_lexical_tokens','preexisting_dictionary_forms','new_source_vocabulary_records_including_roots','new_vocabulary_records_directly_from_source','new_root_component_records','new_unique_standalone_records','new_root_family_records','new_family_records_total','unmatched_source_tokens_after_import','records_with_missing_translation']}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()

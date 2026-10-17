export interface Preset {
  llmContext: string;
  customDictionary: string[];
  ignoredWords: string[];
}

export const PRESETS: Record<string, Preset> = {
  English: {
    llmContext: `Agent:
- Name: Daniel Haddad
- Team: Pension Services, Tier 1
- Languages: English, Arabic

Customer profile:
- Name: Sasha Ivanova
- Phone: +966 5X XXX 4417

Conversation:
Customer: Hello, I submitted a request for my pension documents last week. When will it be processed?
Agent: Hi Sasha, thanks for reaching out. Let me check that for you.
Customer: Also, can you check the status of my contribution records?
Agent: Sure, I'll check them as well.
Customer: I changed my bank account. How do I update my details?

Case fields:
- Case number: CS-2026-048213
- Subject: Pension documents request
- Category: Pensions / Documents
- Status: In progress
- Priority: Normal
- Opened: 2026-10-08
- Queue: Pension Services

Canned responses:
- Your contribution records are up to date, and the latest payment from your employer's Mudad payroll has been registered on your account.
- Your request has been received and will be processed within 3 working days; you will be notified by SMS once it is complete.
- To complete your request, please upload a copy of your national ID and the employer's salary certificate through the online portal.
- Pension eligibility depends on your total contribution period and age; I can check your current eligibility if you share your registration number.
- You can update your bank account details from your profile page or through Absher; changes take effect from the next payment cycle.
- Thank you for contacting us; is there anything else I can help you with today?

Knowledge base:
- Early retirement eligibility: Early retirement is available to members with at least 25 years of contributions. The pension is calculated on the average salary of the last 24 months. Applications are submitted online and reviewed within 10 working days.
- Survivor benefits for dependents: When a member passes away, eligible dependents may receive a survivor pension. Dependents must submit the death certificate and proof of relationship. The survivor pension is shared among eligible dependents.
- Reporting a work injury: Employers must report a work injury within 3 working days of the incident. The injured member receives a daily allowance during the treatment period. Medical reports should be uploaded through the employer portal.
- Unemployment insurance claims: Members who lose their job involuntarily can claim unemployment insurance within 90 days. The benefit is paid monthly for up to 12 months. Claimants must keep their job-seeker profile active.
- Registering a new employee: Employers register new employees within 15 days of their start date. Registration requires the national ID and the employment contract. Contributions start from the first month of employment.
- Requesting a contribution certificate: Members can download a contribution certificate from the online portal at any time. The certificate lists all registered employers and contribution periods. It is accepted by banks and government agencies.`,
    customDictionary: ['Absher', 'Mudad'],
    ignoredWords: ['pls'],
  },
  Arabic: {
    llmContext: `Agent:
- الاسم: خالد الحربي
- الفريق: خدمات المعاشات، المستوى الأول
- اللغات: العربية، الإنجليزية
- التوقيع: مع أطيب التحيات، خالد

Customer profile:
- الاسم: سارة العتيبي
- رقم التسجيل: 1093 5521 07
- مشترك منذ: 2011
- جهة العمل: شركة النور التجارية
- الجوال: +966 5X XXX 2208
- اللغة المفضلة: العربية
- وسيلة التواصل المفضلة: رسالة نصية

Conversation:
Customer: السلام عليكم، قدمت طلباً للحصول على مستندات المعاش الأسبوع الماضي، متى سيتم معالجته؟
Agent: وعليكم السلام سارة، شكراً لتواصلك. دعيني أتحقق من ذلك.
Customer: هل يمكنك أيضاً الاستعلام عن الاشتراكات الخاصة بي؟
Agent: بالتأكيد، سأتحقق منها أيضاً.
Customer: غيرت حسابي البنكي، كيف أحدث بياناتي؟

Case fields:
- رقم الحالة: CS-2026-048214
- الموضوع: طلب مستندات المعاش
- الفئة: المعاشات / المستندات
- الحالة: قيد المعالجة
- الأولوية: عادية
- تاريخ الفتح: 2026-10-08
- القسم: خدمات المعاشات

Canned responses:
- سجل الاشتراكات الخاص بك محدث، وتم تسجيل آخر دفعة من رواتب جهة عملك عبر منصة مدد.
- تم استلام طلبك وسيتم معالجته خلال ثلاثة أيام عمل، وستصلك رسالة نصية عند الانتهاء.
- لإكمال طلبك، يرجى رفع صورة من الهوية الوطنية وتعريف الراتب من جهة العمل عبر البوابة الإلكترونية.
- تعتمد أهلية المعاش على مدة الإشتراك الإجمالية والعمر، ويمكنني التحقق من أهليتك إذا زودتني برقم التسجيل.
- يمكنك تحديث بيانات الحساب البنكي من صفحة الملف الشخصي أو عبر أبشر، وتسري التغييرات من دورة الصرف القادمة.
- شكراً لتواصلك معنا، هل هناك أي شيء آخر يمكنني مساعدتك به اليوم؟

Knowledge base:
- أهلية التقاعد المبكر: يتاح التقاعد المبكر للمشتركين الذين أكملوا 25 سنة من الاشتراكات. يحسب المعاش على أساس متوسط الأجر لآخر 24 شهراً. تقدم الطلبات إلكترونياً وتتم مراجعتها خلال 10 أيام عمل.
- معاش المستحقين بعد الوفاة: عند وفاة المشترك يحق للمستحقين من أفراد أسرته الحصول على معاش. يجب على المستحقين تقديم شهادة الوفاة وإثبات صلة القرابة. يوزع المعاش بين المستحقين المؤهلين.
- الإبلاغ عن إصابة العمل: يجب على صاحب العمل الإبلاغ عن إصابة العمل خلال 3 أيام عمل من وقوعها. يحصل المشترك المصاب على بدل يومي خلال فترة العلاج. ترفع التقارير الطبية عبر بوابة صاحب العمل.
- التأمين ضد التعطل عن العمل: يحق للمشترك الذي فقد عمله بغير إرادته التقدم بطلب التعويض خلال 90 يوماً. يصرف التعويض شهرياً لمدة تصل إلى 12 شهراً. يجب على المتقدم إبقاء ملفه كباحث عن عمل نشطاً.
- تسجيل موظف جديد: يسجل صاحب العمل الموظفين الجدد خلال 15 يوماً من تاريخ مباشرتهم. يتطلب التسجيل الهوية الوطنية وعقد العمل. تبدأ الاشتراكات من الشهر الأول للعمل.
- طلب شهادة الاشتراك: يمكن للمشترك تحميل شهادة الاشتراك من البوابة الإلكترونية في أي وقت. توضح الشهادة جميع أصحاب العمل المسجلين وفترات الاشتراك. تقبل الشهادة لدى البنوك والجهات الحكومية.`,
    customDictionary: ['أبشر', 'مدد'],
    ignoredWords: ['انشالله'],
  },
  Russian: {
    llmContext: `Agent:
- Имя: Дмитрий Соколов
- Команда: Пенсионное обслуживание, первая линия
- Языки: русский, английский
- Подпись: С уважением, Дмитрий

Customer profile:
- Имя: Анна Петрова
- Регистрационный номер: 1093 5521 08
- Участник с: 2011
- Работодатель: ООО «Северный ветер»
- Телефон: +7 9XX XXX 31 74
- Предпочитаемый язык: русский
- Предпочитаемый способ связи: SMS

Conversation:
Customer: Здравствуйте, на прошлой неделе я подала заявку на получение пенсионных документов. Когда её обработают?
Agent: Здравствуйте, Анна, спасибо за обращение. Сейчас проверю.
Customer: А можете заодно посмотреть мои пенсионные взносы?
Agent: Конечно, проверю и их.
Customer: Я сменила банковский счёт. Как мне обновить данные?

Case fields:
- Номер обращения: CS-2026-048215
- Тема: Запрос пенсионных документов
- Категория: Пенсии / Документы
- Статус: В работе
- Приоритет: Обычный
- Открыто: 2026-10-08
- Очередь: Пенсионное обслуживание

Canned responses:
- Сведения о ваших взносах актуальны, последний платёж зачислен на ваш счёт.
- Ваша заявка принята и будет обработана в течение 3 рабочих дней; по завершении вы получите SMS.
- Чтобы завершить заявку, загрузите через личный кабинет копию паспорта и справку о зарплате от работодателя.
- Право на пенсию зависит от общего стажа взносов и возраста; я могу проверить его, если вы сообщите регистрационный номер.
- Реквизиты банковского счёта можно изменить в профиле или через Госуслуги; изменения вступят в силу со следующего платёжного периода.
- Спасибо за обращение! Могу ли я ещё чем-нибудь помочь?

Knowledge base:
- Право на досрочную пенсию: досрочная пенсия доступна участникам со стажем взносов не менее 25 лет. Пенсия рассчитывается по средней зарплате за последние 24 месяца. Заявления подаются онлайн и рассматриваются в течение 10 рабочих дней.
- Пенсия по потере кормильца: после смерти участника его иждивенцы могут получать пенсию. Им нужно предоставить свидетельство о смерти и документ, подтверждающий родство. Пенсия делится между всеми иждивенцами, имеющими на неё право.
- Сообщение о производственной травме: работодатель обязан сообщить о травме в течение 3 рабочих дней. Пострадавший получает ежедневное пособие на время лечения. Медицинские заключения загружаются через кабинет работодателя.
- Страхование по безработице: участник, потерявший работу не по своей воле, может подать заявление в течение 90 дней. Пособие выплачивается ежемесячно до 12 месяцев. Профиль соискателя должен оставаться активным.
- Регистрация нового сотрудника: работодатель регистрирует нового сотрудника в течение 15 дней с начала работы. Для регистрации нужны паспорт и трудовой договор. Взносы начисляются с первого месяца работы.
- Справка о взносах: участник может в любой момент скачать справку о взносах в личном кабинете. В справке указаны все работодатели и периоды взносов. Справку принимают банки и государственные органы.`,
    customDictionary: ['Госуслуги'],
    ignoredWords: ['щас'],
  },
};

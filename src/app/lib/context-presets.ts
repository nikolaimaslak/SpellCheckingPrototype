export interface ContextPreset {
  conversation: string;
  canned: string;
  kb: string;
}

export const CONTEXT_PRESETS: Record<string, ContextPreset> = {
  English: {
    conversation: [
      'Customer: Hello, I submitted a request for my pension documents last week. When will it be processed?',
      'Customer: Also, can you check the status of my contribution records?',
      'Customer: I changed my bank account. How do I update my details?',
    ].join('\n'),
    canned: [
      'Your contribution records are up to date, and the latest payment has been registered on your account.',
      'Your request has been received and will be processed within 3 working days; you will be notified by SMS once it is complete.',
      "To complete your request, please upload a copy of your national ID and the employer's salary certificate through the online portal.",
      'Pension eligibility depends on your total contribution period and age; I can check your current eligibility if you share your registration number.',
      'You can update your bank account details from your profile page; changes take effect from the next payment cycle.',
      'Thank you for contacting us; is there anything else I can help you with today?',
    ].join('\n'),
    kb: [
      'Early retirement eligibility: Early retirement is available to members with at least 25 years of contributions. The pension is calculated on the average salary of the last 24 months. Applications are submitted online and reviewed within 10 working days.',
      'Survivor benefits for dependents: When a member passes away, eligible dependents may receive a survivor pension. Dependents must submit the death certificate and proof of relationship. The survivor pension is shared among eligible dependents.',
      'Reporting a work injury: Employers must report a work injury within 3 working days of the incident. The injured member receives a daily allowance during the treatment period. Medical reports should be uploaded through the employer portal.',
      'Unemployment insurance claims: Members who lose their job involuntarily can claim unemployment insurance within 90 days. The benefit is paid monthly for up to 12 months. Claimants must keep their job-seeker profile active.',
      'Registering a new employee: Employers register new employees within 15 days of their start date. Registration requires the national ID and the employment contract. Contributions start from the first month of employment.',
      'Requesting a contribution certificate: Members can download a contribution certificate from the online portal at any time. The certificate lists all registered employers and contribution periods. It is accepted by banks and government agencies.',
    ].join('\n'),
  },
  Arabic: {
    conversation: [
      'Customer: السلام عليكم، قدمت طلباً للحصول على مستندات المعاش الأسبوع الماضي، متى سيتم معالجته؟',
      'Customer: هل يمكنك أيضاً الاستعلام عن الاشتراكات الخاصة بي؟',
      'Customer: غيرت حسابي البنكي، كيف أحدث بياناتي؟',
    ].join('\n'),
    canned: [
      'سجل الاشتراكات الخاص بك محدث، وتم تسجيل آخر دفعة في حسابك.',
      'تم استلام طلبك وسيتم معالجته خلال ثلاثة أيام عمل، وستصلك رسالة نصية عند الانتهاء.',
      'لإكمال طلبك، يرجى رفع صورة من الهوية الوطنية وتعريف الراتب من جهة العمل عبر البوابة الإلكترونية.',
      'تعتمد أهلية المعاش على مدة الإشتراك الإجمالية والعمر، ويمكنني التحقق من أهليتك إذا زودتني برقم التسجيل.',
      'يمكنك تحديث بيانات الحساب البنكي من صفحة الملف الشخصي، وتسري التغييرات من دورة الصرف القادمة.',
      'شكراً لتواصلك معنا، هل هناك أي شيء آخر يمكنني مساعدتك به اليوم؟',
    ].join('\n'),
    kb: [
      'أهلية التقاعد المبكر: يتاح التقاعد المبكر للمشتركين الذين أكملوا 25 سنة من الاشتراكات. يحسب المعاش على أساس متوسط الأجر لآخر 24 شهراً. تقدم الطلبات إلكترونياً وتتم مراجعتها خلال 10 أيام عمل.',
      'معاش المستحقين بعد الوفاة: عند وفاة المشترك يحق للمستحقين من أفراد أسرته الحصول على معاش. يجب على المستحقين تقديم شهادة الوفاة وإثبات صلة القرابة. يوزع المعاش بين المستحقين المؤهلين.',
      'الإبلاغ عن إصابة العمل: يجب على صاحب العمل الإبلاغ عن إصابة العمل خلال 3 أيام عمل من وقوعها. يحصل المشترك المصاب على بدل يومي خلال فترة العلاج. ترفع التقارير الطبية عبر بوابة صاحب العمل.',
      'التأمين ضد التعطل عن العمل: يحق للمشترك الذي فقد عمله بغير إرادته التقدم بطلب التعويض خلال 90 يوماً. يصرف التعويض شهرياً لمدة تصل إلى 12 شهراً. يجب على المتقدم إبقاء ملفه كباحث عن عمل نشطاً.',
      'تسجيل موظف جديد: يسجل صاحب العمل الموظفين الجدد خلال 15 يوماً من تاريخ مباشرتهم. يتطلب التسجيل الهوية الوطنية وعقد العمل. تبدأ الاشتراكات من الشهر الأول للعمل.',
      'طلب شهادة الاشتراك: يمكن للمشترك تحميل شهادة الاشتراك من البوابة الإلكترونية في أي وقت. توضح الشهادة جميع أصحاب العمل المسجلين وفترات الاشتراك. تقبل الشهادة لدى البنوك والجهات الحكومية.',
    ].join('\n'),
  },
};

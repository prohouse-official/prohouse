// ==================== محرك الذكاء الاصطناعي لتوقع كميات طلبية الغد ====================
// يقدم توصيات ذكية لكل صنف بناءً على استهلاك الأسابيع السابقة في نفس اليوم من الأسبوع

const ForecastEngine = {
  // تخزين مؤقت للتحليلات لمنع التكرار
  cache: {},

  // الحصول على تاريخ بداية النطاق (مثلاً قبل 35 يوماً من اليوم)
  getHistoryStartDate(targetDateStr) {
    return addDaysStr(targetDateStr, -35);
  },

  // تحليل جلب واستخراج متوسطات الأصناف
  async getRecommendations(targetDateStr, branchName) {
    if (!branchName) return {};

    const cacheKey = `${targetDateStr}:${branchName}`;
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    const startDate = this.getHistoryStartDate(targetDateStr);
    const endDate = addDaysStr(targetDateStr, -1); // الأيام السابقة فقط

    // جلب التقرير للفترة التاريخية
    let reportData = null;
    try {
      reportData = await Sync.get("getReport", { start: startDate, end: endDate }, `report:${startDate}:${endDate}`);
    } catch (e) {
      console.warn("ForecastEngine: تعذر جلب السجل التاريخي للتقرير", e);
    }

    if (!reportData || !reportData.days || !reportData.days.length) {
      return {};
    }

    // تصفية أيام الفرع المطلوب فقط
    const branchDays = reportData.days.filter(d => d.branch === branchName);
    if (!branchDays.length) return {};

    // يوم الأسبوع بحساب UTC (جوال بمنطقة زمنية تانية كان يطلّع يوم غلط)
    const weekday = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
    const targetDayOfWeek = weekday(targetDateStr); // 0 = الأحد, 1 = الاثنين...

    // تجميع البيانات لكل صنف
    const itemSameDayStats = {}; // itemId -> { totalConsumed, count }
    const itemOverallStats = {}; // itemId -> { totalConsumed, count }

    branchDays.forEach(day => {
      const isSameDayOfWeek = weekday(day.date) === targetDayOfWeek;

      (day.items || []).forEach(it => {
        // الاستهلاك = المستلم − المتبقي آخر اليوم. (قبل كان المستلم − المرتجع، والمرتجع دايماً صفر،
        // فالمقترح كان = المستلم + ١٠٪ ويكبر كل أسبوع.) يوم ما انجرد فيه الصنف ما ينحسب.
        const rec = Number(it.received) || 0;
        const left = it.remainingWeight != null && it.remainingWeight !== "" ? it.remainingWeight : it.remaining;
        if (left === null || left === undefined || left === "") return;
        const netConsumed = Math.max(0, rec - (Number(left) || 0) - (Number(it.returned) || 0));

        // تجميع العام
        if (!itemOverallStats[it.itemId]) {
          itemOverallStats[it.itemId] = { totalConsumed: 0, count: 0 };
        }
        itemOverallStats[it.itemId].totalConsumed += netConsumed;
        itemOverallStats[it.itemId].count += 1;

        // تجميع نفس اليوم من الأسبوع
        if (isSameDayOfWeek) {
          if (!itemSameDayStats[it.itemId]) {
            itemSameDayStats[it.itemId] = { totalConsumed: 0, count: 0 };
          }
          itemSameDayStats[it.itemId].totalConsumed += netConsumed;
          itemSameDayStats[it.itemId].count += 1;
        }
      });
    });

    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const dayNameAr = dayNames[targetDayOfWeek] || "اليوم";

    const recommendations = {};

    // حساب التوصيات لكل صنف
    Items.current.forEach(item => {
      const sameDayData = itemSameDayStats[item.id];
      const overallData = itemOverallStats[item.id];

      let avgConsumed = 0;
      let reason = "";

      if (sameDayData && sameDayData.count > 0) {
        avgConsumed = sameDayData.totalConsumed / sameDayData.count;
        reason = `بناءً على متوسط أيام ${dayNameAr} السابقة (${sameDayData.count} أيام)`;
      } else if (overallData && overallData.count > 0) {
        avgConsumed = overallData.totalConsumed / overallData.count;
        reason = `بناءً على متوسط الاستهلاك اليومي العام (آخر 30 يوماً)`;
      } else {
        return; // لا يوجد سياق تاريخي كافي لهذا الصنف
      }

      // إضافة هامش أمان بنسبة 10% والتدوير لأقرب عدد صحيح أوجب
      const safeQty = Math.ceil(avgConsumed * 1.1);

      if (safeQty > 0) {
        recommendations[item.id] = {
          qty: safeQty,
          avg: Math.round(avgConsumed * 10) / 10,
          reason: reason
        };
      }
    });

    this.cache[cacheKey] = recommendations;
    return recommendations;
  }
};

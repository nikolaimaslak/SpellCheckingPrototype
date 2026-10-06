<!-- Reference run of the retired completion benchmark on the Node server, before the Python/DSPy server (change dspy-assist-service).
     Commit: 49d0f86 · Model: gemini-3.5-flash-lite · Date: 2026-10-06 · Command: npm run eval:completion (5 samples per case) -->

# Completion benchmark

Model **gemini-3.5-flash-lite** · 5 samples per case · 60 cases · dataset `1928e6a4f5ca` · 2026-10-06T20:16:23.231Z

## Criteria

| Criterion | Value | Threshold | Baseline | Meets threshold |
|---|---:|---:|---:|---|
| Seam word correct (shown samples) | 100.0% | ≥ 90.0% | 100.0% | yes |
| Seam word correct, Arabic (shown samples) | 100.0% | ≥ 85.0% | 100.0% | yes |
| Spacing errors at the seam (shown samples) | 0.0% | ≤ 2.0% | 0.0% | yes |
| Invented details (shown samples) | 0.7% | ≤ 2.0% | 0.0% | yes |
| Withheld as format | 37.7% | ≤ 15.0% | 34.0% | **no** |
| Suggestion shown | 50.0% | ≥ 70.0% | 55.3% | **no** |
| Failed or timed-out requests (threshold only) | 0.0% | ≤ 2.0% | 0.0% | yes |
| Cases whose samples agree on shown (threshold only) | 66.7% | ≥ 35.0% | 55.0% | yes |
| Latency p95 (ms) (threshold only) | 1161 ms | ≤ 2000 ms | 955 ms | yes |

## By language

| Metric | en | ar | mixed | all |
|---|---:|---:|---:|---:|
| Samples | 160 | 90 | 50 | 300 |
| Shown | 48.8% | 51.1% | 52.0% | 50.0% |
| Withheld: format | 42.5% | 32.2% | 32.0% | 37.7% |
| Errors | 0.0% | 0.0% | 0.0% | 0.0% |
| Seam word correct | 100.0% | 100.0% | 100.0% | 100.0% |
| Spacing errors | 0.0% | 0.0% | 0.0% | 0.0% |
| Invented details | 0.0% | 0.0% | 3.8% | 0.7% |
| Shown agreement | 78.1% | 61.1% | 40.0% | 66.7% |
| Distinct completions per case | 1.47 | 1.78 | 1.40 | 1.55 |
| Latency p50 (ms) | 704 | 649 | 644 | 681 |
| Latency p95 (ms) | 1214 | 962 | 1180 | 1161 |

## By category

| Metric | mid-word | finished-word | after-punctuation | after-space | new-sentence | details |
|---|---:|---:|---:|---:|---:|---:|
| Samples | 110 | 65 | 40 | 30 | 25 | 30 |
| Shown | 40.0% | 46.2% | 77.5% | 73.3% | 16.0% | 63.3% |
| Withheld: format | 60.0% | 49.2% | 10.0% | 0.0% | 0.0% | 36.7% |
| Errors | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| Seam word correct | 100.0% | 100.0% | – | – | – | 100.0% |
| Spacing errors | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| Invented details | 0.0% | 3.3% | 0.0% | 0.0% | 0.0% | 0.0% |
| Shown agreement | 77.3% | 61.5% | 62.5% | 83.3% | 60.0% | 33.3% |
| Distinct completions per case | 1.14 | 1.31 | 2.25 | 2.50 | 0.40 | 2.67 |
| Latency p50 (ms) | 697 | 692 | 670 | 690 | 620 | 674 |
| Latency p95 (ms) | 1111 | 1204 | 908 | 1584 | 744 | 1180 |

## Wrong seam words

None.

## Unstable cases (shown in some samples only)

| Case | Shown | Format | Errors | Example |
|---|---:|---:|---:|---|
| en-fin-account | 1/5 | 4 | 0 | " up to date, and the latest payment has been registered on your account." |
| ar-fin-with-us | 1/5 | 4 | 0 | "، هل هناك أي شيء آخر يمكنني مساعدتك به اليوم؟" |
| ar-punct-comma | 1/5 | 4 | 0 | " عذراً، نحن مؤسسة تأمينات اجتماعية ولا نقدم خدمات توصيل الحقائب، يرجى مراجعة جهة الشحن المختصة." |
| ar-punct-colon | 1/5 | 0 | 0 | " عذراً على الصعوبة التي تواجهها، يرجى محاولة استخدام متصفح آخر أو مسح ذاكرة التخزين المؤقت." |
| ar-sent-solved | 1/5 | 0 | 0 | "هل تحتاج إلى أي مساعدة أخرى؟" |
| mx-det-email | 1/5 | 4 | 0 | " بريدك الإلكتروني المسجل لدينا." |
| en-mid-leibniz | 2/5 | 3 | 0 | "niz would have agreed." |
| en-space-patience | 2/5 | 0 | 0 | "while I look into this for you." |
| en-det-email | 2/5 | 3 | 0 | " sam.lee@example.com." |
| ar-mid-electronic | 2/5 | 3 | 0 | "ني." |
| ar-fin-from | 2/5 | 1 | 0 | " طلبك، يرجى تزويدي برقم الطلب." |
| mx-fin-again | 2/5 | 3 | 0 | " المحاولة مرة أخرى." |
| en-det-charges | 3/5 | 2 | 0 | " 49.99 on your account." |
| ar-mid-details | 3/5 | 2 | 0 | "صيل قريباً." |
| mx-mid-app | 3/5 | 2 | 0 | "ر." |
| mx-sent-ticket | 3/5 | 0 | 0 | "وسيتم التواصل معك قريباً." |
| mx-det-order | 3/5 | 2 | 0 | " 4471 قيد المعالجة وسيتم الرد عليك قريباً." |
| en-mid-method | 4/5 | 1 | 0 | "od." |
| en-fin-delay | 4/5 | 0 | 0 | ", let me check the status of your order for you." |
| mx-punct-reset | 4/5 | 0 | 0 | " reset يرجى النقر عليه لإعادة تعيين كلمة المرور." |

## Never shown

| Case | Format | Errors |
|---|---:|---:|
| en-mid-patience | 5/5 | 0 |
| en-mid-order | 5/5 | 0 |
| en-mid-department | 5/5 | 0 |
| en-mid-address | 5/5 | 0 |
| en-mid-ollama | 5/5 | 0 |
| en-mid-today | 5/5 | 0 |
| en-mid-frustration | 5/5 | 0 |
| en-mid-weekend | 5/5 | 0 |
| en-fin-us | 5/5 | 0 |
| en-fin-the | 5/5 | 0 |
| en-fin-for | 5/5 | 0 |
| en-sent-restart | 0/5 | 0 |
| en-sent-refund | 0/5 | 0 |
| ar-mid-help | 5/5 | 0 |
| ar-mid-password | 5/5 | 0 |
| ar-fin-delay | 5/5 | 0 |
| ar-sent-refund | 0/5 | 0 |
| mx-mid-browser | 5/5 | 0 |
| mx-space-cache | 0/5 | 0 |

## Invented details

| Case | Details | Example |
|---|---|---|
| mx-fin-en-order | 3, 5 | " shortly." |

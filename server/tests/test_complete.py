"""POST /v1/complete, case for case with the former test/server/complete.test.ts."""

import asyncio
import json

import litellm

from assist.complete import CompletionDeps, complete
from assist.lm import build_lm
from assist.programs import build_programs
from assist.retrieval import load_kb, load_library
from assist.settings import select_model
from tests.helpers import client, fake_client

BODY = {
    "prefix": "Thank you for contacting us, your request",
    "transcript": [{"role": "customer", "text": "I submitted a request for my documents, when will it be processed?"}],
    "sources": {"transcript": True, "canned": True},
}


def answer(continuation: str) -> str:
    return json.dumps({"continuation": continuation}, ensure_ascii=False)


def events(tmp_path):
    """The completion events in the log; the service's text-free llm-* counters are tested in test_capture.py."""
    f = tmp_path / "telemetry" / "events.jsonl"
    rows = [json.loads(line) for line in f.read_text("utf-8").splitlines()] if f.exists() else []
    return [e for e in rows if not e["type"].startswith("llm-")]


class TestEndpoint:
    def test_replies_with_completion_language_latency_model_and_sources(self, tmp_path):
        res = fake_client(tmp_path).post("/v1/complete", json=BODY)
        assert res.status_code == 200
        reply = res.json()
        assert (reply["lang"], reply["model"]) == ("en", "fake")
        assert reply["completion"].startswith(" has been received")
        assert reply["sources"][0] == "en-request-processing"
        assert reply["latencyMs"] >= 0

    def test_retrieves_nothing_when_canned_responses_are_disabled(self, tmp_path, scripted):
        scripted.answer(answer(" will be processed."))
        res = client(tmp_path).post("/v1/complete", json={**BODY, "sources": {"transcript": True, "canned": False}})
        assert res.json()["sources"] == []
        assert "[[ ## approved_responses ## ]]\n[]" in scripted.user_message
        assert "I submitted a request for my documents" in scripted.user_message

    def test_returns_an_empty_completion_when_post_processing_rejects_the_output(self, tmp_path, scripted):
        scripted.answer(answer(" and will be processed."))
        res = client(tmp_path).post("/v1/complete", json={**BODY, "prefix": "تم استلام طلبك"})
        assert res.status_code == 200 and res.json()["completion"] == ""

    def test_answers_503_without_a_model(self, tmp_path):
        res = client(tmp_path, {"COMPLETION_MODEL": "gemini"}).post("/v1/complete", json=BODY)
        assert res.status_code == 503 and "unavailable" in res.json()["error"]

    def test_answers_502_on_model_failure_without_leaking_details(self, tmp_path, scripted):
        scripted.answer(litellm.exceptions.AuthenticationError(message="401 key=SECRET", model="m", llm_provider="gemini"))
        res = client(tmp_path).post("/v1/complete", json=BODY)
        assert res.status_code == 502
        assert "SECRET" not in res.text

    def test_answers_504_on_timeout(self, scripted):
        scripted.answer(answer(" ok."))
        scripted.delay = 0.5
        program, _ = build_programs(None, fake=False)
        deps = CompletionDeps(program, build_lm(select_model({"GEMINI_API_KEY": "k"})[0], False), True, "x", load_library(), timeout=0.05)
        status, body = asyncio.run(complete(BODY, deps))
        assert (status, body) == (504, {"error": "completion model timed out"})

    def test_rejects_a_missing_prefix(self, tmp_path):
        assert fake_client(tmp_path).post("/v1/complete", json={"transcript": []}).status_code == 400

    def test_rejects_a_too_long_prefix(self, tmp_path):
        res = fake_client(tmp_path).post("/v1/complete", json={"prefix": "x" * 2001})
        assert (res.status_code, res.json()) == (400, {"error": "prefix too long"})

    def test_drops_malformed_turns_and_keeps_the_last_50(self, tmp_path, scripted):
        turns = [{"role": "customer", "text": f"turn {i}"} for i in range(60)] + [{"role": "bot", "text": "x"}, "junk", {"role": "agent"}]
        scripted.answer(answer(""))
        client(tmp_path).post("/v1/complete", json={"prefix": "Thank you ", "transcript": turns})
        sent = scripted.user_message
        assert '"turn 10"' in sent and '"turn 9"' not in sent and '"bot"' not in sent


class TestKnowledgeBase:
    def ask(self, customer, kb_on=True):
        return {
            "prefix": "Your early retirement application",
            "transcript": [{"role": "customer", "text": customer}],
            "sources": {"transcript": True, "canned": True, "kb": kb_on},
        }

    def test_adds_passages_and_lists_kb_ids_on_a_strong_match(self, tmp_path, scripted):
        scripted.answer(answer(" will be reviewed within 10 working days."))
        res = client(tmp_path).post("/v1/complete", json=self.ask("Am I eligible for early retirement? I have 26 years of contributions."))
        assert any(s.startswith("kb:en-early-retirement") for s in res.json()["sources"])
        assert "Early retirement eligibility:" in scripted.user_message

    def test_adds_nothing_on_a_weak_match(self, tmp_path, scripted):
        scripted.answer(answer(" will be reviewed."))
        res = client(tmp_path).post("/v1/complete", json=self.ask("Hello, good morning"))
        assert not any(s.startswith("kb:") for s in res.json()["sources"])
        assert "[[ ## knowledge_base ## ]]\n[]" in scripted.user_message

    def test_adds_nothing_when_the_kb_source_is_off(self, tmp_path, scripted):
        scripted.answer(answer(" will be reviewed."))
        client(tmp_path).post("/v1/complete", json=self.ask("Am I eligible for early retirement? I have 26 years of contributions.", kb_on=False))
        assert "[[ ## knowledge_base ## ]]\n[]" in scripted.user_message

    def test_the_fake_model_falls_back_to_a_knowledge_base_passage(self, tmp_path):
        res = fake_client(tmp_path).post(
            "/v1/complete",
            json={
                "prefix": "Early retirement is",
                "transcript": [{"role": "customer", "text": "Am I eligible for early retirement? I have 26 years of contributions."}],
                "sources": {"transcript": True, "canned": False, "kb": True},
            },
        )
        assert "available to members" in res.json()["completion"]


class TestNoContentFilter:
    def test_returns_the_canned_3_working_days_completion_and_reports_nothing(self, tmp_path):
        res = fake_client(tmp_path).post("/v1/complete", json=BODY).json()
        assert "within 3 working days" in res["completion"]
        assert "withheld" not in res
        assert events(tmp_path) == []

    def test_returns_names_identifiers_dates_and_timelines_as_written(self, tmp_path, scripted):
        named = {**BODY, "prefix": "Thank you,", "transcript": [{"role": "customer", "text": "Hello, this is Noura, my email is noura@example.com"}]}
        c = client(tmp_path)
        for rest in (" Noura, we will write to noura@example.com.", " it will be ready next week.", " see www.gosi.gov.sa for details."):
            scripted.answer(answer(rest))
            res = c.post("/v1/complete", json=named).json()
            assert res["completion"] == rest and "withheld" not in res
        assert events(tmp_path) == []

    def test_returns_an_arabic_timeline(self, tmp_path, scripted):
        scripted.answer(answer(" وسيتم معالجته خلال ثلاثة أيام عمل."))
        res = client(tmp_path).post("/v1/complete", json={**BODY, "prefix": "تم استلام طلبك،"}).json()
        assert res["completion"] == " وسيتم معالجته خلال ثلاثة أيام عمل." and "withheld" not in res

    def test_sends_a_mixed_customer_message_unredacted_and_returns_its_email(self, tmp_path, scripted):
        msg = "رقم طلبي 4471 والبريد noura@example.com"
        scripted.answer(answer(" noura@example.com."))
        res = client(tmp_path).post(
            "/v1/complete", json={"prefix": "شكراً، سنرسل التحديث إلى", "transcript": [{"role": "customer", "text": msg}]}
        ).json()
        assert msg in scripted.user_message
        assert res["completion"] == " noura@example.com."

    def test_only_ever_reports_format_never_text(self, tmp_path, scripted):
        scripted.answer("not json")
        client(tmp_path).post("/v1/complete", json=BODY)
        assert [{k: v for k, v in e.items() if k != "ts"} for e in events(tmp_path)] == [
            {"type": "completion-withheld", "lang": "en", "reason": "format"}
        ]


class TestTesterGuideScenarios:
    EN = [
        "Hello, I submitted a request for my pension documents last week. When will it be processed?",
        "Also, can you check the status of my contribution records?",
    ]
    AR = ["السلام عليكم، قدمت طلباً للحصول على مستندات المعاش الأسبوع الماضي، متى سيتم معالجته؟", "هل يمكنك أيضاً الاستعلام عن الاشتراكات الخاصة بي؟"]

    def ask(self, tmp_path, prefix, turns):
        body = {"prefix": prefix, "transcript": [{"role": "customer", "text": t} for t in turns], "sources": {"transcript": True, "canned": True, "kb": True}}
        return fake_client(tmp_path).post("/v1/complete", json=body).json()

    def test_t4_2_and_t4_7_contribution_records(self, tmp_path):
        assert self.ask(tmp_path, "Thank you for waiting, your contribution records", self.EN)["completion"].startswith(" are up to date")
        assert "محدث" in self.ask(tmp_path, "شكراً لانتظارك، سجل الاشتراكات الخاص بك", self.AR)["completion"]

    def test_t4_14_three_working_days_in_english_and_arabic(self, tmp_path):
        en = self.ask(tmp_path, "Thank you for contacting us, your request", self.EN[:1])
        assert "within 3 working days" in en["completion"] and "withheld" not in en
        assert "ثلاثة أيام عمل" in self.ask(tmp_path, "شكراً لتواصلك معنا، تم استلام طلبك", self.AR[:1])["completion"]

    def test_t4_17_mid_word(self, tmp_path):
        res = self.ask(tmp_path, "Your contribution rec", self.EN)
        assert res["completion"] == "ords are up to date, and the latest payment has been registered on your account."


class TestUnfinishedWords:
    FIRST = [{"role": "customer", "text": "Hello, I submitted a request for my pension documents last week. When will it be processed?"}]

    def test_completes_the_word_with_no_leading_space_with_the_offline_model(self, tmp_path):
        res = fake_client(tmp_path).post("/v1/complete", json={"prefix": "It hasn't been proce", "transcript": self.FIRST}).json()
        assert res["completion"].startswith("ssed within 3 working days")
        assert (res["edit"]["typed"], res["edit"]["word"]) == ("proce", "processed")
        assert res["edit"]["rest"].startswith(" within 3 working days")

    def test_continues_after_a_whole_word_the_model_repeats(self, tmp_path, scripted):
        scripted.answer(answer(" has been received and is being reviewed."))
        res = client(tmp_path).post("/v1/complete", json=BODY).json()
        assert res["completion"] == " has been received and is being reviewed."
        assert res["edit"] == {"typed": "request", "word": "request", "rest": " has been received and is being reviewed."}

    def test_completes_a_word_no_dictionary_or_approved_text_knows(self, tmp_path, scripted):
        scripted.answer(answer("r app now."))
        assert client(tmp_path).post("/v1/complete", json={**BODY, "prefix": "Please use the Abshe"}).json()["completion"] == "r app now."

    def test_completes_a_name_from_the_conversation(self, tmp_path, scripted):
        scripted.answer(answer("a, I can help you."))
        res = client(tmp_path).post(
            "/v1/complete", json={"prefix": "Before jumping into Ollam", "transcript": [{"role": "customer", "text": "How does Ollama work?"}]}
        ).json()
        assert res["completion"] == "a, I can help you."
        assert res["edit"] == {"typed": "Ollam", "word": "Ollama", "rest": ", I can help you."}
        assert "withheld" not in res and events(tmp_path) == []

    def test_withholds_and_reports_only_unusable_output(self, tmp_path, scripted):
        c = client(tmp_path)
        for raw in (" n easily confused.", '{"text": " n easily confused."}', '{"continuation": 5}'):
            scripted.answer(raw)
            res = c.post("/v1/complete", json={**BODY, "prefix": "you could have be"}).json()
            assert (res["completion"], res["withheld"]) == ("", "format")
            assert "edit" not in res
        assert [(e["reason"], e["lang"]) for e in events(tmp_path)] == [("format", "en")] * 3

    def test_shows_the_models_join_as_written(self, tmp_path, scripted):
        # Not checked against a dictionary (known issue KI-6): "be" + "n" reads "ben".
        scripted.answer(answer("n easily confused."))
        res = client(tmp_path).post("/v1/complete", json={**BODY, "prefix": "you could have be"}).json()
        assert res["completion"] == "n easily confused." and "withheld" not in res
        assert res["edit"] == {"typed": "be", "word": "ben", "rest": " easily confused."}

    def test_drops_the_unfinished_word_written_again(self, tmp_path, scripted):
        scripted.answer(answer("been easily confused."))
        res = client(tmp_path).post("/v1/complete", json={**BODY, "prefix": "you could have be"}).json()
        assert res["completion"] == "en easily confused."
        assert res["edit"] == {"typed": "be", "word": "been", "rest": " easily confused."}

    def test_treats_an_empty_answer_as_nothing_to_add_not_a_format_failure(self, tmp_path, scripted):
        scripted.answer(answer(""))
        res = client(tmp_path).post("/v1/complete", json=BODY).json()
        assert res["completion"] == "" and "withheld" not in res and events(tmp_path) == []

    def test_describes_the_shortened_text_in_the_edit_after_a_sentence_cut(self, tmp_path, scripted):
        scripted.answer(answer(" has been received. Anything else?"))
        res = client(tmp_path).post("/v1/complete", json=BODY).json()
        assert res["completion"] == " has been received."
        assert res["edit"] == {"typed": "request", "word": "request", "rest": " has been received."}

    def test_completes_a_mid_word_fragment_with_canned_and_kb_sources_off(self, tmp_path, scripted):
        scripted.answer(answer("ssed yet, but it is under review."))
        res = client(tmp_path).post(
            "/v1/complete", json={"prefix": "It hasn't been proce", "transcript": self.FIRST, "sources": {"transcript": True, "canned": False, "kb": False}}
        ).json()
        assert res["completion"] == "ssed yet, but it is under review." and "withheld" not in res

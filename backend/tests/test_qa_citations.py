def test_citation_schema_has_index():
    from app.api.schemas import Citation
    c = Citation(source_type="vector", filename="test.py", index=1, content_preview="def foo")
    assert c.index == 1
    assert c.content_preview == "def foo"


def test_generator_prompt_includes_citation_instruction():
    from app.engine.rag.generator import RAGGenerator
    from unittest.mock import AsyncMock
    gen = RAGGenerator(openai_client=AsyncMock())
    prompt = gen.build_prompt("test question", "test context", "vector_query", [])
    assert "[1]" in prompt["system"] or "[1]" in prompt["user"]

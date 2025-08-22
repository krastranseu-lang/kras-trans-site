import sys
from pathlib import Path

import pytest

# Ensure project root is on the Python path for imports
sys.path.append(str(Path(__file__).resolve().parents[1]))
from tools.menu_builder import _sanitize_href


def test_internal_without_trailing_slash():
    assert _sanitize_href('/foo', 'pl', 'Foo') == '/foo/'


def test_internal_with_trailing_slash():
    assert _sanitize_href('/foo/', 'pl', 'Foo') == '/foo/'


def test_internal_with_query_no_trailing_slash():
    assert _sanitize_href('/foo?x=1', 'pl', 'Foo') == '/foo/?x=1'


def test_internal_with_anchor_no_trailing_slash():
    assert _sanitize_href('/foo#bar', 'pl', 'Foo') == '/foo/#bar'
